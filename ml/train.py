#!/usr/bin/env python3
"""
Stage 3 — baseline classifier on the Stage 2 CSV.

Usage:
  pip install -r ml/requirements.txt
  python ml/train.py

Reads:  ml/data/training_dataset.csv  (refuses *_PREVIEW.csv by default)
Writes: ml/models/baseline_classifier.joblib
        ml/models/baseline_metrics.json
        ml/models/feature_importance.csv

Design choices for this small / imbalanced set:
  - Time-ordered 80/20 split (no shuffle) — avoid leaking future into train
  - class_weight="balanced" — ~14% win rate
  - Report precision/recall/F1 on the win class, not just accuracy
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedShuffleSplit
from sklearn.utils.class_weight import compute_sample_weight

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "training_dataset.csv"
PREVIEW_PATH = ROOT / "data" / "training_dataset_PREVIEW.csv"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "baseline_classifier.joblib"
METRICS_PATH = MODEL_DIR / "baseline_metrics.json"
IMPORTANCE_PATH = MODEL_DIR / "feature_importance.csv"

# Non-feature columns from Stage 2 extract
META_COLS = {
    "label",
    "outcome",
    "rMultiple",
    "pair",
    "direction",
    "confidenceTier",
    "timeframe",
    "createdAt",
}

MIN_ROWS = 300
TEST_FRACTION = 0.2
MIN_TEST_WINS = 2


def load_dataset(allow_preview: bool = False) -> pd.DataFrame:
    path = DATA_PATH
    if not path.exists():
        if allow_preview and PREVIEW_PATH.exists():
            print(
                f"WARNING: using PREVIEW file {PREVIEW_PATH} — not for real Stage 3 decisions."
            )
            path = PREVIEW_PATH
        else:
            print(
                f"Missing {DATA_PATH}. Run: npm run extract-training-data",
                file=sys.stderr,
            )
            sys.exit(1)

    if "PREVIEW" in path.name and not allow_preview:
        print(
            f"Refusing to train on preview dataset ({path.name}). "
            "Need 300+ resolved rows and training_dataset.csv.",
            file=sys.stderr,
        )
        sys.exit(1)

    df = pd.read_csv(path)
    if len(df) < MIN_ROWS and not allow_preview:
        print(
            f"Only {len(df)} rows (< {MIN_ROWS}). Collect more data before training.",
            file=sys.stderr,
        )
        sys.exit(1)
    return df


def feature_matrix(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    y = df["label"].astype(int)
    feature_cols = [c for c in df.columns if c not in META_COLS]
    X = df[feature_cols].apply(pd.to_numeric, errors="coerce")
    # Any leftover NaNs (e.g. empty rMultiple was excluded; features should be filled)
    X = X.fillna(X.median(numeric_only=True)).fillna(0)
    return X, y


def split_train_test(
    X: pd.DataFrame, y: pd.Series, test_fraction: float
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series, str]:
    """Prefer time-ordered split; fall back to stratified shuffle if test lacks wins."""
    n = len(X)
    cut = max(1, int(n * (1 - test_fraction)))
    if cut >= n:
        cut = n - 1
    X_train, X_test = X.iloc[:cut], X.iloc[cut:]
    y_train, y_test = y.iloc[:cut], y.iloc[cut:]
    if int(y_test.sum()) >= MIN_TEST_WINS and int((y_test == 0).sum()) >= 1:
        return X_train, X_test, y_train, y_test, "time_ordered"

    print(
        f"WARNING: time-ordered test has only {int(y_test.sum())} win(s) "
        f"(need >={MIN_TEST_WINS}). Falling back to stratified shuffle split."
    )
    sss = StratifiedShuffleSplit(
        n_splits=1, test_size=test_fraction, random_state=42
    )
    train_idx, test_idx = next(sss.split(X, y))
    return (
        X.iloc[train_idx],
        X.iloc[test_idx],
        y.iloc[train_idx],
        y.iloc[test_idx],
        "stratified_shuffle",
    )


def main() -> None:
    allow_preview = "--allow-preview" in sys.argv
    df = load_dataset(allow_preview=allow_preview)

    # Ensure chronological order if createdAt present
    if "createdAt" in df.columns:
        df = df.sort_values("createdAt").reset_index(drop=True)

    X, y = feature_matrix(df)
    X_train, X_test, y_train, y_test, split_mode = split_train_test(
        X, y, TEST_FRACTION
    )

    win_rate = float(y.mean())
    print("--- Stage 3 baseline ---")
    print(f"rows={len(df)}  features={X.shape[1]}  win_rate={win_rate:.1%}")
    print(f"split={split_mode}")
    print(
        f"train={len(X_train)} (wins={int(y_train.sum())})  "
        f"test={len(X_test)} (wins={int(y_test.sum())})"
    )

    # HistGradientBoosting supports sample_weight; good default for tabular + null-ish data
    sample_weight = compute_sample_weight(class_weight="balanced", y=y_train)
    model = HistGradientBoostingClassifier(
        max_depth=4,
        learning_rate=0.08,
        max_iter=200,
        min_samples_leaf=15,
        random_state=42,
    )
    model.fit(X_train, y_train, sample_weight=sample_weight)

    proba = model.predict_proba(X_test)[:, 1]
    pred_05 = (proba >= 0.5).astype(int)

    precision = precision_score(y_test, pred_05, zero_division=0)
    recall = recall_score(y_test, pred_05, zero_division=0)
    f1 = f1_score(y_test, pred_05, zero_division=0)
    try:
        auc = float(roc_auc_score(y_test, proba))
    except ValueError:
        auc = float("nan")

    cm = confusion_matrix(y_test, pred_05).tolist()
    report = classification_report(
        y_test, pred_05, target_names=["loss(0)", "win(1)"], zero_division=0
    )

    print("\n--- Test metrics (threshold=0.5) ---")
    print(
        f"precision(win)={precision:.3f}  recall(win)={recall:.3f}  "
        f"f1={f1:.3f}  auc={auc:.3f}"
    )
    print("confusion [[tn, fp], [fn, tp]]:", cm)
    print(report)

    importances = []
    base_auc = auc
    rng = np.random.default_rng(42)
    for col in X.columns:
        X_perm = X_test.copy()
        X_perm[col] = rng.permutation(X_perm[col].to_numpy())
        try:
            perm_auc = float(
                roc_auc_score(y_test, model.predict_proba(X_perm)[:, 1])
            )
            delta = base_auc - perm_auc if base_auc == base_auc else 0.0
        except ValueError:
            delta = 0.0
        importances.append({"feature": col, "auc_drop": delta})

    imp_df = pd.DataFrame(importances).sort_values("auc_drop", ascending=False)
    print("--- Top features by permutation AUC drop ---")
    print(imp_df.head(15).to_string(index=False))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "feature_columns": list(X.columns),
            "train_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "split_mode": split_mode,
        },
        MODEL_PATH,
    )
    metrics = {
        "rows": int(len(df)),
        "features": int(X.shape[1]),
        "win_rate": win_rate,
        "split_mode": split_mode,
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "precision_win": precision,
        "recall_win": recall,
        "f1_win": f1,
        "roc_auc": None if auc != auc else auc,
        "confusion_matrix": cm,
        "threshold": 0.5,
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    imp_df.to_csv(IMPORTANCE_PATH, index=False)

    print(f"\nSaved model -> {MODEL_PATH}")
    print(f"Saved metrics -> {METRICS_PATH}")
    print(f"Saved importances -> {IMPORTANCE_PATH}")
    print(
        "\nNote: with ~14% wins and ~2 days of history this is a baseline experiment, "
        "not a live trading signal."
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Stage 3 — baseline classifier on the Stage 2 CSV.

Usage:
  pip install -r ml/requirements.txt
  python ml/train.py

Default evaluation is expanding walk-forward (time-ordered). No silent
shuffle/stratified fallback — folds with zero wins are reported and skipped.

Reads:  ml/data/training_dataset.csv  (refuses *_PREVIEW.csv by default)
Writes: ml/models/baseline_classifier.joblib
        ml/models/baseline_metrics.json
        ml/models/feature_importance.csv
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
from sklearn.utils.class_weight import compute_sample_weight

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "training_dataset.csv"
PREVIEW_PATH = ROOT / "data" / "training_dataset_PREVIEW.csv"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "baseline_classifier.joblib"
METRICS_PATH = MODEL_DIR / "baseline_metrics.json"
IMPORTANCE_PATH = MODEL_DIR / "feature_importance.csv"

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
# Expanding walk-forward: train grows; each test fold ~20% of rows after 40% min train
MIN_TRAIN_FRACTION = 0.4
TEST_FRACTION = 0.2


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
    X = X.fillna(X.median(numeric_only=True)).fillna(0)
    return X, y


def walk_forward_cuts(n: int) -> list[tuple[int, int, int]]:
    """Return list of (train_end, test_start, test_end) exclusive end indices."""
    min_train = max(1, int(n * MIN_TRAIN_FRACTION))
    test_size = max(1, int(n * TEST_FRACTION))
    cuts: list[tuple[int, int, int]] = []
    start = min_train
    while start + test_size <= n:
        cuts.append((start, start, start + test_size))
        start += test_size
    return cuts


def fit_model(X_train: pd.DataFrame, y_train: pd.Series) -> HistGradientBoostingClassifier:
    sample_weight = compute_sample_weight(class_weight="balanced", y=y_train)
    model = HistGradientBoostingClassifier(
        max_depth=4,
        learning_rate=0.08,
        max_iter=200,
        min_samples_leaf=15,
        random_state=42,
    )
    model.fit(X_train, y_train, sample_weight=sample_weight)
    return model


def eval_fold(
    model: HistGradientBoostingClassifier,
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> dict:
    proba = model.predict_proba(X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)
    precision = float(precision_score(y_test, pred, zero_division=0))
    recall = float(recall_score(y_test, pred, zero_division=0))
    f1 = float(f1_score(y_test, pred, zero_division=0))
    try:
        auc = float(roc_auc_score(y_test, proba))
    except ValueError:
        auc = float("nan")
    cm = confusion_matrix(y_test, pred).tolist()
    return {
        "precision_win": precision,
        "recall_win": recall,
        "f1_win": f1,
        "roc_auc": None if auc != auc else auc,
        "confusion_matrix": cm,
        "test_wins": int(y_test.sum()),
        "test_rows": int(len(y_test)),
        "proba": proba,
        "pred": pred,
    }


def permutation_importance(
    model: HistGradientBoostingClassifier,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    base_auc: float,
) -> pd.DataFrame:
    importances = []
    rng = np.random.default_rng(42)
    for col in X_test.columns:
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
    return pd.DataFrame(importances).sort_values("auc_drop", ascending=False)


def main() -> None:
    allow_preview = "--allow-preview" in sys.argv
    df = load_dataset(allow_preview=allow_preview)

    if "createdAt" in df.columns:
        df = df.sort_values("createdAt").reset_index(drop=True)

    X, y = feature_matrix(df)
    n = len(df)
    win_rate = float(y.mean())
    cuts = walk_forward_cuts(n)

    # Also diagnose the naive last-20% holdout (what earlier train.py used)
    naive_cut = max(1, int(n * (1 - TEST_FRACTION)))
    naive_test_wins = int(y.iloc[naive_cut:].sum())

    print("--- Stage 3 walk-forward (time-ordered only) ---")
    print(f"rows={n}  features={X.shape[1]}  win_rate={win_rate:.1%}")
    print(
        f"naive last-{int(TEST_FRACTION*100)}% holdout: "
        f"test wins={naive_test_wins}/{n - naive_cut}"
    )
    if naive_test_wins == 0:
        print(
            "  -> plain 80/20 time split still has ZERO wins in the latest fold "
            "(all 45 wins sit earlier in the series)."
        )
    print(
        f"walk-forward: min_train={int(n*MIN_TRAIN_FRACTION)}  "
        f"test_size={max(1, int(n*TEST_FRACTION))}  folds={len(cuts)}"
    )
    print("NO stratified/shuffle fallback — zero-win folds are skipped.\n")

    fold_metrics: list[dict] = []
    last_good: dict | None = None

    for i, (train_end, test_start, test_end) in enumerate(cuts, start=1):
        y_train = y.iloc[:train_end]
        y_test = y.iloc[test_start:test_end]
        X_train = X.iloc[:train_end]
        X_test = X.iloc[test_start:test_end]
        test_wins = int(y_test.sum())
        created_lo = (
            str(df["createdAt"].iloc[test_start])
            if "createdAt" in df.columns
            else "?"
        )
        created_hi = (
            str(df["createdAt"].iloc[test_end - 1])
            if "createdAt" in df.columns
            else "?"
        )

        print(f"=== Fold {i} ===")
        print(
            f"train[0:{train_end}] wins={int(y_train.sum())}/{len(y_train)}  "
            f"test[{test_start}:{test_end}] wins={test_wins}/{len(y_test)}"
        )
        print(f"test window: {created_lo} -> {created_hi}")

        if test_wins == 0:
            print(
                "SKIPPED: test fold has ZERO wins — cannot compute meaningful "
                "win-class metrics. Not falling back to shuffle.\n"
            )
            fold_metrics.append(
                {
                    "fold": i,
                    "status": "skipped_zero_wins",
                    "train_rows": int(len(y_train)),
                    "train_wins": int(y_train.sum()),
                    "test_rows": int(len(y_test)),
                    "test_wins": 0,
                    "test_start": created_lo,
                    "test_end": created_hi,
                }
            )
            continue

        model = fit_model(X_train, y_train)
        m = eval_fold(model, X_test, y_test)
        print(
            f"precision(win)={m['precision_win']:.3f}  "
            f"recall(win)={m['recall_win']:.3f}  "
            f"f1={m['f1_win']:.3f}  auc={m['roc_auc']}"
        )
        print("confusion [[tn, fp], [fn, tp]]:", m["confusion_matrix"])
        print(
            classification_report(
                y_test,
                m["pred"],
                target_names=["loss(0)", "win(1)"],
                zero_division=0,
            )
        )

        record = {
            "fold": i,
            "status": "ok",
            "train_rows": int(len(y_train)),
            "train_wins": int(y_train.sum()),
            "test_rows": m["test_rows"],
            "test_wins": m["test_wins"],
            "test_start": created_lo,
            "test_end": created_hi,
            "precision_win": m["precision_win"],
            "recall_win": m["recall_win"],
            "f1_win": m["f1_win"],
            "roc_auc": m["roc_auc"],
            "confusion_matrix": m["confusion_matrix"],
        }
        fold_metrics.append(record)
        last_good = {
            "model": model,
            "X_test": X_test,
            "y_test": y_test,
            "metrics": m,
            "train_rows": int(len(y_train)),
            "fold": i,
        }

    ok_folds = [f for f in fold_metrics if f["status"] == "ok"]
    skipped = [f for f in fold_metrics if f["status"] != "ok"]

    print("--- Walk-forward summary ---")
    print(f"usable folds: {len(ok_folds)}/{len(fold_metrics)}")
    if skipped:
        print(
            "zero-win folds skipped:",
            ", ".join(f"fold{f['fold']}" for f in skipped),
        )

    if not ok_folds:
        print(
            "\nRESULT: No usable time-ordered fold had wins in the test window. "
            "Cannot report real walk-forward metrics. Collect more data "
            "(especially recent wins) and re-run. Did NOT fall back to shuffle.",
            file=sys.stderr,
        )
        metrics_out = {
            "split_mode": "walk_forward_time_ordered",
            "rows": n,
            "win_rate": win_rate,
            "naive_last_holdout_test_wins": naive_test_wins,
            "folds": fold_metrics,
            "usable_folds": 0,
        }
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        METRICS_PATH.write_text(json.dumps(metrics_out, indent=2), encoding="utf-8")
        sys.exit(2)

    # Macro-average across usable folds
    avg_precision = float(np.mean([f["precision_win"] for f in ok_folds]))
    avg_recall = float(np.mean([f["recall_win"] for f in ok_folds]))
    avg_f1 = float(np.mean([f["f1_win"] for f in ok_folds]))
    aucs = [f["roc_auc"] for f in ok_folds if f["roc_auc"] is not None]
    avg_auc = float(np.mean(aucs)) if aucs else None

    print("\n=== REAL time-ordered metrics (avg over usable folds) ===")
    print(f"precision(win)={avg_precision:.3f}")
    print(f"recall(win)={avg_recall:.3f}")
    print(f"f1={avg_f1:.3f}")
    print(f"auc={avg_auc}")
    for f in ok_folds:
        print(
            f"  fold{f['fold']}: P={f['precision_win']:.3f} "
            f"R={f['recall_win']:.3f} F1={f['f1_win']:.3f} "
            f"AUC={f['roc_auc']}  wins={f['test_wins']}/{f['test_rows']}"
        )

    assert last_good is not None
    model = last_good["model"]
    m = last_good["metrics"]
    base_auc = m["roc_auc"] if m["roc_auc"] is not None else float("nan")
    imp_df = permutation_importance(
        model, last_good["X_test"], last_good["y_test"], base_auc
    )
    print(f"\n--- Top features (permutation AUC drop, last usable fold {last_good['fold']}) ---")
    print(imp_df.head(15).to_string(index=False))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "feature_columns": list(X.columns),
            "split_mode": "walk_forward_time_ordered",
            "last_usable_fold": last_good["fold"],
            "train_rows": last_good["train_rows"],
        },
        MODEL_PATH,
    )
    metrics_out = {
        "split_mode": "walk_forward_time_ordered",
        "rows": n,
        "features": int(X.shape[1]),
        "win_rate": win_rate,
        "naive_last_holdout_test_wins": naive_test_wins,
        "folds": [
            {k: v for k, v in f.items() if k not in ("proba", "pred")}
            for f in fold_metrics
        ],
        "usable_folds": len(ok_folds),
        "avg_precision_win": avg_precision,
        "avg_recall_win": avg_recall,
        "avg_f1_win": avg_f1,
        "avg_roc_auc": avg_auc,
        "threshold": 0.5,
        "model_from_fold": last_good["fold"],
    }
    METRICS_PATH.write_text(json.dumps(metrics_out, indent=2), encoding="utf-8")
    imp_df.to_csv(IMPORTANCE_PATH, index=False)

    print(f"\nSaved model -> {MODEL_PATH} (from fold {last_good['fold']})")
    print(f"Saved metrics -> {METRICS_PATH}")
    print(f"Saved importances -> {IMPORTANCE_PATH}")


if __name__ == "__main__":
    main()

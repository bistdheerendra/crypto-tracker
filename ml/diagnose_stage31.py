#!/usr/bin/env python3
"""
Stage 3.1 — diagnostic analysis of the Stage 3 walk-forward baseline.

Read-only w.r.t. Stage 3 artifacts:
  - does NOT modify baseline_classifier.joblib
  - does NOT modify training_dataset.csv
  - does NOT change the training pipeline

Replays the same expanding walk-forward as ml/train.py (time-ordered,
random_state=42) to recover out-of-fold probabilities for threshold /
slice analysis.

Usage:
  python ml/diagnose_stage31.py

Writes under ml/models/diagnostics/:
  diagnostic_metrics.json
  threshold_analysis.csv
  feature_win_loss_stats.csv
  fold_metrics.csv
  pair_metrics.csv
  hourly_metrics.csv
  diagnostic_report.md
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.utils.class_weight import compute_sample_weight

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "training_dataset.csv"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "baseline_classifier.joblib"
IMPORTANCE_PATH = MODEL_DIR / "feature_importance.csv"
OUT_DIR = MODEL_DIR / "diagnostics"

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

MIN_TRAIN_FRACTION = 0.4
TEST_FRACTION = 0.2
THRESHOLDS = [0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90]
TOP_FEATURES = ("distanceToNearestSwingPct", "priceDistanceToEma50Pct")
RANDOM_STATE = 42

# Univariate AUC / |corr| above these → flag for leakage review
LEAKAGE_AUC_WARN = 0.62
LEAKAGE_CORR_WARN = 0.15
LEAKAGE_RMULT_CORR_WARN = 0.25
DOMINANCE_SHARE_WARN = 0.70


def walk_forward_cuts(n: int) -> list[tuple[int, int, int]]:
    """Same expanding cuts as ml/train.py: (train_end, test_start, test_end)."""
    min_train = max(1, int(n * MIN_TRAIN_FRACTION))
    test_size = max(1, int(n * TEST_FRACTION))
    cuts: list[tuple[int, int, int]] = []
    start = min_train
    while start + test_size <= n:
        cuts.append((start, start, start + test_size))
        start += test_size
    return cuts


def fit_model(X_train: pd.DataFrame, y_train: pd.Series) -> HistGradientBoostingClassifier:
    """Identical hyperparameters to Stage 3."""
    sample_weight = compute_sample_weight(class_weight="balanced", y=y_train)
    model = HistGradientBoostingClassifier(
        max_depth=4,
        learning_rate=0.08,
        max_iter=200,
        min_samples_leaf=15,
        random_state=RANDOM_STATE,
    )
    model.fit(X_train, y_train, sample_weight=sample_weight)
    return model


def safe_auc(y_true: np.ndarray, proba: np.ndarray) -> float | None:
    if len(np.unique(y_true)) < 2:
        return None
    try:
        return float(roc_auc_score(y_true, proba))
    except ValueError:
        return None


def safe_pr_auc(y_true: np.ndarray, proba: np.ndarray) -> float | None:
    if len(np.unique(y_true)) < 2 or int(np.sum(y_true)) == 0:
        return None
    try:
        return float(average_precision_score(y_true, proba))
    except ValueError:
        return None


def threshold_row(y_true: np.ndarray, proba: np.ndarray, thr: float) -> dict:
    pred = (proba >= thr).astype(int)
    n_signals = int(pred.sum())
    return {
        "threshold": thr,
        "n_signals": n_signals,
        "n_rows": int(len(y_true)),
        "signal_rate": float(n_signals / len(y_true)) if len(y_true) else 0.0,
        "precision": float(precision_score(y_true, pred, zero_division=0)),
        "recall": float(recall_score(y_true, pred, zero_division=0)),
        "f1": float(f1_score(y_true, pred, zero_division=0)),
        "tp": int(((pred == 1) & (y_true == 1)).sum()),
        "fp": int(((pred == 1) & (y_true == 0)).sum()),
        "fn": int(((pred == 0) & (y_true == 1)).sum()),
        "tn": int(((pred == 0) & (y_true == 0)).sum()),
    }


def group_metrics(
    df_slice: pd.DataFrame,
    group_col: str,
    y: np.ndarray,
    proba: np.ndarray,
    thr: float = 0.5,
) -> pd.DataFrame:
    rows = []
    pred = (proba >= thr).astype(int)
    for key, idx in df_slice.groupby(group_col, dropna=False).groups.items():
        ii = np.asarray(list(idx), dtype=int)
        y_g = y[ii]
        p_g = pred[ii]
        proba_g = proba[ii]
        n = len(y_g)
        wins = int(y_g.sum())
        signals = int(p_g.sum())
        rows.append(
            {
                group_col: key,
                "n_rows": n,
                "n_wins": wins,
                "win_rate": float(wins / n) if n else 0.0,
                "n_signals": signals,
                "precision": float(precision_score(y_g, p_g, zero_division=0)),
                "recall": float(recall_score(y_g, p_g, zero_division=0)),
                "f1": float(f1_score(y_g, p_g, zero_division=0)),
                "roc_auc": safe_auc(y_g, proba_g),
                "pr_auc": safe_pr_auc(y_g, proba_g),
                "mean_proba": float(np.mean(proba_g)) if n else None,
            }
        )
    out = pd.DataFrame(rows)
    if not out.empty:
        out = out.sort_values("n_rows", ascending=False).reset_index(drop=True)
    return out


def feature_win_loss_stats(X_raw: pd.DataFrame, y: pd.Series) -> pd.DataFrame:
    rows = []
    y_arr = y.to_numpy()
    win_mask = y_arr == 1
    loss_mask = y_arr == 0
    for col in X_raw.columns:
        s = pd.to_numeric(X_raw[col], errors="coerce")
        win = s[win_mask]
        loss = s[loss_mask]
        win_mean = float(win.mean()) if win.notna().any() else float("nan")
        loss_mean = float(loss.mean()) if loss.notna().any() else float("nan")
        win_std = float(win.std(ddof=0)) if win.notna().any() else float("nan")
        loss_std = float(loss.std(ddof=0)) if loss.notna().any() else float("nan")
        pooled = math.sqrt(
            0.5
            * (
                (win_std ** 2 if win_std == win_std else 0.0)
                + (loss_std ** 2 if loss_std == loss_std else 0.0)
            )
        )
        cohens_d = (
            (win_mean - loss_mean) / pooled
            if pooled > 1e-12 and win_mean == win_mean and loss_mean == loss_mean
            else float("nan")
        )
        # Point-biserial / Pearson with label (NaNs dropped pairwise)
        valid = s.notna()
        if int(valid.sum()) >= 10 and y_arr[valid.to_numpy()].std() > 0:
            corr = float(np.corrcoef(s[valid].to_numpy(), y_arr[valid.to_numpy()])[0, 1])
        else:
            corr = float("nan")
        univariate_auc = safe_auc(
            y_arr[valid.to_numpy()],
            s[valid].to_numpy().astype(float),
        )
        # Direction-invariant univariate strength (max(auc, 1-auc))
        if univariate_auc is not None:
            univariate_auc_abs = max(univariate_auc, 1.0 - univariate_auc)
        else:
            univariate_auc_abs = None
        rows.append(
            {
                "feature": col,
                "n": int(valid.sum()),
                "missing_rate": float(1.0 - valid.mean()),
                "win_mean": win_mean,
                "loss_mean": loss_mean,
                "mean_diff_win_minus_loss": win_mean - loss_mean
                if win_mean == win_mean and loss_mean == loss_mean
                else float("nan"),
                "win_median": float(win.median()) if win.notna().any() else float("nan"),
                "loss_median": float(loss.median()) if loss.notna().any() else float("nan"),
                "win_std": win_std,
                "loss_std": loss_std,
                "cohens_d": cohens_d,
                "corr_with_label": corr,
                "univariate_auc": univariate_auc,
                "univariate_auc_abs": univariate_auc_abs,
            }
        )
    return pd.DataFrame(rows).sort_values(
        "univariate_auc_abs", ascending=False, na_position="last"
    )


def missing_patterns(df: pd.DataFrame, feature_cols: list[str]) -> dict:
    # CSV is already median-filled by Stage 2; still report raw missing + constant cols
    miss = {}
    for col in feature_cols:
        s = df[col]
        # Treat empty strings as missing if object-like slips through
        if s.dtype == object:
            empty = s.isna() | (s.astype(str).str.strip() == "")
            rate = float(empty.mean())
        else:
            rate = float(pd.to_numeric(s, errors="coerce").isna().mean())
        miss[col] = rate
    constants = [
        c
        for c in feature_cols
        if pd.to_numeric(df[c], errors="coerce").nunique(dropna=True) <= 1
    ]
    return {
        "missing_rate_by_feature": miss,
        "features_with_any_missing": [c for c, r in miss.items() if r > 0],
        "max_missing_rate": float(max(miss.values()) if miss else 0.0),
        "constant_features": constants,
        "note": (
            "Stage 2 extract already median-fills dropped-null columns; "
            "rates here reflect the on-disk CSV after that fill."
        ),
    }


def permutation_importance_share(
    model: HistGradientBoostingClassifier,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    base_auc: float | None,
) -> pd.DataFrame:
    importances = []
    rng = np.random.default_rng(RANDOM_STATE)
    y_arr = y_test.to_numpy()
    for col in X_test.columns:
        X_perm = X_test.copy()
        X_perm[col] = rng.permutation(X_perm[col].to_numpy())
        perm_auc = safe_auc(y_arr, model.predict_proba(X_perm)[:, 1])
        if base_auc is not None and perm_auc is not None:
            delta = base_auc - perm_auc
        else:
            delta = 0.0
        importances.append({"feature": col, "auc_drop": float(delta)})
    return pd.DataFrame(importances).sort_values("auc_drop", ascending=False)


def ablation_on_fold(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> dict:
    y_te = y_test.to_numpy()
    full = fit_model(X_train, y_train)
    proba_full = full.predict_proba(X_test)[:, 1]
    without_cols = [c for c in X_train.columns if c not in TOP_FEATURES]
    only_cols = [c for c in TOP_FEATURES if c in X_train.columns]

    without = fit_model(X_train[without_cols], y_train)
    proba_without = without.predict_proba(X_test[without_cols])[:, 1]

    only = fit_model(X_train[only_cols], y_train)
    proba_only = only.predict_proba(X_test[only_cols])[:, 1]

    return {
        "full_auc": safe_auc(y_te, proba_full),
        "without_top2_auc": safe_auc(y_te, proba_without),
        "only_top2_auc": safe_auc(y_te, proba_only),
        "full_pr_auc": safe_pr_auc(y_te, proba_full),
        "without_top2_pr_auc": safe_pr_auc(y_te, proba_without),
        "only_top2_pr_auc": safe_pr_auc(y_te, proba_only),
        "delta_auc_drop_removing_top2": (
            None
            if safe_auc(y_te, proba_full) is None or safe_auc(y_te, proba_without) is None
            else float(safe_auc(y_te, proba_full) - safe_auc(y_te, proba_without))  # type: ignore[operator]
        ),
    }


def temporal_drift(
    X: pd.DataFrame,
    y: pd.Series,
    cuts: list[tuple[int, int, int]],
    focus_features: list[str],
) -> dict:
    fold_stats = []
    for i, (_train_end, test_start, test_end) in enumerate(cuts, start=1):
        X_te = X.iloc[test_start:test_end]
        y_te = y.iloc[test_start:test_end]
        entry: dict = {
            "fold": i,
            "test_start_idx": test_start,
            "test_end_idx": test_end,
            "n_rows": int(len(y_te)),
            "win_rate": float(y_te.mean()),
            "feature_means": {},
            "feature_stds": {},
        }
        for col in focus_features:
            if col not in X_te.columns:
                continue
            s = X_te[col]
            entry["feature_means"][col] = float(s.mean())
            entry["feature_stds"][col] = float(s.std(ddof=0))
        fold_stats.append(entry)

    # Pairwise mean shifts (relative) for focus features
    pairwise = []
    for a in range(len(fold_stats)):
        for b in range(a + 1, len(fold_stats)):
            fa, fb = fold_stats[a], fold_stats[b]
            shifts = {}
            for col in focus_features:
                ma = fa["feature_means"].get(col)
                mb = fb["feature_means"].get(col)
                if ma is None or mb is None:
                    continue
                denom = max(abs(ma), abs(mb), 1e-9)
                shifts[col] = {
                    "mean_fold_a": ma,
                    "mean_fold_b": mb,
                    "abs_diff": float(abs(mb - ma)),
                    "rel_diff": float(abs(mb - ma) / denom),
                }
            pairwise.append(
                {
                    "fold_a": fa["fold"],
                    "fold_b": fb["fold"],
                    "win_rate_a": fa["win_rate"],
                    "win_rate_b": fb["win_rate"],
                    "win_rate_delta": float(fb["win_rate"] - fa["win_rate"]),
                    "feature_shifts": shifts,
                }
            )
    return {"fold_test_stats": fold_stats, "pairwise": pairwise}


def baseline_metrics(y: np.ndarray) -> dict:
    n = len(y)
    wins = int(y.sum())
    win_rate = float(wins / n) if n else 0.0
    # Always predict loss (0)
    always_loss_pred = np.zeros(n, dtype=int)
    # Always predict win (1)
    always_win_pred = np.ones(n, dtype=int)
    # Naive probability: constant P(win)=base rate
    naive_proba = np.full(n, win_rate, dtype=float)

    def pack(name: str, pred: np.ndarray, proba: np.ndarray | None = None) -> dict:
        out = {
            "name": name,
            "precision": float(precision_score(y, pred, zero_division=0)),
            "recall": float(recall_score(y, pred, zero_division=0)),
            "f1": float(f1_score(y, pred, zero_division=0)),
            "accuracy": float((pred == y).mean()) if n else 0.0,
        }
        if proba is not None:
            out["roc_auc"] = safe_auc(y, proba)
            out["pr_auc"] = safe_pr_auc(y, proba)
            out["brier"] = float(np.mean((proba - y) ** 2))
        return out

    return {
        "win_rate": win_rate,
        "n_wins": wins,
        "n_losses": int(n - wins),
        "imbalance_ratio_loss_to_win": float((n - wins) / wins) if wins else None,
        "always_loss": pack("always_loss", always_loss_pred),
        "always_win": pack("always_win", always_win_pred),
        "naive_probability": {
            **pack("naive_probability", (naive_proba >= 0.5).astype(int), naive_proba),
            "constant_proba": win_rate,
            "note": (
                "Predicts P(win)=overall win rate for every row. "
                "At threshold 0.5 this equals always_loss when win_rate < 0.5."
            ),
        },
    }


def leakage_checks(
    df: pd.DataFrame,
    X_raw: pd.DataFrame,
    y: pd.Series,
    win_loss: pd.DataFrame,
) -> dict:
    flags = []
    # 1) High univariate AUC
    for _, row in win_loss.iterrows():
        auc_abs = row["univariate_auc_abs"]
        corr = row["corr_with_label"]
        feat = row["feature"]
        if auc_abs is not None and not (isinstance(auc_abs, float) and math.isnan(auc_abs)):
            if auc_abs >= LEAKAGE_AUC_WARN:
                flags.append(
                    {
                        "feature": feat,
                        "reason": "high_univariate_auc",
                        "univariate_auc_abs": float(auc_abs),
                        "severity": "high" if auc_abs >= 0.70 else "medium",
                    }
                )
        if corr == corr and abs(float(corr)) >= LEAKAGE_CORR_WARN:
            flags.append(
                {
                    "feature": feat,
                    "reason": "high_corr_with_label",
                    "corr_with_label": float(corr),
                    "severity": "high" if abs(float(corr)) >= 0.30 else "medium",
                }
            )

    # 2) Correlation with post-outcome rMultiple (should be weak for entry-time features)
    rmult_flags = []
    if "rMultiple" in df.columns:
        r = pd.to_numeric(df["rMultiple"], errors="coerce")
        for col in X_raw.columns:
            s = pd.to_numeric(X_raw[col], errors="coerce")
            mask = s.notna() & r.notna()
            if int(mask.sum()) < 50:
                continue
            corr = float(np.corrcoef(s[mask].to_numpy(), r[mask].to_numpy())[0, 1])
            if corr == corr and abs(corr) >= LEAKAGE_RMULT_CORR_WARN:
                rmult_flags.append(
                    {
                        "feature": col,
                        "corr_with_rMultiple": corr,
                        "severity": "high" if abs(corr) >= 0.40 else "medium",
                        "note": (
                            "rMultiple is post-outcome; strong correlation may "
                            "indicate leakage or a feature that proxies realized move size."
                        ),
                    }
                )
    rmult_flags.sort(key=lambda x: abs(x["corr_with_rMultiple"]), reverse=True)

    # 3) Domain notes on the two dominant features
    domain_notes = [
        {
            "feature": "distanceToNearestSwingPct",
            "assessment": "review",
            "note": (
                "Computed from structure/swing levels at signal time in analysis. "
                "If swing detection ever uses bars after the signal candle, this "
                "would leak. Verify structure.ts lookback is strictly causal."
            ),
        },
        {
            "feature": "priceDistanceToEma50Pct",
            "assessment": "likely_ok",
            "note": (
                "EMA50 distance at entry is generally causal if EMA uses only "
                "history up to the signal bar."
            ),
        },
        {
            "feature": "rMultiple / outcome",
            "assessment": "excluded",
            "note": "META columns - correctly excluded from features.",
        },
        {
            "feature": "global_median_imputation_in_train.py",
            "assessment": "mild_process_leak",
            "note": (
                "Stage 3 fills NaNs with full-dataset medians before the "
                "walk-forward split (mild leakage). CSV currently has ~0 missing."
            ),
        },
    ]

    return {
        "flags": flags,
        "rMultiple_correlations": rmult_flags[:15],
        "domain_notes": domain_notes,
        "thresholds": {
            "univariate_auc_abs_warn": LEAKAGE_AUC_WARN,
            "corr_with_label_warn": LEAKAGE_CORR_WARN,
            "corr_with_rMultiple_warn": LEAKAGE_RMULT_CORR_WARN,
        },
    }


def proba_distribution(proba: np.ndarray, y: np.ndarray) -> dict:
    bins = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.01]
    labels = [
        "0.0-0.1",
        "0.1-0.2",
        "0.2-0.3",
        "0.3-0.4",
        "0.4-0.5",
        "0.5-0.6",
        "0.6-0.7",
        "0.7-0.8",
        "0.8-0.9",
        "0.9-1.0",
    ]
    cat = pd.cut(proba, bins=bins, labels=labels, right=False, include_lowest=True)
    rows = []
    for lab in labels:
        mask = np.asarray(cat == lab)
        n = int(mask.sum())
        wins = int(y[mask].sum()) if n else 0
        rows.append(
            {
                "bucket": lab,
                "n": n,
                "share": float(n / len(proba)) if len(proba) else 0.0,
                "empirical_win_rate": float(wins / n) if n else None,
            }
        )
    return {
        "mean": float(np.mean(proba)),
        "std": float(np.std(proba)),
        "min": float(np.min(proba)),
        "p10": float(np.percentile(proba, 10)),
        "p25": float(np.percentile(proba, 25)),
        "p50": float(np.percentile(proba, 50)),
        "p75": float(np.percentile(proba, 75)),
        "p90": float(np.percentile(proba, 90)),
        "max": float(np.max(proba)),
        "mean_when_win": float(np.mean(proba[y == 1])) if (y == 1).any() else None,
        "mean_when_loss": float(np.mean(proba[y == 0])) if (y == 0).any() else None,
        "histogram": rows,
    }


def fmt(v: float | None, digits: int = 3) -> str:
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return "n/a"
    return f"{v:.{digits}f}"


def write_report(
    path: Path,
    summary: dict,
    thr_df: pd.DataFrame,
    fold_df: pd.DataFrame,
    dominance: dict,
    leakage: dict,
    drift: dict,
    baselines: dict,
    recommendations: dict,
) -> None:
    lines: list[str] = []
    lines.append("# Stage 3.1 Diagnostic Report")
    lines.append("")
    lines.append("Read-only diagnostics over the Stage 3 walk-forward baseline.")
    lines.append("Time-ordered expanding folds; no shuffle; no future features added.")
    lines.append("")
    lines.append("## Dataset")
    lines.append("")
    lines.append(f"- rows: {summary['rows']}")
    lines.append(f"- features: {summary['features']}")
    lines.append(f"- overall win rate: {summary['win_rate']:.1%}")
    lines.append(
        f"- class imbalance (loss:win): "
        f"{fmt(baselines.get('imbalance_ratio_loss_to_win'), 2)}:1"
    )
    lines.append("")
    lines.append("## Walk-forward fold metrics")
    lines.append("")
    lines.append("| Fold | Rows | Wins | AUC | PR-AUC | P@0.5 | R@0.5 | F1@0.5 |")
    lines.append("|------|------|------|-----|--------|-------|-------|--------|")
    for _, r in fold_df.iterrows():
        lines.append(
            f"| {int(r['fold'])} | {int(r['test_rows'])} | {int(r['test_wins'])} | "
            f"{fmt(r['roc_auc'], 4)} | {fmt(r['pr_auc'], 4)} | "
            f"{fmt(r['precision_win'])} | {fmt(r['recall_win'])} | {fmt(r['f1_win'])} |"
        )
    lines.append("")
    lines.append(
        f"- OOF macro avg AUC: {fmt(summary['oof_avg_roc_auc'], 4)} | "
        f"PR-AUC: {fmt(summary['oof_avg_pr_auc'], 4)}"
    )
    lines.append("")
    lines.append("## Threshold analysis (OOF probabilities)")
    lines.append("")
    lines.append("| Thr | Signals | Precision | Recall | F1 |")
    lines.append("|-----|---------|-----------|--------|----|")
    for _, r in thr_df.iterrows():
        lines.append(
            f"| {r['threshold']:.2f} | {int(r['n_signals'])} | "
            f"{fmt(r['precision'])} | {fmt(r['recall'])} | {fmt(r['f1'])} |"
        )
    lines.append("")
    lines.append("## Baselines")
    lines.append("")
    for key in ("always_loss", "always_win", "naive_probability"):
        b = baselines[key]
        lines.append(
            f"- **{key}**: P={fmt(b['precision'])} R={fmt(b['recall'])} "
            f"F1={fmt(b['f1'])} acc={fmt(b['accuracy'])}"
            + (
                f" AUC={fmt(b.get('roc_auc'), 4)} PR-AUC={fmt(b.get('pr_auc'), 4)}"
                if "roc_auc" in b
                else ""
            )
        )
    lines.append("")
    lines.append("## Dominance of top-2 features")
    lines.append("")
    lines.append(
        f"- permutation positive-importance share (top2): "
        f"{fmt(dominance.get('top2_positive_share'), 3)}"
    )
    lines.append(
        f"- last-fold ablation dAUC removing top2: "
        f"{fmt(dominance.get('last_fold_ablation', {}).get('delta_auc_drop_removing_top2'), 4)}"
    )
    lines.append(
        f"- last-fold only-top2 AUC: "
        f"{fmt(dominance.get('last_fold_ablation', {}).get('only_top2_auc'), 4)} "
        f"vs full {fmt(dominance.get('last_fold_ablation', {}).get('full_auc'), 4)}"
    )
    lines.append(f"- dominates: **{dominance.get('dominates')}**")
    lines.append("")
    lines.append("## Leakage review")
    lines.append("")
    if not leakage["flags"] and not leakage["rMultiple_correlations"]:
        lines.append("- No high-severity quantitative leakage flags under configured thresholds.")
    else:
        for f in leakage["flags"][:12]:
            lines.append(
                f"- `{f['feature']}`: {f['reason']} "
                f"(severity={f['severity']})"
            )
        for f in leakage["rMultiple_correlations"][:8]:
            lines.append(
                f"- `{f['feature']}` corr(rMultiple)={fmt(f['corr_with_rMultiple'], 3)} "
                f"(severity={f['severity']})"
            )
    lines.append("")
    for note in leakage["domain_notes"]:
        lines.append(f"- `{note['feature']}` [{note['assessment']}]: {note['note']}")
    lines.append("")
    lines.append("## Temporal drift")
    lines.append("")
    for fs in drift["fold_test_stats"]:
        lines.append(
            f"- Fold {fs['fold']} test win_rate={fs['win_rate']:.1%} "
            f"(n={fs['n_rows']})"
        )
    for pw in drift["pairwise"]:
        lines.append(
            f"- Fold {pw['fold_a']}->{pw['fold_b']}: "
            f"dWinRate={pw['win_rate_delta']:+.1%}"
        )
    lines.append("")
    lines.append("## Summary verdicts")
    lines.append("")
    lines.append(f"- **A) Strongest reliable signals:** {recommendations['A']}")
    lines.append(f"- **B) Unstable features:** {recommendations['B']}")
    lines.append(f"- **C) Possible leakage:** {recommendations['C']}")
    lines.append(f"- **D) Recommended next experiment:** {recommendations['D']}")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def build_recommendations(
    win_loss: pd.DataFrame,
    fold_df: pd.DataFrame,
    thr_df: pd.DataFrame,
    dominance: dict,
    leakage: dict,
    drift: dict,
    importance_df: pd.DataFrame | None,
    pair_df: pd.DataFrame,
) -> dict:
    # A) reliable = positive perm importance across folds / consistent univariate + not drifting hard
    reliable = []
    if importance_df is not None and not importance_df.empty:
        pos = importance_df[importance_df["auc_drop"] > 0].head(5)
        reliable = list(pos["feature"])
    # Prefer features with decent |cohen d| and present in importance
    wl_strong = win_loss.dropna(subset=["cohens_d"]).copy()
    wl_strong["abs_d"] = wl_strong["cohens_d"].abs()
    wl_top = list(wl_strong.sort_values("abs_d", ascending=False).head(5)["feature"])

    aucs = [r for r in fold_df["roc_auc"].tolist() if r == r and r is not None]
    fold1_weak = bool(aucs and aucs[0] is not None and aucs[0] < 0.55)

    unstable = []
    # Features with near-zero / negative perm importance but non-trivial noise
    if importance_df is not None:
        unstable = list(
            importance_df[importance_df["auc_drop"] <= 0].head(8)["feature"]
        )
    # Drift: large rel_diff on focus features fold1 vs later
    drifted = []
    for pw in drift.get("pairwise", []):
        if pw["fold_a"] == 1:
            for feat, sh in pw.get("feature_shifts", {}).items():
                if sh.get("rel_diff", 0) >= 0.25:
                    drifted.append(feat)
    unstable = list(dict.fromkeys(unstable + drifted))

    leak_feats = list(
        dict.fromkeys(
            [f["feature"] for f in leakage.get("flags", [])]
            + [f["feature"] for f in leakage.get("rMultiple_correlations", [])[:5]]
        )
    )
    if dominance.get("dominates"):
        leak_note = (
            f"Top-2 structural features dominate ({', '.join(TOP_FEATURES)}); "
            "verify swing/EMA features are strictly causal at signal time. "
        )
    else:
        leak_note = ""
    if leak_feats:
        leak_note += "Quantitative flags: " + ", ".join(leak_feats[:6]) + "."
    elif not leak_note:
        leak_note = (
            "No strong quantitative leakage flags; keep META (outcome/rMultiple) excluded."
        )

    thr_ok = thr_df[thr_df["n_signals"] >= 50].copy()
    if thr_ok.empty:
        thr_ok = thr_df.copy()
    best_f1 = thr_ok.sort_values("f1", ascending=False).iloc[0]
    # Prefer precision peak with enough trades for a practical gate
    prec_ok = thr_df[thr_df["n_signals"] >= 100].copy()
    if prec_ok.empty:
        prec_ok = thr_ok
    prec_peak = prec_ok.sort_values(
        ["precision", "n_signals"], ascending=[False, False]
    ).iloc[0]

    next_exp = (
        f"Try a high-precision gate at probability >= {prec_peak['threshold']:.2f} "
        f"(OOF P={prec_peak['precision']:.3f}, R={prec_peak['recall']:.3f}, "
        f"n_signals={int(prec_peak['n_signals'])}); also compare F1-best thr="
        f"{best_f1['threshold']:.2f} (P={best_f1['precision']:.3f}, "
        f"F1={best_f1['f1']:.3f}). Ablate/regularize "
        f"{TOP_FEATURES[0]}+{TOP_FEATURES[1]} to test whether non-structure "
        f"features retain fold-2/3 edge; investigate Fold 1 regime shift "
        f"(AUC={fmt(aucs[0] if aucs else None, 4)})."
    )
    if fold1_weak:
        next_exp += " Fold 1 underperforms chance - treat early-window metrics cautiously."

    # Pair stability hint
    if not pair_df.empty and "roc_auc" in pair_df.columns:
        pair_aucs = pair_df.dropna(subset=["roc_auc"])
        if len(pair_aucs) >= 2:
            spread = float(pair_aucs["roc_auc"].max() - pair_aucs["roc_auc"].min())
            if spread >= 0.15:
                next_exp += (
                    f" Pair AUC spread={spread:.2f} - consider pair-conditioned calibration."
                )

    a_text = (
        ", ".join(reliable[:4])
        if reliable
        else ", ".join(wl_top[:4]) or "none clear"
    )
    if TOP_FEATURES[0] in a_text or (importance_df is not None and not importance_df.empty):
        a_text += (
            f" (top perm: {TOP_FEATURES[0]}, {TOP_FEATURES[1]} - "
            "strong but concentration risk)"
        )

    return {
        "A": a_text,
        "B": ", ".join(unstable[:8]) if unstable else "none clearly unstable",
        "C": leak_note,
        "D": next_exp,
    }


def main() -> None:
    if not DATA_PATH.exists():
        print(f"Missing {DATA_PATH}", file=sys.stderr)
        sys.exit(1)

    print("--- Stage 3.1 diagnostics ---")
    print(f"data: {DATA_PATH}")
    print("constraints: no model overwrite, no CSV mutate, no shuffle, time-ordered WF only\n")

    df = pd.read_csv(DATA_PATH)
    if "createdAt" in df.columns:
        df = df.sort_values("createdAt").reset_index(drop=True)

    y = df["label"].astype(int)
    feature_cols = [c for c in df.columns if c not in META_COLS]
    X_raw = df[feature_cols].apply(pd.to_numeric, errors="coerce")
    # Match Stage 3 imputation (full-dataset median) for comparable OOF probs
    X = X_raw.fillna(X_raw.median(numeric_only=True)).fillna(0)

    n = len(df)
    win_rate = float(y.mean())
    cuts = walk_forward_cuts(n)
    print(f"rows={n} features={X.shape[1]} win_rate={win_rate:.1%} folds={len(cuts)}")

    # --- 1–3: distributions, missing, imbalance ---
    wl_stats = feature_win_loss_stats(X_raw, y)
    missing = missing_patterns(df, feature_cols)
    baselines = baseline_metrics(y.to_numpy())

    # --- Walk-forward OOF predictions (do not save models) ---
    oof_proba = np.full(n, np.nan)
    oof_fold = np.full(n, -1, dtype=int)
    fold_records: list[dict] = []
    last_good: dict | None = None
    ablation_by_fold: list[dict] = []

    for i, (train_end, test_start, test_end) in enumerate(cuts, start=1):
        X_train = X.iloc[:train_end]
        y_train = y.iloc[:train_end]
        X_test = X.iloc[test_start:test_end]
        y_test = y.iloc[test_start:test_end]
        test_wins = int(y_test.sum())
        created_lo = str(df["createdAt"].iloc[test_start]) if "createdAt" in df.columns else "?"
        created_hi = (
            str(df["createdAt"].iloc[test_end - 1]) if "createdAt" in df.columns else "?"
        )

        print(
            f"Fold {i}: train[0:{train_end}] test[{test_start}:{test_end}] "
            f"wins={test_wins}/{len(y_test)}"
        )

        if test_wins == 0:
            fold_records.append(
                {
                    "fold": i,
                    "status": "skipped_zero_wins",
                    "train_rows": int(len(y_train)),
                    "train_wins": int(y_train.sum()),
                    "test_rows": int(len(y_test)),
                    "test_wins": 0,
                    "test_start": created_lo,
                    "test_end": created_hi,
                    "precision_win": None,
                    "recall_win": None,
                    "f1_win": None,
                    "roc_auc": None,
                    "pr_auc": None,
                }
            )
            continue

        model = fit_model(X_train, y_train)
        proba = model.predict_proba(X_test)[:, 1]
        pred = (proba >= 0.5).astype(int)
        y_te = y_test.to_numpy()
        auc = safe_auc(y_te, proba)
        pr_auc = safe_pr_auc(y_te, proba)

        oof_proba[test_start:test_end] = proba
        oof_fold[test_start:test_end] = i

        record = {
            "fold": i,
            "status": "ok",
            "train_rows": int(len(y_train)),
            "train_wins": int(y_train.sum()),
            "test_rows": int(len(y_test)),
            "test_wins": test_wins,
            "test_start": created_lo,
            "test_end": created_hi,
            "precision_win": float(precision_score(y_te, pred, zero_division=0)),
            "recall_win": float(recall_score(y_te, pred, zero_division=0)),
            "f1_win": float(f1_score(y_te, pred, zero_division=0)),
            "roc_auc": auc,
            "pr_auc": pr_auc,
        }
        fold_records.append(record)

        abl = ablation_on_fold(X_train, y_train, X_test, y_test)
        abl["fold"] = i
        ablation_by_fold.append(abl)

        last_good = {
            "fold": i,
            "model": model,
            "X_test": X_test,
            "y_test": y_test,
            "auc": auc,
            "ablation": abl,
        }

    fold_df = pd.DataFrame(fold_records)
    ok_mask = oof_fold > 0
    y_oof = y.to_numpy()[ok_mask]
    proba_oof = oof_proba[ok_mask]
    df_oof = df.loc[ok_mask].reset_index(drop=True)

    # --- 4–6: probability dist + thresholds ---
    proba_dist = proba_distribution(proba_oof, y_oof)
    thr_rows = [threshold_row(y_oof, proba_oof, t) for t in THRESHOLDS]
    thr_df = pd.DataFrame(thr_rows)

    ok_folds = [r for r in fold_records if r["status"] == "ok"]
    oof_avg_auc = (
        float(np.mean([r["roc_auc"] for r in ok_folds if r["roc_auc"] is not None]))
        if ok_folds
        else None
    )
    oof_avg_pr = (
        float(np.mean([r["pr_auc"] for r in ok_folds if r["pr_auc"] is not None]))
        if ok_folds
        else None
    )
    pooled_auc = safe_auc(y_oof, proba_oof)
    pooled_pr = safe_pr_auc(y_oof, proba_oof)

    # --- 8: slice metrics ---
    pair_df = group_metrics(df_oof, "pair", y_oof, proba_oof)
    tier_df = group_metrics(df_oof, "confidenceTier", y_oof, proba_oof)
    # hour/day from features (also present on df)
    hour_series = df_oof["hourOfDay"] if "hourOfDay" in df_oof.columns else X.loc[ok_mask, "hourOfDay"].reset_index(drop=True)
    dow_series = df_oof["dayOfWeek"] if "dayOfWeek" in df_oof.columns else X.loc[ok_mask, "dayOfWeek"].reset_index(drop=True)
    hour_df = group_metrics(
        pd.DataFrame({"hourOfDay": hour_series}), "hourOfDay", y_oof, proba_oof
    )
    dow_df = group_metrics(
        pd.DataFrame({"dayOfWeek": dow_series}), "dayOfWeek", y_oof, proba_oof
    )

    # --- 9: dominance ---
    importance_df = None
    if IMPORTANCE_PATH.exists():
        importance_df = pd.read_csv(IMPORTANCE_PATH)
    elif last_good is not None:
        importance_df = permutation_importance_share(
            last_good["model"],
            last_good["X_test"],
            last_good["y_test"],
            last_good["auc"],
        )

    pos_imp = (
        importance_df[importance_df["auc_drop"] > 0]["auc_drop"].sum()
        if importance_df is not None and not importance_df.empty
        else 0.0
    )
    top2_imp = 0.0
    if importance_df is not None:
        for feat in TOP_FEATURES:
            hit = importance_df.loc[importance_df["feature"] == feat, "auc_drop"]
            if not hit.empty and float(hit.iloc[0]) > 0:
                top2_imp += float(hit.iloc[0])
    top2_share = float(top2_imp / pos_imp) if pos_imp > 1e-12 else None

    last_ablation = last_good["ablation"] if last_good else {}
    dominates = bool(
        (top2_share is not None and top2_share >= DOMINANCE_SHARE_WARN)
        or (
            last_ablation.get("only_top2_auc") is not None
            and last_ablation.get("full_auc") is not None
            and last_ablation["only_top2_auc"] >= (last_ablation["full_auc"] - 0.02)
        )
    )
    dominance = {
        "top_features": list(TOP_FEATURES),
        "top2_positive_permutation_auc_drop": top2_imp,
        "all_positive_permutation_auc_drop": float(pos_imp),
        "top2_positive_share": top2_share,
        "dominates": dominates,
        "dominance_share_threshold": DOMINANCE_SHARE_WARN,
        "ablation_by_fold": ablation_by_fold,
        "last_fold_ablation": last_ablation,
        "permutation_importance_source": (
            str(IMPORTANCE_PATH) if IMPORTANCE_PATH.exists() else "recomputed_last_fold"
        ),
    }

    # --- 10–12: leakage, drift, already have baselines ---
    leakage = leakage_checks(df, X_raw, y, wl_stats)
    focus = list(TOP_FEATURES) + [
        c
        for c in (
            "hourOfDay",
            "price24hChangePct",
            "liquidationNetImbalanceUsd",
            "fearGreedIndex",
            "rsi14",
            "fundingRate",
        )
        if c in X.columns
    ]
    drift = temporal_drift(X, y, cuts, focus)

    recommendations = build_recommendations(
        wl_stats, fold_df, thr_df, dominance, leakage, drift, importance_df, pair_df
    )

    # Optional: verify saved Stage 3 model is untouched by only reading it
    saved_model_meta = None
    if MODEL_PATH.exists():
        bundle = joblib.load(MODEL_PATH)
        saved_model_meta = {
            "path": str(MODEL_PATH),
            "feature_columns_count": len(bundle.get("feature_columns", [])),
            "last_usable_fold": bundle.get("last_usable_fold"),
            "train_rows": bundle.get("train_rows"),
            "split_mode": bundle.get("split_mode"),
            "note": "Loaded read-only for reference; not overwritten.",
        }

    summary = {
        "stage": "3.1",
        "rows": n,
        "features": int(X.shape[1]),
        "win_rate": win_rate,
        "oof_rows": int(ok_mask.sum()),
        "usable_folds": len(ok_folds),
        "oof_avg_roc_auc": oof_avg_auc,
        "oof_avg_pr_auc": oof_avg_pr,
        "oof_pooled_roc_auc": pooled_auc,
        "oof_pooled_pr_auc": pooled_pr,
        "threshold_default": 0.5,
    }

    metrics_out = {
        "summary": summary,
        "class_imbalance": {
            "n_wins": baselines["n_wins"],
            "n_losses": baselines["n_losses"],
            "win_rate": win_rate,
            "loss_rate": 1.0 - win_rate,
            "imbalance_ratio_loss_to_win": baselines["imbalance_ratio_loss_to_win"],
        },
        "missing_patterns": missing,
        "prediction_probability_distribution": proba_dist,
        "baselines": baselines,
        "folds": fold_records,
        "threshold_analysis": thr_rows,
        "dominance": dominance,
        "leakage": leakage,
        "temporal_drift": drift,
        "slice_metrics": {
            "pair": pair_df.replace({np.nan: None}).to_dict(orient="records"),
            "confidenceTier": tier_df.replace({np.nan: None}).to_dict(orient="records"),
            "hourOfDay": hour_df.replace({np.nan: None}).to_dict(orient="records"),
            "dayOfWeek": dow_df.replace({np.nan: None}).to_dict(orient="records"),
        },
        "recommendations": recommendations,
        "saved_baseline_model_reference": saved_model_meta,
        "reproducibility": {
            "random_state": RANDOM_STATE,
            "min_train_fraction": MIN_TRAIN_FRACTION,
            "test_fraction": TEST_FRACTION,
            "model": "HistGradientBoostingClassifier",
            "hyperparams": {
                "max_depth": 4,
                "learning_rate": 0.08,
                "max_iter": 200,
                "min_samples_leaf": 15,
                "class_weight": "balanced_sample_weight",
            },
            "sorted_by": "createdAt",
            "shuffle": False,
        },
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    def _json_default(obj: object) -> object:
        if isinstance(obj, (np.floating, np.integer)):
            return obj.item()
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
            return None
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

    (OUT_DIR / "diagnostic_metrics.json").write_text(
        json.dumps(metrics_out, indent=2, default=_json_default),
        encoding="utf-8",
    )
    thr_df.to_csv(OUT_DIR / "threshold_analysis.csv", index=False)
    wl_stats.to_csv(OUT_DIR / "feature_win_loss_stats.csv", index=False)
    fold_df.to_csv(OUT_DIR / "fold_metrics.csv", index=False)
    pair_df.to_csv(OUT_DIR / "pair_metrics.csv", index=False)
    hour_df.to_csv(OUT_DIR / "hourly_metrics.csv", index=False)
    # Extra detail kept in JSON; also write tier/dow for convenience (not required)
    tier_df.to_csv(OUT_DIR / "confidence_tier_metrics.csv", index=False)
    dow_df.to_csv(OUT_DIR / "day_of_week_metrics.csv", index=False)

    write_report(
        OUT_DIR / "diagnostic_report.md",
        summary,
        thr_df,
        fold_df,
        dominance,
        leakage,
        drift,
        baselines,
        recommendations,
    )

    # --- Console summary ---
    print("\n=== Stage 3.1 summary ===")
    print(f"OOF rows={int(ok_mask.sum())}  avg AUC={fmt(oof_avg_auc, 4)}  "
          f"avg PR-AUC={fmt(oof_avg_pr, 4)}  pooled AUC={fmt(pooled_auc, 4)}")
    print(
        f"Imbalance: wins={baselines['n_wins']} losses={baselines['n_losses']} "
        f"({win_rate:.1%} WR)"
    )
    print("Thresholds (OOF):")
    for _, r in thr_df.iterrows():
        print(
            f"  thr={r['threshold']:.2f}  signals={int(r['n_signals']):4d}  "
            f"P={r['precision']:.3f}  R={r['recall']:.3f}  F1={r['f1']:.3f}"
        )
    print(
        f"Top2 dominance share={fmt(top2_share)}  dominates={dominates}  "
        f"only_top2_auc={fmt(last_ablation.get('only_top2_auc'), 4)}  "
        f"full_auc={fmt(last_ablation.get('full_auc'), 4)}"
    )
    print(f"\nA) Strongest reliable signals: {recommendations['A']}")
    print(f"B) Unstable features: {recommendations['B']}")
    print(f"C) Possible leakage: {recommendations['C']}")
    print(f"D) Recommended next experiment: {recommendations['D']}")
    print(f"\nWrote diagnostics -> {OUT_DIR}")
    for name in (
        "diagnostic_metrics.json",
        "threshold_analysis.csv",
        "feature_win_loss_stats.csv",
        "fold_metrics.csv",
        "pair_metrics.csv",
        "hourly_metrics.csv",
        "diagnostic_report.md",
    ):
        print(f"  - {OUT_DIR / name}")


if __name__ == "__main__":
    main()

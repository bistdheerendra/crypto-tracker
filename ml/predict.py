#!/usr/bin/env python3
"""
Stage 4 — display-only win-probability inference.

Reads a JSON object from stdin (feature name -> number|null), loads
ml/models/baseline_classifier.joblib, builds the vector in the saved
feature_columns order, predicts P(win), prints:
  {"winProbability": <float>, "modelVersion": "<string>"}

Exit 0 on success; non-zero + JSON {"error": "..."} on failure.

Imputation matches ml/train.py feature_matrix():
  coerce numeric → fillna(column median from training CSV) → fillna(0)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "baseline_classifier.joblib"
DATA_PATH = ROOT / "data" / "training_dataset.csv"


def load_training_medians(feature_columns: list[str]) -> pd.Series:
    if not DATA_PATH.exists():
        return pd.Series({c: 0.0 for c in feature_columns}, dtype=float)
    df = pd.read_csv(DATA_PATH)
    present = [c for c in feature_columns if c in df.columns]
    X = df[present].apply(pd.to_numeric, errors="coerce")
    med = X.median(numeric_only=True)
    # Columns missing from CSV (shouldn't happen) → 0
    return med.reindex(feature_columns).fillna(0.0)


def main() -> int:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            print(json.dumps({"error": "empty stdin"}), flush=True)
            return 1
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            print(json.dumps({"error": "stdin JSON must be an object"}), flush=True)
            return 1
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"invalid JSON: {e}"}), flush=True)
        return 1

    if not MODEL_PATH.exists():
        print(json.dumps({"error": f"model not found: {MODEL_PATH}"}), flush=True)
        return 2

    try:
        bundle = joblib.load(MODEL_PATH)
        model = bundle["model"]
        feature_columns: list[str] = list(bundle["feature_columns"])
        fold = bundle.get("last_usable_fold")
        model_version = (
            f"baseline_wf_fold{fold}" if fold is not None else "baseline_classifier"
        )
    except Exception as e:  # noqa: BLE001 — surface load errors as JSON
        print(json.dumps({"error": f"failed to load model: {e}"}), flush=True)
        return 2

    medians = load_training_medians(feature_columns)
    row = []
    for col in feature_columns:
        val = payload.get(col, None)
        if val is None or val == "":
            row.append(np.nan)
        else:
            try:
                row.append(float(val))
            except (TypeError, ValueError):
                row.append(np.nan)

    X = pd.DataFrame([row], columns=feature_columns)
    X = X.fillna(medians).fillna(0.0)

    try:
        proba = float(model.predict_proba(X)[0, 1])
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": f"predict failed: {e}"}), flush=True)
        return 3

    print(
        json.dumps({"winProbability": proba, "modelVersion": model_version}),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

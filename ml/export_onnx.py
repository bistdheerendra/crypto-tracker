#!/usr/bin/env python3
"""Export baseline joblib model → ONNX + feature medians JSON for Node inference on Vercel."""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
JOBLIB_PATH = MODEL_DIR / "baseline_classifier.joblib"
ONNX_PATH = MODEL_DIR / "baseline_classifier.onnx"
MEDIANS_PATH = MODEL_DIR / "feature_medians.json"
COLUMNS_PATH = MODEL_DIR / "feature_columns.json"
DATA_PATH = ROOT / "data" / "training_dataset.csv"


def main() -> None:
    if not JOBLIB_PATH.exists():
        raise SystemExit(f"Missing {JOBLIB_PATH}")

    bundle = joblib.load(JOBLIB_PATH)
    model = bundle["model"]
    feature_columns: list[str] = list(bundle["feature_columns"])
    fold = bundle.get("last_usable_fold")
    model_version = (
        f"baseline_wf_fold{fold}" if fold is not None else "baseline_classifier"
    )

    if DATA_PATH.exists():
        df = pd.read_csv(DATA_PATH)
        present = [c for c in feature_columns if c in df.columns]
        X = df[present].apply(pd.to_numeric, errors="coerce")
        med = X.median(numeric_only=True).reindex(feature_columns).fillna(0.0)
        medians = {c: float(med[c]) for c in feature_columns}
    else:
        medians = {c: 0.0 for c in feature_columns}

    n = len(feature_columns)
    initial_type = [("float_input", FloatTensorType([None, n]))]
    onnx_model = convert_sklearn(
        model,
        initial_types=initial_type,
        target_opset=15,
        options={id(model): {"zipmap": False}},
    )
    ONNX_PATH.write_bytes(onnx_model.SerializeToString())

    COLUMNS_PATH.write_text(
        json.dumps(
            {
                "feature_columns": feature_columns,
                "modelVersion": model_version,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    MEDIANS_PATH.write_text(json.dumps(medians, indent=2) + "\n", encoding="utf-8")

    # Sanity: ONNX vs sklearn on a zero vector after median fill
    import onnxruntime as ort  # optional local check

    row = np.array([[medians[c] for c in feature_columns]], dtype=np.float32)
    sk_proba = float(model.predict_proba(row)[0, 1])
    sess = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
    outputs = sess.run(None, {"float_input": row})
    # outputs[1] is usually probabilities shape (n, 2) when zipmap=False
    proba = outputs[1]
    onnx_proba = float(proba[0][1]) if proba.ndim == 2 else float(proba[0])
    print(f"Wrote {ONNX_PATH} ({ONNX_PATH.stat().st_size} bytes)")
    print(f"Wrote {MEDIANS_PATH}")
    print(f"Wrote {COLUMNS_PATH}")
    print(f"sklearn={sk_proba:.6f} onnx={onnx_proba:.6f} delta={abs(sk_proba - onnx_proba):.6g}")


if __name__ == "__main__":
    main()

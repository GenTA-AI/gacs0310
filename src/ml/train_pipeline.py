#!/usr/bin/env python

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

from feature_loader import load_training_data


ROOT_DIR = Path(__file__).resolve().parents[2]


def parse_args():
    parser = argparse.ArgumentParser(description="Train GACS ML priority model")
    parser.add_argument("--input", default="data/training_data.csv")
    parser.add_argument("--registry", default="src/features/feature-registry.json")
    parser.add_argument("--output-dir", default="data/models/ml")
    parser.add_argument("--model-version", default=None)
    return parser.parse_args()


def build_model():
    return RandomForestRegressor(
        n_estimators=200,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )


def compute_metrics(model, x_eval, y_eval):
    predictions = model.predict(x_eval)

    metrics = {
        "sample_count": int(len(y_eval)),
        "mae": float(mean_absolute_error(y_eval, predictions)),
        "rmse": float(np.sqrt(mean_squared_error(y_eval, predictions))),
        "r2": None,
    }

    if len(y_eval) >= 2:
        metrics["r2"] = float(r2_score(y_eval, predictions))

    return metrics


def export_onnx(model, output_path: Path, feature_count: int):
    initial_types = [("input", FloatTensorType([None, feature_count]))]
    onnx_model = convert_sklearn(model, initial_types=initial_types, target_opset=12)

    with output_path.open("wb") as file:
        file.write(onnx_model.SerializeToString())


def main():
    args = parse_args()

    input_path = ROOT_DIR / args.input
    registry_path = ROOT_DIR / args.registry
    output_dir = ROOT_DIR / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    model_version = args.model_version or datetime.now(timezone.utc).strftime("rf_%Y%m%dT%H%M%SZ")

    x, y, feature_names, training_frame = load_training_data(input_path, registry_path)

    if len(y) == 0:
      raise ValueError("No usable training rows found")

    if len(y) >= 5:
        x_train, x_eval, y_train, y_eval = train_test_split(
            x,
            y,
            test_size=0.2,
            random_state=42,
        )
    else:
        x_train, x_eval, y_train, y_eval = x, x, y, y

    model = build_model()
    model.fit(x_train, y_train)

    metrics = compute_metrics(model, x_eval, y_eval)

    model_path = output_dir / f"{model_version}.joblib"
    onnx_path = output_dir / f"{model_version}.onnx"
    feature_order_path = output_dir / f"{model_version}.features.json"
    metadata_path = output_dir / f"{model_version}.metadata.json"

    joblib.dump(model, model_path)
    export_onnx(model, onnx_path, len(feature_names))

    feature_versions = sorted(
        str(value)
        for value in training_frame.get("feature_version", []).dropna().unique()
    )

    metadata = {
        "model_version": model_version,
        "model_type": "RandomForestRegressor",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "input_path": str(input_path),
        "model_path": str(model_path),
        "onnx_path": str(onnx_path),
        "feature_order_path": str(feature_order_path),
        "feature_versions": feature_versions,
        "feature_count": len(feature_names),
        "training_rows": int(len(y)),
        "metrics": metrics,
        "promoted": False,
    }

    with feature_order_path.open("w", encoding="utf-8") as file:
        json.dump(feature_names, file, indent=2)

    with metadata_path.open("w", encoding="utf-8") as file:
        json.dump(metadata, file, indent=2)

    shutil.copyfile(model_path, output_dir / "candidate.joblib")
    shutil.copyfile(onnx_path, output_dir / "candidate.onnx")
    shutil.copyfile(feature_order_path, output_dir / "candidate.features.json")
    shutil.copyfile(metadata_path, output_dir / "candidate.metadata.json")

    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
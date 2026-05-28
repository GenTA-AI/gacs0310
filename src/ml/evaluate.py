#!/usr/bin/env python

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from feature_loader import load_training_data
from model_registry import load_registry, get_latest_model


ROOT_DIR = Path(__file__).resolve().parents[2]


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate candidate ML model")
    parser.add_argument("--input", default="data/training_data.csv")
    parser.add_argument("--registry", default="src/features/feature-registry.json")
    parser.add_argument("--model-dir", default="data/models/ml")
    parser.add_argument("--threshold", type=float, default=0.02)
    return parser.parse_args()


def compute_metrics(model, x, y):
    predictions = model.predict(x)

    metrics = {
        "sample_count": int(len(y)),
        "mae": float(mean_absolute_error(y, predictions)),
        "rmse": float(np.sqrt(mean_squared_error(y, predictions))),
        "r2": None,
    }

    if len(y) >= 2:
        metrics["r2"] = float(r2_score(y, predictions))

    return metrics


def should_promote(candidate_metrics, latest_model, threshold):
    if latest_model is None:
        return True, "no_existing_model"

    latest_metrics = latest_model.get("metrics", {})
    candidate_r2 = candidate_metrics.get("r2")
    latest_r2 = latest_metrics.get("r2")

    if candidate_r2 is not None and latest_r2 is not None:
        if candidate_r2 > latest_r2 + threshold:
            return True, "r2_improved"
        return False, "r2_not_improved_enough"

    candidate_mae = candidate_metrics.get("mae")
    latest_mae = latest_metrics.get("mae")

    if candidate_mae is not None and latest_mae is not None:
        if candidate_mae < latest_mae:
            return True, "mae_improved"
        return False, "mae_not_improved"

    return False, "insufficient_metrics"


def main():
    args = parse_args()

    input_path = ROOT_DIR / args.input
    registry_path = ROOT_DIR / args.registry
    model_dir = ROOT_DIR / args.model_dir

    candidate_model_path = model_dir / "candidate.joblib"
    candidate_metadata_path = model_dir / "candidate.metadata.json"
    evaluation_path = model_dir / "candidate.evaluation.json"
    model_registry_path = model_dir / "model_registry.json"

    if not candidate_model_path.exists():
        raise FileNotFoundError(f"Candidate model not found: {candidate_model_path}")

    model = joblib.load(candidate_model_path)
    x, y, feature_names, _ = load_training_data(input_path, registry_path)

    if len(y) == 0:
        raise ValueError("No evaluation rows found")

    candidate_metrics = compute_metrics(model, x, y)

    candidate_metadata = {}
    if candidate_metadata_path.exists():
        candidate_metadata = json.loads(candidate_metadata_path.read_text(encoding="utf-8"))

    registry = load_registry(model_registry_path)
    latest_model = get_latest_model(registry)

    promote, reason = should_promote(candidate_metrics, latest_model, args.threshold)

    result = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "model_version": candidate_metadata.get("model_version"),
        "feature_count": len(feature_names),
        "candidate_metrics": candidate_metrics,
        "baseline_model": latest_model,
        "promotion_recommended": promote,
        "promotion_reason": reason,
        "promotion_threshold": args.threshold,
    }

    evaluation_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
#!/usr/bin/env python

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_registry(path: Path):
    return load_json(path, {
        "schema_version": 1,
        "latest_model_version": None,
        "updated_at": None,
        "models": [],
    })


def save_registry(path: Path, registry: dict):
    registry["updated_at"] = now_iso()
    write_json(path, registry)


def get_latest_model(registry: dict):
    latest_version = registry.get("latest_model_version")
    if not latest_version:
        return None

    for model in registry.get("models", []):
        if model.get("model_version") == latest_version:
            return model

    return None


def upsert_model(registry: dict, model_entry: dict):
    models = registry.setdefault("models", [])
    model_version = model_entry["model_version"]

    replaced = False
    for index, existing in enumerate(models):
        if existing.get("model_version") == model_version:
            models[index] = {**existing, **model_entry}
            replaced = True
            break

    if not replaced:
        models.append(model_entry)


def promote_candidate(model_dir: Path):
    registry_path = model_dir / "model_registry.json"
    candidate_metadata_path = model_dir / "candidate.metadata.json"
    candidate_evaluation_path = model_dir / "candidate.evaluation.json"

    metadata = load_json(candidate_metadata_path, None)
    evaluation = load_json(candidate_evaluation_path, None)

    if metadata is None:
        raise FileNotFoundError(f"Missing candidate metadata: {candidate_metadata_path}")

    if evaluation is None:
        raise FileNotFoundError(f"Missing candidate evaluation: {candidate_evaluation_path}")

    registry = load_registry(registry_path)
    model_version = metadata["model_version"]
    should_promote = bool(evaluation.get("promotion_recommended"))

    model_entry = {
        **metadata,
        "metrics": evaluation.get("candidate_metrics", metadata.get("metrics", {})),
        "evaluation": evaluation,
        "promoted": should_promote,
        "registered_at": now_iso(),
    }

    if should_promote:
        for model in registry.get("models", []):
            model["promoted"] = False

        shutil.copyfile(model_dir / "candidate.onnx", model_dir / "latest.onnx")
        shutil.copyfile(model_dir / "candidate.joblib", model_dir / "latest.joblib")
        shutil.copyfile(model_dir / "candidate.features.json", model_dir / "latest.features.json")

        model_entry["promoted_at"] = now_iso()
        model_entry["latest_onnx_path"] = str(model_dir / "latest.onnx")
        registry["latest_model_version"] = model_version

        write_json(model_dir / "latest.metadata.json", model_entry)

    upsert_model(registry, model_entry)
    save_registry(registry_path, registry)

    return {
        "status": "promoted" if should_promote else "registered_not_promoted",
        "model_version": model_version,
        "registry_path": str(registry_path),
    }


def parse_args():
    parser = argparse.ArgumentParser(description="Manage GACS ML model registry")
    subparsers = parser.add_subparsers(dest="command", required=True)

    promote_parser = subparsers.add_parser("promote")
    promote_parser.add_argument("--model-dir", default="data/models/ml")

    return parser.parse_args()


def main():
    args = parse_args()

    if args.command == "promote":
        result = promote_candidate(ROOT_DIR / args.model_dir)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
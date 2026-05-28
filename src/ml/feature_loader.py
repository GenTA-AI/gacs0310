import base64
import json
from pathlib import Path

import numpy as np
import pandas as pd


MODEL_FEATURE_TYPES = {
    "numeric",
    "number",
    "float",
    "decimal",
    "integer",
    "int",
    "boolean",
}


def load_feature_registry(registry_path: str | Path) -> dict:
    with Path(registry_path).open("r", encoding="utf-8") as file:
        return json.load(file)


def get_model_feature_names(registry: dict) -> list[str]:
    features = registry.get("features", [])
    return [
        feature["feature_name"]
        for feature in features
        if str(feature.get("feature_type", "")).lower() in MODEL_FEATURE_TYPES
    ]


def decode_feature_vector(value) -> dict:
    if isinstance(value, dict):
        return value

    if value is None or (isinstance(value, float) and np.isnan(value)):
        return {}

    text = str(value).strip()
    if not text:
        return {}

    try:
        decoded = base64.b64decode(text).decode("utf-8")
        return json.loads(decoded)
    except Exception:
        return json.loads(text)


def coerce_feature_value(value) -> float:
    if value is None:
        return 0.0

    if isinstance(value, bool):
        return 1.0 if value else 0.0

    if isinstance(value, (int, float, np.integer, np.floating)):
        if np.isfinite(value):
            return float(value)
        return 0.0

    try:
        number = float(value)
        if np.isfinite(number):
            return number
    except Exception:
        return 0.0

    return 0.0


def load_training_data(
    csv_path: str | Path,
    registry_path: str | Path,
) -> tuple[np.ndarray, np.ndarray, list[str], pd.DataFrame]:
    df = pd.read_csv(csv_path)

    if "feature_vector_base64" not in df.columns:
        raise ValueError("training CSV must contain feature_vector_base64")

    if "label" not in df.columns:
        raise ValueError("training CSV must contain label")

    registry = load_feature_registry(registry_path)
    feature_names = get_model_feature_names(registry)

    rows = []
    labels = []

    for _, row in df.iterrows():
        feature_vector = decode_feature_vector(row["feature_vector_base64"])
        rows.append([coerce_feature_value(feature_vector.get(name)) for name in feature_names])
        labels.append(coerce_feature_value(row["label"]))

    x = np.asarray(rows, dtype=np.float32)
    y = np.asarray(labels, dtype=np.float32)

    valid_mask = np.isfinite(y)
    return x[valid_mask], y[valid_mask], feature_names, df.loc[valid_mask].copy()
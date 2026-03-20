"""
Generate scene_metadata.json files from gacs_dataset.csv.

The video generator expects metadata at:
  data/scenes/{video_id}/scene_metadata.json

The CSV already has start_time, end_time, duration per scene.
This script groups by video_id and creates the JSON files.
"""
import json
from pathlib import Path

import pandas as pd

CSV_PATH = Path("gacs_0202/data/embeddings/gacs_dataset.csv")
SCENES_DIR = Path("gacs_0202/data/scenes")

df = pd.read_csv(CSV_PATH)
print(f"Total scenes in CSV: {len(df)}")
print(f"Unique videos: {df['video_id'].nunique()}")

created = 0
for video_id, group in df.groupby("video_id"):
    scene_dir = SCENES_DIR / video_id
    scene_dir.mkdir(parents=True, exist_ok=True)

    scenes = []
    for _, row in group.iterrows():
        scene = {
            "scene_id": row["scene_id"],
            "video_id": row["video_id"],
            "scene_index": int(row["scene_id"].rsplit("_s", 1)[1]) if "_s" in str(row["scene_id"]) else 0,
            "start_frame": int(row["start_time"] * 30),  # approximate at 30fps
            "end_frame": int(row["end_time"] * 30),
            "start_time": float(row["start_time"]),
            "end_time": float(row["end_time"]),
            "duration": float(row["duration"]),
        }
        scenes.append(scene)

    # Sort by scene_index
    scenes.sort(key=lambda s: s["scene_index"])

    metadata_path = scene_dir / "scene_metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(scenes, f, indent=2)
    created += 1

print(f"\nCreated {created} scene_metadata.json files")

# Verify a sample
sample_vid = df["video_id"].iloc[0]
sample_path = SCENES_DIR / sample_vid / "scene_metadata.json"
with open(sample_path) as f:
    sample = json.load(f)
print(f"\nSample ({sample_vid}): {len(sample)} scenes")
print(f"  First: {sample[0]['scene_id']} [{sample[0]['start_time']:.1f}s - {sample[0]['end_time']:.1f}s]")
if len(sample) > 1:
    print(f"  Last:  {sample[-1]['scene_id']} [{sample[-1]['start_time']:.1f}s - {sample[-1]['end_time']:.1f}s]")

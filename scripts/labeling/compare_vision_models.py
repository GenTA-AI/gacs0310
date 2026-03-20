"""
Multi-model Vision Labeling Comparison
=======================================
Same keyframe images → Claude / GPT-4V / Gemini → mood labels → SBERT embeddings → compare vectors.

Answers: "Do different vision models produce similar emotion coordinates?"
"""
import base64
import json
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

# Load env
load_dotenv(Path("gacs_0202/.env"))

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

SCENES_DIR = Path("gacs_0202/data/scenes")
OUTPUT_DIR = Path("research/model_comparison")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Shared prompt (same for all models)
MOOD_PROMPT = """Analyze the mood/emotion of this video frame.
Return EXACTLY 5 mood descriptor words, comma-separated.
Example: tense, mysterious, dark, suspenseful, foreboding
Output ONLY the 5 words, nothing else."""

STYLE_PROMPT = """Analyze the visual style of this video frame.
Return EXACTLY 3 style descriptor words, comma-separated.
Example: cinematic, warm-toned, shallow-focus
Output ONLY the 3 words, nothing else."""


def encode_image(path: Path) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def parse_words(text: str) -> list:
    return [w.strip().lower().rstrip(".") for w in text.split(",") if w.strip()]


# ============================================================================
# Vision API Callers
# ============================================================================

def call_claude(image_path: Path, prompt: str) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    img_data = encode_image(image_path)
    ext = image_path.suffix.lower()
    media_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}.get(
        ext.lstrip("."), "image/jpeg"
    )
    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=128,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": img_data}},
                {"type": "text", "text": prompt},
            ],
        }],
    )
    return msg.content[0].text.strip()


def call_openai(image_path: Path, prompt: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)
    img_data = encode_image(image_path)
    ext = image_path.suffix.lower().lstrip(".")
    media_type = f"image/{'jpeg' if ext in ('jpg','jpeg') else 'png'}"
    resp = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=128,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{img_data}"}},
                {"type": "text", "text": prompt},
            ],
        }],
    )
    return resp.choices[0].message.content.strip()


def call_gemini(image_path: Path, prompt: str) -> str:
    import google.generativeai as genai
    genai.configure(api_key=GOOGLE_API_KEY)
    model = genai.GenerativeModel("gemini-2.0-flash")
    from PIL import Image
    img = Image.open(image_path)
    resp = model.generate_content([prompt, img])
    return resp.text.strip()


# ============================================================================
# Main Comparison
# ============================================================================

def select_sample_images(n=20) -> list:
    """Select diverse sample images across categories."""
    all_images = sorted(SCENES_DIR.glob("*.jpg"))
    if not all_images:
        raise FileNotFoundError(f"No images in {SCENES_DIR}")

    # Group by category prefix
    categories = {}
    for img in all_images:
        parts = img.stem.split("_")
        # e.g., gacs_advertisements_00_xxx_scene_03
        if len(parts) >= 2:
            cat = parts[1]  # advertisements, movie_trailers, etc.
            categories.setdefault(cat, []).append(img)

    # Sample evenly from each category
    selected = []
    per_cat = max(1, n // len(categories))
    for cat, images in sorted(categories.items()):
        step = max(1, len(images) // per_cat)
        selected.extend(images[::step][:per_cat])

    # Fill remaining
    if len(selected) < n:
        remaining = [img for img in all_images if img not in selected]
        step = max(1, len(remaining) // (n - len(selected)))
        selected.extend(remaining[::step][:n - len(selected)])

    return selected[:n]


def run_comparison(n_samples=20):
    print("=" * 70)
    print("MULTI-MODEL VISION LABELING COMPARISON")
    print("=" * 70)

    # Select sample images
    images = select_sample_images(n_samples)
    print(f"\nSelected {len(images)} sample images")
    for img in images[:5]:
        print(f"  {img.name}")
    if len(images) > 5:
        print(f"  ... and {len(images)-5} more")

    # Load SBERT for embedding
    print("\nLoading SBERT model (j-hartmann emotion)...")
    sbert = SentenceTransformer("j-hartmann/emotion-english-distilroberta-base")

    results = []
    models = {
        "claude": call_claude,
        "gpt4o": call_openai,
        "gemini": call_gemini,
    }

    for i, img_path in enumerate(images):
        print(f"\n[{i+1}/{len(images)}] {img_path.name}")
        row = {"image": img_path.name}

        for model_name, caller in models.items():
            try:
                # Get mood labels
                mood_text = caller(img_path, MOOD_PROMPT)
                mood_words = parse_words(mood_text)

                # Get style labels
                style_text = caller(img_path, STYLE_PROMPT)
                style_words = parse_words(style_text)

                row[f"{model_name}_mood"] = mood_words
                row[f"{model_name}_style"] = style_words
                row[f"{model_name}_mood_text"] = ", ".join(mood_words)

                # Embed mood words
                mood_sentence = " ".join(mood_words)
                embedding = sbert.encode(mood_sentence)
                row[f"{model_name}_embedding"] = embedding

                print(f"  {model_name:8s}: {', '.join(mood_words[:5])}")
                time.sleep(0.5)  # Rate limit buffer

            except Exception as e:
                print(f"  {model_name:8s}: ERROR - {e}")
                row[f"{model_name}_mood"] = []
                row[f"{model_name}_style"] = []
                row[f"{model_name}_embedding"] = None

        results.append(row)

    # ============================================================================
    # Analysis
    # ============================================================================
    print("\n" + "=" * 70)
    print("ANALYSIS")
    print("=" * 70)

    # Compute pairwise cosine similarities between model embeddings
    from scipy.spatial.distance import cosine

    pairs = [("claude", "gpt4o"), ("claude", "gemini"), ("gpt4o", "gemini")]
    pair_sims = {p: [] for p in pairs}

    for row in results:
        for m1, m2 in pairs:
            e1 = row.get(f"{m1}_embedding")
            e2 = row.get(f"{m2}_embedding")
            if e1 is not None and e2 is not None:
                sim = 1 - cosine(e1, e2)
                pair_sims[(m1, m2)].append(sim)

    print("\nPairwise Cosine Similarity (mood embeddings):")
    print("-" * 50)
    for (m1, m2), sims in pair_sims.items():
        if sims:
            mean_sim = np.mean(sims)
            std_sim = np.std(sims)
            min_sim = np.min(sims)
            max_sim = np.max(sims)
            print(f"  {m1:8s} vs {m2:8s}: {mean_sim:.4f} +/- {std_sim:.4f}  "
                  f"(min={min_sim:.4f}, max={max_sim:.4f})")

    # Compute word overlap
    print("\nMood Word Overlap (Jaccard similarity):")
    print("-" * 50)
    for (m1, m2), _ in pair_sims.items():
        overlaps = []
        for row in results:
            w1 = set(row.get(f"{m1}_mood", []))
            w2 = set(row.get(f"{m2}_mood", []))
            if w1 and w2:
                jaccard = len(w1 & w2) / len(w1 | w2)
                overlaps.append(jaccard)
        if overlaps:
            print(f"  {m1:8s} vs {m2:8s}: {np.mean(overlaps):.4f} "
                  f"(exact word match rate)")

    # Per-image detail: which images had biggest disagreements?
    print("\nBiggest Disagreements:")
    print("-" * 50)
    disagreements = []
    for row in results:
        min_sim = 1.0
        for m1, m2 in pairs:
            e1, e2 = row.get(f"{m1}_embedding"), row.get(f"{m2}_embedding")
            if e1 is not None and e2 is not None:
                sim = 1 - cosine(e1, e2)
                min_sim = min(min_sim, sim)
        disagreements.append((min_sim, row))

    disagreements.sort(key=lambda x: x[0])
    for sim, row in disagreements[:5]:
        print(f"  {row['image']} (min_sim={sim:.4f})")
        for mn in ["claude", "gpt4o", "gemini"]:
            words = row.get(f"{mn}_mood_text", "N/A")
            print(f"    {mn:8s}: {words}")

    # Save results
    save_results = []
    for row in results:
        save_row = {"image": row["image"]}
        for mn in ["claude", "gpt4o", "gemini"]:
            save_row[f"{mn}_mood"] = row.get(f"{mn}_mood_text", "")
            save_row[f"{mn}_style"] = ", ".join(row.get(f"{mn}_style", []))
        save_results.append(save_row)

    results_df = pd.DataFrame(save_results)
    results_df.to_csv(OUTPUT_DIR / "model_comparison_labels.csv", index=False)

    # Save similarity stats
    stats = {}
    for (m1, m2), sims in pair_sims.items():
        if sims:
            stats[f"{m1}_vs_{m2}"] = {
                "mean_cosine_sim": float(np.mean(sims)),
                "std": float(np.std(sims)),
                "min": float(np.min(sims)),
                "max": float(np.max(sims)),
                "n_samples": len(sims),
            }
    with open(OUTPUT_DIR / "model_comparison_stats.json", "w") as f:
        json.dump(stats, f, indent=2)

    # Save full embeddings for further analysis
    emb_data = {}
    for row in results:
        img = row["image"]
        emb_data[img] = {}
        for mn in ["claude", "gpt4o", "gemini"]:
            e = row.get(f"{mn}_embedding")
            if e is not None:
                emb_data[img][mn] = e.tolist()
    with open(OUTPUT_DIR / "model_embeddings.json", "w") as f:
        json.dump(emb_data, f)

    print(f"\nResults saved to {OUTPUT_DIR}/")
    print("  model_comparison_labels.csv")
    print("  model_comparison_stats.json")
    print("  model_embeddings.json")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("-n", type=int, default=20, help="Number of sample images")
    args = parser.parse_args()
    run_comparison(args.n)

"""
Fast parallel labeling - mood only, all 3 models, with concurrent API calls.
Reduces time from ~9 hours to ~2-3 hours by:
  1. Only labeling mood (not style/objects) - can add later
  2. Calling 3 models concurrently (not sequentially)
  3. Minimal delays between calls

Usage:
    python label_fast.py                # Label all unlabeled scenes
    python label_fast.py --limit 100    # Label first 100 only
    python label_fast.py --status       # Check progress
"""
import base64
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path("gacs_0202/.env"))

SCENES_DIR = Path("gacs_0202/data/scenes")
ANNOTATIONS_DIR = Path("gacs_0202/data/annotations")
ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

MOOD_PROMPT = """Analyze the mood/emotion of this video frame.
Return EXACTLY 5 mood descriptor words, comma-separated.
Example: tense, mysterious, dark, suspenseful, foreboding
Output ONLY the 5 words, nothing else."""

STYLE_PROMPT = """Analyze the visual style of this video frame.
Return EXACTLY 3 style descriptor words, comma-separated.
Example: cinematic, warm-toned, shallow-focus
Output ONLY the 3 words, nothing else."""

OBJECT_PROMPT = """List the main objects/subjects visible in this video frame.
Return 2-5 object names, comma-separated.
Example: car, road, sunset, mountains
Output ONLY the object names, nothing else."""


def encode_image(path: Path) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def parse_words(text: str) -> list:
    text = text.strip().strip('"').strip("'")
    words = [w.strip().lower().rstrip(".").strip('"').strip("'")
             for w in text.split(",") if w.strip()]
    return [w for w in words if len(w) < 30 and not w.startswith("i ") and not w.startswith("I ")]


# Pre-initialize clients (reuse across calls)
_claude_client = None
_openai_client = None


def get_claude_client():
    global _claude_client
    if _claude_client is None:
        import anthropic
        _claude_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _claude_client


def get_openai_client():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        _openai_client = OpenAI(api_key=OPENAI_API_KEY)
    return _openai_client


def call_claude(img_data: str, media_type: str, prompt: str) -> str:
    client = get_claude_client()
    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=128,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": img_data}},
            {"type": "text", "text": prompt},
        ]}],
    )
    return msg.content[0].text.strip()


def call_openai(img_data: str, media_type: str, prompt: str) -> str:
    client = get_openai_client()
    resp = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=128,
        messages=[{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{img_data}"}},
            {"type": "text", "text": prompt},
        ]}],
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


def label_single_model(model_name: str, image_path: Path, img_data: str, media_type: str) -> dict:
    """Label with one model - all 3 prompts."""
    result = {"model": model_name}
    try:
        if model_name == "claude":
            mood_text = call_claude(img_data, media_type, MOOD_PROMPT)
            style_text = call_claude(img_data, media_type, STYLE_PROMPT)
            obj_text = call_claude(img_data, media_type, OBJECT_PROMPT)
        elif model_name == "gpt4o":
            mood_text = call_openai(img_data, media_type, MOOD_PROMPT)
            style_text = call_openai(img_data, media_type, STYLE_PROMPT)
            obj_text = call_openai(img_data, media_type, OBJECT_PROMPT)
        else:  # gemini
            mood_text = call_gemini(image_path, MOOD_PROMPT)
            style_text = call_gemini(image_path, STYLE_PROMPT)
            obj_text = call_gemini(image_path, OBJECT_PROMPT)

        result["mood"] = parse_words(mood_text)
        result["style"] = parse_words(style_text)
        result["objects"] = parse_words(obj_text)
    except Exception as e:
        result["mood"] = []
        result["style"] = []
        result["objects"] = []
        result["error"] = str(e)

    return result


def get_unlabeled_scenes() -> list:
    """Load scenes and filter to unlabeled ones."""
    cache_path = Path("research/new_scenes_cache.json")
    if not cache_path.exists():
        print("ERROR: Run process_new_videos.py --phase scenes first")
        sys.exit(1)

    with open(cache_path) as f:
        all_scenes = json.load(f)

    unlabeled = []
    for scene in all_scenes:
        kf_path = Path(scene["keyframe_path"])
        cache = ANNOTATIONS_DIR / f"{kf_path.stem}_multi.json"
        if not cache.exists() and kf_path.exists():
            unlabeled.append(scene)

    return unlabeled


def show_status():
    """Show labeling progress."""
    cache_path = Path("research/new_scenes_cache.json")
    if not cache_path.exists():
        print("No scenes cache found")
        return

    with open(cache_path) as f:
        all_scenes = json.load(f)

    labeled = 0
    for scene in all_scenes:
        kf_path = Path(scene["keyframe_path"])
        cache = ANNOTATIONS_DIR / f"{kf_path.stem}_multi.json"
        if cache.exists():
            labeled += 1

    print(f"Total scenes: {len(all_scenes)}")
    print(f"Labeled: {labeled}")
    print(f"Remaining: {len(all_scenes) - labeled}")
    print(f"Progress: {labeled/len(all_scenes)*100:.1f}%")


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--workers", type=int, default=3,
                        help="Concurrent model calls per image")
    args = parser.parse_args()

    if args.status:
        show_status()
        return

    scenes = get_unlabeled_scenes()
    if args.limit > 0:
        scenes = scenes[:args.limit]

    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] Fast labeling: {len(scenes)} scenes × 3 models (concurrent)")
    print(f"[{ts}] Estimated time: {len(scenes) * 6 / 60:.0f} minutes")

    success = 0
    errors = 0
    start = time.time()

    for i, scene in enumerate(scenes):
        kf_path = Path(scene["keyframe_path"])
        cache_path = ANNOTATIONS_DIR / f"{kf_path.stem}_multi.json"

        # Pre-encode image once
        img_data = encode_image(kf_path)
        media_type = "image/jpeg"

        # Call all 3 models concurrently
        labels = {}
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {}
            for model_name in ["claude", "gpt4o", "gemini"]:
                f = executor.submit(label_single_model, model_name, kf_path, img_data, media_type)
                futures[f] = model_name

            for f in as_completed(futures):
                model_name = futures[f]
                result = f.result()
                labels[model_name] = result

        # Check for errors
        has_error = any("error" in labels[m] for m in labels)
        all_empty = all(not labels[m].get("mood") for m in labels)

        if all_empty:
            errors += 1
        else:
            success += 1

        # Save cache
        with open(cache_path, "w") as f:
            json.dump(labels, f, indent=2)

        # Progress log (every 10 or on errors)
        if (i + 1) % 10 == 0 or i == 0 or has_error:
            elapsed = time.time() - start
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            eta_min = (len(scenes) - i - 1) / rate / 60 if rate > 0 else 0
            ts = datetime.now().strftime("%H:%M:%S")

            moods = []
            for m in ["claude", "gpt4o", "gemini"]:
                mw = labels[m].get("mood", [])
                moods.append(f"{m}:{','.join(mw[:2])}" if mw else f"{m}:ERR")

            status = "ERR" if has_error else "OK"
            print(f"[{ts}] [{i+1}/{len(scenes)}] {status} | {' | '.join(moods)} | "
                  f"{rate:.1f}/s ETA:{eta_min:.0f}m")

        # Small delay to avoid rate limits
        time.sleep(0.3)

    elapsed = time.time() - start
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"\n[{ts}] DONE: {success} labeled, {errors} errors, {elapsed/60:.1f} minutes")

    # Show final status
    show_status()


if __name__ == "__main__":
    main()

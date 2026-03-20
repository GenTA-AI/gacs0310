"""
Retry failed labels for Claude and GPT-4o.
Updates existing _multi.json files in-place.
"""
import base64
import json
import os
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path("gacs_0202/.env"))

ANNOTATIONS_DIR = Path("gacs_0202/data/annotations")
SCENES_DIR = Path("gacs_0202/data/scenes")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

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
    return [w for w in words if len(w) < 30 and not w.startswith("i ")]


_claude_client = None
_openai_client = None


def call_claude(img_data: str, media_type: str, prompt: str) -> str:
    global _claude_client
    if _claude_client is None:
        import anthropic
        _claude_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    msg = _claude_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=128,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": img_data}},
            {"type": "text", "text": prompt},
        ]}],
    )
    return msg.content[0].text.strip()


def call_openai(img_data: str, media_type: str, prompt: str) -> str:
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        _openai_client = OpenAI(api_key=OPENAI_API_KEY)
    resp = _openai_client.chat.completions.create(
        model="gpt-4o",
        max_tokens=128,
        messages=[{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{img_data}"}},
            {"type": "text", "text": prompt},
        ]}],
    )
    return resp.choices[0].message.content.strip()


def label_model(model_name: str, img_data: str, media_type: str) -> dict:
    caller = call_claude if model_name == "claude" else call_openai
    result = {"model": model_name}
    try:
        result["mood"] = parse_words(caller(img_data, media_type, MOOD_PROMPT))
        result["style"] = parse_words(caller(img_data, media_type, STYLE_PROMPT))
        result["objects"] = parse_words(caller(img_data, media_type, OBJECT_PROMPT))
    except Exception as e:
        result["mood"] = []
        result["style"] = []
        result["objects"] = []
        result["error"] = str(e)
    return result


def main():
    # Find failures
    failures = []  # (path, models_to_retry)
    for f in sorted(ANNOTATIONS_DIR.glob("*_multi.json")):
        data = json.loads(f.read_text())
        retry_models = []
        c = data.get("claude", {})
        g = data.get("gpt4o", {})
        if not c.get("mood") or c.get("error"):
            retry_models.append("claude")
        if not g.get("mood") or g.get("error"):
            retry_models.append("gpt4o")
        if retry_models:
            failures.append((f, retry_models))

    print(f"[{datetime.now():%H:%M:%S}] Retrying {len(failures)} files")
    claude_count = sum(1 for _, m in failures if "claude" in m)
    gpt_count = sum(1 for _, m in failures if "gpt4o" in m)
    print(f"  Claude: {claude_count}, GPT-4o: {gpt_count}")

    success = {"claude": 0, "gpt4o": 0}
    still_failed = {"claude": 0, "gpt4o": 0}

    for i, (annot_path, models) in enumerate(failures):
        # Find corresponding image
        image_stem = annot_path.stem.replace("_multi", "")
        image_path = SCENES_DIR / f"{image_stem}.jpg"
        if not image_path.exists():
            continue

        img_data = encode_image(image_path)
        media_type = "image/jpeg"

        data = json.loads(annot_path.read_text())
        updated = False

        for model_name in models:
            result = label_model(model_name, img_data, media_type)
            if result.get("mood") and not result.get("error"):
                data[model_name] = result
                success[model_name] += 1
                updated = True
            else:
                still_failed[model_name] += 1
                err = result.get("error", "empty")[:80]
                if i == 0 or "credit" in err.lower() or "quota" in err.lower():
                    print(f"  [{i+1}] {model_name} FAIL: {err}")
                    if "credit" in err.lower() or "quota" in err.lower():
                        print(f"  !!! {model_name} billing issue - stopping {model_name} retries")
                        # Remove this model from all remaining
                        for j in range(i + 1, len(failures)):
                            if model_name in failures[j][1]:
                                failures[j][1].remove(model_name)
                                still_failed[model_name] += 1

            time.sleep(0.3)

        if updated:
            annot_path.write_text(json.dumps(data, indent=2))

        if (i + 1) % 20 == 0:
            print(f"  [{i+1}/{len(failures)}] claude:{success['claude']}ok/{still_failed['claude']}err "
                  f"gpt4o:{success['gpt4o']}ok/{still_failed['gpt4o']}err")

        if not models:  # all models removed due to billing
            continue

    print(f"\n[{datetime.now():%H:%M:%S}] RETRY COMPLETE")
    print(f"  Claude: {success['claude']} fixed, {still_failed['claude']} still failed")
    print(f"  GPT-4o: {success['gpt4o']} fixed, {still_failed['gpt4o']} still failed")


if __name__ == "__main__":
    main()

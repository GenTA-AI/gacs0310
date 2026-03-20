# GACS Research Pipeline

Generative Affective Coordinate System (GACS) - A research pipeline for mood-based video generation and YouTube experimentation.

## Overview

This system consists of three Jupyter notebooks that form a closed learning loop:

1. **gacs_dataset_builder.ipynb** - Extract affective mood labels from videos
2. **gacs_video_generator.ipynb** - Generate new videos using mood coordinates
3. **youtube_experiment_runner.ipynb** - Upload to YouTube and collect performance metrics

## Quick Start (Google Colab)

```python
# Clone the repository
!git clone https://github.com/YOUR_USERNAME/gacs_0202.git
%cd gacs_0202

# Install dependencies
!pip install opencv-python scenedetect anthropic numpy pandas Pillow matplotlib tqdm sentence-transformers moviepy scikit-learn google-api-python-client google-auth-oauthlib scipy seaborn fpdf
```

## Pipeline Flow

```
video_manifest.csv
        ↓
[Notebook 1] Scene Detection → Keyframe Extraction → Claude API Labeling → SBERT Embeddings
        ↓
data/embeddings/gacs_dataset.csv
        ↓
[Notebook 2] Mood Clustering → GACS/Baseline Video Generation
        ↓
data/generated/gacs/*.mp4, data/generated/baseline/*.mp4
        ↓
[Notebook 3] YouTube Upload → Metrics Collection → Statistical Analysis → Report
        ↓
data/experiments/report.pdf
```

## Data Schema

### gacs_dataset.csv
| Column | Description |
|--------|-------------|
| image_id | Unique keyframe identifier |
| video_id | Source video ID |
| scene_id | Scene identifier |
| keyframe_path | Path to keyframe image |
| mood_vector | SBERT embedding (384-dim) |
| mood_words | Comma-separated mood adjectives |
| style_words | Comma-separated style descriptors |
| object_words | Comma-separated object nouns |

### Generated Video Metadata
```json
{
  "video_id": "string",
  "group": "gacs | baseline",
  "mood_vector": [float],
  "mood_words": [string],
  "prompt_used": "string",
  "source_scenes": [string],
  "created_at": "ISO timestamp",
  "duration": float
}
```

## Requirements

- Python 3.8+
- OpenCV
- PySceneDetect
- Anthropic API key (for Claude)
- Google Cloud credentials (for YouTube API)
- MoviePy
- Sentence-Transformers

## Environment Variables

```bash
export ANTHROPIC_API_KEY="your-api-key"
```

## Directory Structure

```
gacs_0202/
├── video_manifest.csv
├── gacs_dataset_builder.ipynb
├── gacs_video_generator.ipynb
├── youtube_experiment_runner.ipynb
├── client_secrets.json (create from Google Cloud Console)
└── data/
    ├── raw_videos/
    ├── scenes/{video_id}/{scene_id}.jpg
    ├── annotations/{image_id}.json
    ├── embeddings/gacs_dataset.csv
    ├── generated/
    │   ├── gacs/{video_id}/
    │   └── baseline/{video_id}/
    └── experiments/
        ├── youtube_map.json
        ├── metrics.csv
        └── report.pdf
```

## License

Research use only.

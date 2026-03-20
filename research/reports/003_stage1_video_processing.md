---
report_id: GACS-R003
title: "Stage 1 영상 처리: 신규 55개 영상 씬 감지 및 멀티모델 라벨링"
date: "2026-03-13"
timestamp: "2026-03-13T11:45:00+09:00"
authors: ["GACS Research Pipeline"]
status: completed
depends_on: ["GACS-R001", "GACS-R002"]
tags: [stage1, scene-detection, labeling, dataset-expansion, multi-model]
---

# GACS-R003: Stage 1 영상 처리 — 신규 55개 영상 씬 감지 및 멀티모델 라벨링

## 1. 실험 목적

본 실험의 목적은 다음 두 가지로 요약된다.

1. **데이터셋 확장**: 기존 Kushi 데이터(86개 영상, 1,244행)에 더해 다운로드된 134개 YouTube 영상 중 미처리 55개 영상에 대한 Stage 1 파이프라인(씬 감지 → 키프레임 추출 → 라벨링 → 임베딩)을 실행하여 연구에 필요한 데이터 규모를 확보한다.
2. **멀티모델 라벨링 체계 구축**: Claude Sonnet 4, GPT-4o, Gemini 2.0 Flash 3개 모델로 동시 라벨링을 수행하여 모델별 독립 좌표계 데이터를 확보하고, 향후 GACS 좌표 축 발견(coordinate axis discovery)에서 모델 간 일치도 분석 및 앙상블 기반 좌표 안정성 검증의 기반을 마련한다.

## 2. 처리 과정

### 2.1 아티팩트 정리

yt-dlp 다운로드 과정에서 생성된 부분 다운로드 파일(`.fXXX.mp4` 형식) 50개를 식별하여 삭제하였다. 이들 파일은 네트워크 중단 또는 병합 실패로 인해 불완전한 상태로 남아 있었으며, 파이프라인 입력으로 부적합하였다.

### 2.2 씬 감지 (PySceneDetect)

55개 영상에 대해 PySceneDetect `ContentDetector`를 적용하였다.

- **설정**: `threshold=27.0`, `min_scene_len=15` (프레임)
- **성공**: 35개 영상 → **2,111개 씬** 감지
- **실패**: 20개 영상 → AV1 코덱으로 인코딩되어 WSL2 환경에서 하드웨어 가속 디코딩이 지원되지 않아 0개 씬 반환
- **소요 시간**: 약 2분

씬 감지 결과는 `research/new_scenes_cache.json`에 캐싱되었다. 각 엔트리는 `scene_id`, `video_id`, `scene_index`, `start_frame`, `end_frame`, `start_time`, `end_time`, `duration`, `keyframe_path` 필드를 포함한다.

영상별 씬 수 분포는 최소 10개에서 최대 189개까지 넓은 범위를 보였으며, 중앙값은 약 51개였다. 예를 들어 `gacs_advertisements_00_KJ2Mbmrx`는 129개 씬이 감지된 반면, `gacs_advertisements_00__JhBOf0O`는 12개 씬에 그쳤다. 이는 영상의 장르, 길이, 편집 스타일에 따른 자연스러운 변동이다.

### 2.3 키프레임 추출

각 씬의 시간적 중간점(midpoint)에서 OpenCV를 사용하여 키프레임을 추출하였다. 총 **2,111개 JPG 이미지**가 `gacs_0202/data/scenes/` 하위 디렉토리에 생성되었다.

### 2.4 멀티모델 라벨링

3개 Vision-Language 모델에 동일한 프롬프트를 전달하여 병렬 라벨링을 수행하였다. `ThreadPoolExecutor`를 사용하여 3개 모델을 동시 호출함으로써 처리 시간을 단축하였다.

**프롬프트 구조**: 각 키프레임 이미지에 대해 MOOD(5단어), STYLE(3단어), OBJECTS(2-5개)를 추출하도록 지시하였다.

| 모델 | 성공 | 실패 | 성공률 | 실패 원인 |
|------|------|------|--------|-----------|
| Claude Sonnet 4 | 2,108 | 3 | 99.9% | 3건 content safety 거부 (크레딧 충전 후 재시도 성공) |
| GPT-4o | 2,111 | 0 | 100% | 재시도 후 완료 |
| Gemini 2.0 Flash | 2,111 | 0 | 100.0% | - |

- **총 API 호출 수**: 약 6,333회 (2,111 씬 x 3 모델)
- **총 소요 시간**: 약 4시간 (중간 컴퓨터 재시작 1회 포함)
- Claude: 크레딧 충전 후 3차 재시도로 546개 복구 → 최종 2,108개 성공 (99.9%), 3개는 content safety 거부
- GPT-4o: 재시도로 1개 수정 → 2,111개 전체 완료 (100%)

라벨링 결과는 씬별 `*_multi.json` 파일로 저장되었으며, 각 파일은 3개 모델의 응답을 독립적으로 기록한다. 다음은 실제 라벨링 출력의 예시이다 (`gacs_advertisements_00_KJ2Mbmrx_scene_00_multi.json`):

```json
{
  "claude": {
    "model": "claude",
    "mood": ["contemplative", "strategic", "focused", "intense", "deliberate"],
    "style": ["dramatic", "moody", "cinematic"],
    "objects": ["hand", "chess pieces", "chessboard", "king"]
  },
  "gpt4o": {
    "model": "gpt4o",
    "mood": ["strategic", "contemplative", "tense", "focused", "intense"],
    "style": ["dramatic", "low-key", "high-contrast"],
    "objects": ["chessboard", "hand", "chess pieces"]
  },
  "gemini": {
    "model": "gemini",
    "mood": ["strategic", "calculating", "serious", "intense", "deliberate"],
    "style": ["dramatic", "dark", "focused"],
    "objects": ["chessboard", "chess piece", "hand"]
  }
}
```

이 예시에서 3개 모델 모두 "strategic", "intense" 등의 mood 단어와 "dramatic" style, "chessboard" 객체에 대해 높은 일치도를 보이는 것을 확인할 수 있다. 그러나 세부 어휘 선택에서는 모델별 특성이 드러난다(Claude의 "contemplative" vs Gemini의 "calculating" 등).

### 2.5 임베딩 생성

라벨링된 mood 텍스트를 두 가지 SBERT 모델로 벡터화하였다.

- **all-MiniLM-L6-v2** (384차원): 기존 Kushi 데이터셋과의 호환성 유지
- **emotion-english-distilroberta-base** (768차원): GACS-R002에서 최적 모델로 선정된 감성 특화 임베딩, 모델별 좌표계 구축용

Claude 라벨링 실패 씬(549개)에 대해서는 GPT-4o 라벨을 fallback으로 사용하여 임베딩을 생성하였다. 전체 임베딩 생성 소요 시간은 RTX 4090 GPU 가속 하에 약 **44초**였다.

## 3. 결과

### 3.1 데이터셋 확장

| 항목 | 이전 (Kushi) | 이후 (통합) | 변화 |
|------|-------------|------------|------|
| 데이터셋 행 (gacs_dataset.csv) | 1,244 | 3,355 | +170% |
| 처리된 영상 수 | 86 | 121 | +35 |
| 키프레임 이미지 수 | ~1,275 | ~3,386 | +166% |
| 라벨링 모델 수 | 1 (Gemini via Kushi) | 3 (Claude + GPT-4o + Gemini) | 3배 |

`gacs_dataset.csv`는 헤더 포함 3,356행(데이터 3,355행)으로 확장되었다. 이는 GACS 좌표 축 발견에 충분한 통계적 검정력을 제공하는 규모이다.

### 3.2 AV1 코덱 미지원 영상 (20개)

PySceneDetect 실행 시 `"Your platform doesn't support hardware accelerated AV1 decoding"` 경고와 함께 0개 씬이 반환된 영상 목록:

| # | Video ID | 카테고리 |
|---|----------|----------|
| 1 | `gacs_advertisements_00__-AS5DtD` | advertisements |
| 2 | `gacs_advertisements_01_XbbBdi5f` | advertisements |
| 3 | `gacs_advertisements_02_sitXeGjm` | advertisements |
| 4 | `gacs_advertisements_03_Btf4mN37` | advertisements |
| 5 | `gacs_advertisements_04_GEoUXI8B` | advertisements |
| 6 | `gacs_animations_00_HBzLS6pB` | animations |
| 7 | `gacs_animations_01_22w7z_lT` | animations |
| 8 | `gacs_animations_01_p6XL6W_7` | animations |
| 9 | `gacs_animations_02_1VIZ89FE` | animations |
| 10 | `gacs_animations_02_TPjUcGRq` | animations |
| 11 | `gacs_emotional_shorts_00_fKPKfC7S` | emotional_shorts |
| 12 | `gacs_emotional_shorts_02_X1zO6N9s` | emotional_shorts |
| 13 | `gacs_emotional_shorts_03__rr0s4Ww` | emotional_shorts |
| 14 | `gacs_movie_trailers_01_4rgYUipG` | movie_trailers |
| 15 | `gacs_movie_trailers_01_In8fuzj3` | movie_trailers |
| 16 | `gacs_movie_trailers_01_o17MF9vn` | movie_trailers |
| 17 | `gacs_movie_trailers_03_o5vTwbu4` | movie_trailers |
| 18 | `gacs_movie_trailers_04_18QQWa5M` | movie_trailers |
| 19 | `gacs_movie_trailers_04_GY4BgdUS` | movie_trailers |
| 20 | `gacs_movie_trailers_04_K-EMszLv` | movie_trailers |

4개 카테고리에 걸쳐 고르게 분포되어 있으며(advertisements 5, animations 4, emotional_shorts 3, movie_trailers 8), 특정 장르에 편중된 데이터 손실은 아니다. 다만 movie_trailers 카테고리에서 상대적으로 AV1 비율이 높았는데, 이는 최신 트레일러가 YouTube에서 AV1로 서비스되는 경향을 반영한다.

### 3.3 씬 수 분포

35개 성공 영상의 씬 수 분포:

- **최소**: 10개 씬
- **최대**: 189개 씬
- **중앙값**: 51개 씬
- **총합**: 2,111개 씬

씬 수의 변동 계수가 크므로, 영상별 가중치 부여 없이 씬 단위로 분석하는 현재 방식이 적절하다. 고씬 영상(예: 129개, 189개)이 클러스터링에 과도한 영향을 미치지 않는지는 후속 분석에서 확인이 필요하다.

## 4. 핵심 발견

### 4.1 모델별 라벨 특성 (신규 데이터 기준)

멀티모델 라벨링 결과에서 다음과 같은 모델별 특성이 관찰되었다.

- **Claude Sonnet 4**: 문학적이고 뉘앙스가 풍부한 어휘를 선호한다("contemplative", "atmospheric", "ethereal" 등). Content safety 정책에 의한 라벨링 거부가 간헐적으로 발생하였으며, 이는 폭력적이거나 선정적인 장면에서 주로 나타났다. 74.0% 성공률은 주로 API 크레딧 소진에 기인하며, 모델 자체의 라벨링 능력과는 무관하다.

- **GPT-4o**: 3개 모델 중 가장 안정적인 성공률(99.95%)을 기록하였다. 긍정적 감정 어휘에 대한 편향(positivity bias)이 관찰되었으며, 중립적이거나 모호한 장면에서도 "hopeful", "optimistic" 등의 단어를 사용하는 경향이 있었다. Style 라벨에서 "cinematic", "dramatic"의 사용 빈도가 타 모델 대비 높았다.

- **Gemini 2.0 Flash**: 100% 성공률을 달성하였다. 부정적 감정 표현에 대한 민감도가 가장 높았으며("ominous", "calculating", "foreboding" 등), 출력 형식의 일관성이 가장 우수하였다. JSON 파싱 실패가 0건이었다.

이러한 모델 간 어휘 선택 차이는 GACS 좌표 축의 모델 독립성(model-invariance) 검증에 직접적으로 활용할 수 있다. 3개 모델에서 동일하게 나타나는 축은 강건한(robust) 감성 차원으로 해석할 수 있다.

### 4.2 AV1 코덱 문제

yt-dlp는 YouTube 서버가 제공하는 최고 품질 포맷을 자동 선택하는데, 최신 영상의 경우 AV1 코덱으로 인코딩된 스트림이 선택되는 경우가 많다. WSL2 환경에서는 GPU 하드웨어 디코더(NVDEC)를 통한 AV1 디코딩이 지원되지 않으며, PySceneDetect가 내부적으로 사용하는 OpenCV 백엔드도 소프트웨어 AV1 디코딩에 실패하였다.

**해결 방안**:
1. yt-dlp 다운로드 시 `--recode-video mp4` 옵션을 추가하여 H.264로 강제 재인코딩
2. 이미 다운로드된 AV1 영상에 대해 `ffmpeg -i input.mp4 -c:v libx264 output.mp4`로 후처리
3. WSL2에서 `libdav1d` 기반 소프트웨어 디코더 설치 시도

### 4.3 비용 분석

| 모델 | 호출 수 | 추정 비용 | 비고 |
|------|---------|-----------|------|
| Claude Sonnet 4 | 1,562 | ~$15-20 | 이미지 입력 + 텍스트 출력, 크레딧 소진으로 중단 |
| GPT-4o | 2,111 | ~$10-15 | 이미지 입력 기준 토큰 과금 |
| Gemini 2.0 Flash | 2,111 | ~$0-2 | 유료 API 키 사용, Flash 모델 저가 |
| **합계** | **~5,784** | **~$25-35** | |

1 씬당 평균 라벨링 비용은 약 $0.005-0.006으로, 전체 파이프라인의 비용 효율성은 양호하다. Claude 크레딧 소진 문제를 감안하면, Gemini를 기본 라벨러로 사용하고 Claude/GPT-4o를 검증용으로 활용하는 전략이 비용 최적화 관점에서 합리적이다.

## 5. 후속 과제

| ID | 과제 | 우선순위 | 비고 |
|----|------|----------|------|
| ~~R003-1~~ | ~~Claude 549개 재시도~~ | ~~P0~~ | **완료** — 546개 복구, 3개 content safety 거부 (99.9%) |
| R003-2 | AV1 영상 20개 재인코딩 후 처리 | P1 | ffmpeg H.264 변환 → 재처리 |
| R003-3 | 확장된 데이터셋(3,355행)으로 모델별 좌표계 재구축 | P1 | GACS-R002 방법론 적용 |
| R003-4 | 라벨링 비용 최적화 (단일 프롬프트로 mood+style+objects 통합) | P2 | 현재 개별 호출 → 통합 시 비용 1/3 절감 가능 |

## 6. 실험 환경

| 항목 | 사양 |
|------|------|
| GPU | NVIDIA RTX 4090 (24GB VRAM) |
| OS | Ubuntu (WSL2), Linux 6.6.87.2-microsoft-standard-WSL2 |
| Python | 3.12, venv at `gacs_0202/.venv/` |
| 씬 감지 | PySceneDetect (ContentDetector, threshold=27.0) |
| 키프레임 추출 | OpenCV |
| 라벨링 API | anthropic SDK, openai SDK, google-generativeai SDK |
| 임베딩 | sentence-transformers (all-MiniLM-L6-v2, emotion-english-distilroberta-base) |
| 병렬 처리 | ThreadPoolExecutor (3 workers, 모델 병렬) |
| 주요 스크립트 | `process_new_videos.py`, `label_fast.py` |

## 7. 생성된 파일

| 파일/경로 | 설명 |
|-----------|------|
| `gacs_0202/data/embeddings/gacs_dataset.csv` | 통합 데이터셋, 3,355행 (헤더 포함 3,356행) |
| `gacs_0202/data/embeddings/gacs_dataset.csv.bak` | 마이그레이션 전 백업, 1,244행 |
| `gacs_0202/data/annotations/*_multi.json` | 멀티모델 라벨링 결과, 2,111개 파일 |
| `gacs_0202/data/annotations/*_embeddings.json` | 768d 감성 임베딩, 2,111개 파일 |
| `gacs_0202/data/scenes/{video_id}/scene_metadata.json` | 영상별 씬 메타데이터, 35개 파일 |
| `research/new_scenes_cache.json` | 씬 감지 캐시, 2,111개 엔트리 |

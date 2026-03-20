---
report_id: GACS-R002
title: "모델별 독립 GACS 좌표계 구축 및 교차 비교"
date: "2026-03-12"
timestamp: "2026-03-12T23:35:00+09:00"
authors: ["GACS Research Pipeline"]
status: completed
depends_on: ["GACS-R001"]
tags: [coordinate-system, PCA, KMeans, cross-model, claude, gpt4o, gemini]
---

# GACS-R002: 모델별 독립 GACS 좌표계 구축 및 교차 비교

## 1. 실험 목적

GACS-R001에서 세 Vision 모델(Claude, GPT-4o, Gemini)이 동일 이미지에 대해 40~45%의 감정 벡터 차이를 보인다는 사실을 확인했다. 본 실험에서는 한 걸음 더 나아가, **각 모델의 라벨링으로 완전히 독립적인 좌표계(PCA 축 + 클러스터)를 구축**하고, 좌표계 간 구조적 일치도를 정량 분석한다.

핵심 질문:
- PC1(Valence)은 모델에 관계없이 동일한 축인가?
- 상위 PCA 축들은 모델 간 얼마나 일치하는가?
- KMeans 클러스터 할당은 모델 간 일관적인가?

## 2. 실험 설계

### 2.1 데이터
- **샘플 크기**: 100개 키프레임 이미지 (4개 카테고리에서 균등 추출)
- **카테고리**: advertisements, animations, emotional_shorts, movie_trailers
- **원본 소스**: `gacs_0202/data/scenes/*.jpg`

### 2.2 모델 및 라벨링
| 모델 | API | 라벨 소스 |
|------|-----|-----------|
| Claude Sonnet 4 | `claude-sonnet-4-20250514` | 기존 gacs_dataset.csv에서 재사용 (mood_1~mood_5) |
| GPT-4o | `gpt-4o` | 신규 API 호출 (100개 × 2 프롬프트) |
| Gemini 2.0 Flash | `gemini-2.0-flash` | 신규 API 호출 (100개 × 2 프롬프트) |

### 2.3 좌표계 구축 파이프라인 (모델별 동일)
```
Mood 라벨 (5단어) → SBERT 임베딩 (768차원)
  → StandardScaler 정규화
  → PCA (14 components)
  → KMeans (k=4)
  → 좌표계 파일 (.pkl) + 좌표 CSV
```
- **SBERT 모델**: `j-hartmann/emotion-english-distilroberta-base` (768차원, 감정 특화)
- **PCA 성분 수**: 14 (기존 GACS v1과 동일)
- **클러스터 수**: 4 (기존 GACS v1과 동일)

## 3. 실험 결과

### 3.1 PCA 축 유사도 (코사인 유사도)

각 모델 쌍에 대해 PC1~PC5 축 방향 벡터의 코사인 유사도를 측정.

| PC 성분 | Claude vs GPT-4o | Claude vs Gemini | GPT-4o vs Gemini |
|---------|-------------------|-------------------|-------------------|
| **PC1** | **0.959** | **0.967** | **0.951** |
| PC2 | 0.314 | 0.098 | **0.833** |
| PC3 | 0.258 | 0.016 | **0.780** |
| PC4 | **0.745** | 0.290 | 0.488 |
| PC5 | 0.258 | 0.236 | 0.226 |
| **평균** | **0.507** | **0.321** | **0.656** |

**핵심 발견:**
1. **PC1은 모델에 관계없이 거의 동일한 축** (0.95~0.97) → Valence(긍부정) 축은 보편적
2. **GPT-4o와 Gemini가 가장 유사** (평균 0.656) → Claude가 가장 독자적인 라벨링
3. **PC2~PC5는 모델마다 크게 다름** → 상위 축 외의 감정 차원은 모델 종속적
4. Claude vs Gemini의 PC3 유사도 0.016은 사실상 **완전히 다른 축**

### 3.2 분산 설명율 비교

| 순위 | Claude | GPT-4o | Gemini |
|------|--------|--------|--------|
| PC1 | 25.8% | **32.1%** | **32.1%** |
| PC2 | **13.5%** | **13.8%** | 11.5% |
| PC3 | **11.7%** | 10.6% | 8.6% |
| PC1~3 누적 | 51.0% | **56.5%** | 52.1% |
| 전체 (14PC) | 80.6% | **82.2%** | 80.2% |

- GPT-4o가 PC1에 가장 많은 분산을 집중 (32.1%) → 감정 라벨이 긍부정 축에 더 편향
- Claude는 분산이 더 고르게 분포 → 더 다차원적인 감정 포착
- 전체 14PC 설명율은 세 모델 모두 ~80%로 유사

### 3.3 클러스터 일치도 (Adjusted Rand Index)

| 비교 | ARI | 해석 |
|------|-----|------|
| Claude vs GPT-4o | **0.185** | 약한 일치 |
| Claude vs Gemini | **0.133** | 거의 불일치 |
| GPT-4o vs Gemini | **0.123** | 거의 불일치 |

- ARI 기준: 0.0 = 랜덤, 1.0 = 완전 일치
- **세 모델의 4-클러스터 분류는 서로 거의 독립적**
- PC1이 동일해도, 클러스터 경계는 PC2~PC5에 의존 → 모델마다 다른 분류

### 3.4 종합 구조도

```
                    PC1 (Valence)     PC2~5 (세부 감정)    클러스터 (k=4)
                    ─────────────     ────────────────     ──────────────
모델 간 일치도:      ★★★★★ (0.96)     ★★☆☆☆ (0.30)       ★☆☆☆☆ (0.15)
                     보편적            모델 종속적          완전히 모델 종속적
```

## 4. 핵심 발견 및 해석

### 4.1 "감정의 제1축은 보편적이다"
PC1(Valence, 긍정-부정 축)은 어떤 Vision 모델을 사용하든 0.95 이상의 일치도를 보인다. 이는 Russell Circumplex Model의 Valence 차원이 모델 학습 데이터에 관계없이 **감정 공간의 기본 구조**로 존재함을 시사한다.

### 4.2 "세부 감정 차원은 모델의 언어적 편향에 의존한다"
PC2 이후의 축은 모델마다 크게 다르다. 이는 GACS-R001에서 관찰한 "같은 감정, 다른 단어" 현상의 직접적 결과다:
- Claude: "melancholic, contemplative" → 문학적/내성적 어휘
- GPT-4o: "sad, gloomy" → 직관적/일상 어휘
- Gemini: "desolate, tragic" → 극적/부정 편향 어휘

이 어휘 차이가 SBERT 임베딩에서 서로 다른 방향 벡터를 만들어 PC2 이후 축이 분리된다.

### 4.3 "클러스터는 좌표계 전용"
KMeans 클러스터는 모델마다 독립적으로 관리해야 한다. Claude 좌표계의 Cluster 0이 GPT-4o 좌표계의 어떤 클러스터에 대응하는지 직접 매핑 불가.

### 4.4 실용적 시사점
- **단일 모델 사용 시**: 어떤 모델이든 PC1 기반 분석은 유효
- **멀티모델 사용 시**: 모델별 독립 좌표계 필수, PC1만 교차 비교 가능
- **앙상블 구축 시**: 임베딩 수준 앙상블(3개 모델 벡터 평균)보다 라벨 수준 앙상블(다수결)이 더 안정적일 가능성

## 5. 생성된 파일

| 파일 | 크기 | 설명 |
|------|------|------|
| `research/coordinates/claude_coordinate_system.pkl` | 168KB | Claude 좌표계 (Scaler+PCA+KMeans) |
| `research/coordinates/gpt4o_coordinate_system.pkl` | 168KB | GPT-4o 좌표계 |
| `research/coordinates/gemini_coordinate_system.pkl` | 168KB | Gemini 좌표계 |
| `research/coordinates/claude_coordinates.csv` | 23KB | 100개 이미지 × 14 PC 좌표 |
| `research/coordinates/gpt4o_coordinates.csv` | 24KB | 100개 이미지 × 14 PC 좌표 |
| `research/coordinates/gemini_coordinates.csv` | 24KB | 100개 이미지 × 14 PC 좌표 |
| `research/coordinates/sample_labels.csv` | 28KB | 100개 이미지 × 3 모델 라벨 |
| `research/coordinates/cross_model_comparison.json` | 3.4KB | 교차 비교 수치 |

## 6. 후속 과제

| ID | 과제 | 연결 |
|----|------|------|
| GACS-R003 | Round-trip 검증: 이미지→프롬프트→이미지생성→유사도 | 좌표계 실용성 증명 |
| GACS-R004 | 다운로드 134개 영상 Stage 1 처리 (3개 모델 동시) | 데이터 확장 |
| GACS-R005 | 앙상블 좌표계 구축 실험 | 모델 독립성 개선 |
| GACS-R006 | PC1 보편성 심층 분석 (Valence-Arousal 상관) | 이론 검증 |

## 7. 실험 환경

- **Hardware**: Windows 4090 Workstation (WSL2, Linux 6.6.87)
- **Python**: 3.12 (gacs_0202/.venv)
- **SBERT**: j-hartmann/emotion-english-distilroberta-base (768d)
- **PCA/KMeans**: scikit-learn
- **API 호출 수**: Claude 0회 (재사용) + GPT-4o ~200회 + Gemini ~200회
- **총 소요 시간**: ~10분 (API 호출 + 임베딩 + PCA)
- **스크립트**: `build_model_coordinates.py`

---
*Generated: 2026-03-12T23:35:00+09:00*
*GACS Research Pipeline v1.0*

# GACS Research Report
**Generative Affective Coordinate System — 연구 현황 및 로드맵**

GenTA Inc. | 2026-03-20 | v2.0

---

## 1. 연구 개요

GACS(Generative Affective Coordinate System)는 영상의 감성을 다차원 좌표로 표현하고, 이 좌표를 기반으로 영상 생성을 제어하는 시스템이다. YouTube 실험을 통해 감성 좌표 기반 영상 생성이 CTR, 시청시간 등에 미치는 효과를 검증하는 것이 최종 목표다.

**이론적 기반**: Russell의 Circumplex Model (Valence-Arousal 2D)을 다차원으로 확장하고, "From Visuals to Value" (JBR 2025)의 Expectancy Violation Theory를 영상 생성에 적용한다.

**확장 방향**: 1D→nD, 정적→동적, 관찰→생성, 장르→컨텍스트

---

## 2. 데이터셋

### 2.1 규모

| 항목 | Kushi 원본 (v1) | 확장 후 (v2) |
|------|----------------|-------------|
| 원본 영상 | 89개 (4 카테고리) | 246개 |
| 씬 (8초 간격) | 1,275개 | 3,507개 |
| 라벨링 완료 씬 | 1,270개 (99.6%) | 3,355개 |
| Annotations | Gemini 1모델 | Claude + GPT-4o + Gemini 3모델 |
| 임베딩 | paraphrase-MiniLM-L3-v2 (384d) | emotion-distilroberta (768d) |

### 2.2 카테고리 분포 (v2, 3,355씬)

| 카테고리 | 씬 수 | 비율 |
|----------|-------|------|
| Emotional Shorts | 1,063 | 31.7% |
| Advertisements | 782 | 23.3% |
| Movie Trailers | 782 | 23.3% |
| Animations | 728 | 21.7% |

### 2.3 멀티모델 라벨링

3개 Vision 모델로 병렬 라벨링을 수행했다.

| 모델 | 성공률 | 특성 | 비용/씬 |
|------|--------|------|---------|
| Claude Sonnet 4 | 99.9% | Content safety 필터링, 문학적 어휘 | ~$0.006 |
| GPT-4o | 100.0% | 긍정 편향 (85%), 일관된 서사 | ~$0.005 |
| Gemini 2.0 Flash | 100.0% | 부정 감성 감지력, 기술적 어휘 | ~$0.001 |

**모델 간 합의도**:
- 임베딩 코사인 유사도: 0.55~0.63 (37~45% 차이)
- 단어 수준 Jaccard 유사도: 0.18~0.21
- **PC1(Valence)은 모델 불변** (코사인 유사도 0.95~0.97)
- PC2 이후는 모델 의존적 (코사인 유사도 0.10~0.83)

---

## 3. 좌표계 v2.0

### 3.1 파이프라인

```
씬 JPG → 3모델 라벨링 (mood/style/objects)
    → 텍스트 생성 ("tense ominous dark suspenseful mysterious")
    → emotion-distilroberta 임베딩 (768d, L2 정규화)
    → StandardScaler → PCA (14 components)
    → KMeans (k=5) → 클러스터 라벨
```

### 3.2 7개 안정 축 (Stable Axes)

14개 주성분 중 **7개가 안정적** (코사인 유사도 > 0.96)이다. 이 7축이 전체 분산의 66.3%를 설명한다.

| 축 | 이름 | 분산 | 안정성 | (+) 극단 | (−) 극단 |
|----|------|------|--------|----------|----------|
| **PC1** | **Tense ↔ Joyful** | 27.8% | 0.999 | tense(+0.41), ominous(+0.40) | joyful(−0.33), peaceful(−0.32) |
| **PC2** | **Somber ↔ Intense** | 14.1% | 0.997 | somber(+0.64), contemplative(+0.52) | intense(−0.19), chaotic(−0.18) |
| **PC3** | **Serene ↔ Focused** | 8.8% | 0.978 | serene(+0.31), mysterious(+0.30) | focused(−0.27), neutral(−0.27) |
| **PC4** | **Joyful ↔ Serene** | 6.9% | 0.977 | joyful(+0.38), surprised(+0.33) | serene(−0.29), calm(−0.25) |
| **PC5** | **Confrontational ↔ Mysterious** | 4.4% | 0.985 | confrontational(+0.33), intense(+0.31) | mysterious(−0.25), practical(−0.20) |
| **PC6** | **Ominous ↔ Contemplative** | 2.5% | 0.980 | ominous(+0.25), joyful(+0.25) | contemplative(−0.28), intense(−0.27) |
| **PC7** | **Mysterious ↔ Concerned** | 2.0% | 0.967 | mysterious(+0.25), sophisticated(+0.23) | concerned(−0.35), anxious(−0.28) |

### 3.3 심리학 정합성 (Russell Circumplex)

| GACS 축 | Russell 차원 | 상관계수 | 해석 |
|---------|-------------|---------|------|
| PC1 (Tense↔Joyful) | **Valence** | r = −0.76 | 매우 강한 대응 |
| PC2 (Somber↔Intense) | **Arousal** | r = −0.57 | 강한 대응 |
| PC3~PC7 | 이차 차원 | r < 0.34 | 독립적 (GACS 고유 차원) |

→ GACS의 처음 두 축은 고전 심리학의 Valence-Arousal 모델과 자연스럽게 대응하며, 나머지 5개 축은 영상 감성에 특화된 추가 차원이다.

### 3.4 안정성 검증

3가지 방법으로 축의 안정성을 검증했다:

1. **Bootstrap** (10회, 80% 샘플): PC1~7 모두 > 0.99
2. **Split-Half** (5회, 50/50 분할): PC1~7 모두 > 0.95
3. **Category Dropout** (4개 카테고리 순차 제거): PC1~7 모두 > 0.94

→ 어떤 데이터 부분집합을 사용하든 동일한 축이 발견된다.

### 3.5 5개 감성 클러스터

| 클러스터 | 씬 수 | 비율 | Silhouette | 대표 감성 |
|----------|-------|------|-----------|----------|
| **C0** | 745 | 22% | 0.259 | Joyful / Celebratory / Energetic |
| **C1** | 346 | 10% | 0.469 | Somber / Contemplative / Melancholic |
| **C2** | 759 | 23% | 0.227 | Serene / Peaceful / Contemplative |
| **C3** | 662 | 20% | 0.362 | Mysterious / Tense / Ominous |
| **C4** | 843 | 25% | 0.099 | Intense / Focused / Serious |

- 전체 Silhouette: 0.254 (감성 데이터 기준 양호)
- 최대/최소 클러스터 비율: 2.44x (균형적)
- k=3 대비 실용적 해석력 확보 (3개 → "좋다/슬프다/무섭다" vs 5개 → 세분화된 감성 구분)

---

## 4. 좌표 기반 영상 생성 (Phase 2)

### 4.1 방법

좌표 공간에서 타겟 포인트를 지정하면, 유클리드 거리가 가장 가까운 씬들을 선택하여 MoviePy로 합성한다.

```
타겟 좌표 (PC1=−29, PC2=0, ...) 지정
    → 3,355씬과 거리 계산 (7축 가중 유클리드)
    → 가장 가까운 6~8개 씬 선택 (diversity 제약: 동일 영상 최대 2개)
    → 원본 MP4에서 해당 구간 추출 (start_time ~ end_time)
    → 페이드인/아웃 전환 + concatenate → 30초 목표 MP4
```

### 4.2 PC1 축 트래버설 결과

PC1(Tense↔Joyful) 축을 −2σ에서 +2σ까지 5단계로 이동하며 각 지점에서 영상을 생성했다.

| Step | 위치 | σ | 선택된 씬 mood | 클러스터 | 영상 길이 |
|------|------|---|---------------|---------|----------|
| 1 | PC1 = −29.2 | −2.0σ | happy, warm, cheerful | C0, C2 | 5.0s |
| 2 | PC1 = −14.6 | −1.0σ | spacious, emotional, heartwarming | C0, C2 | 18.0s |
| 3 | PC1 = 0.0 | 0.0σ | dramatic, mysterious, ethereal | C4 | 28.0s |
| 4 | PC1 = +14.6 | +1.0σ | intense, urgent, concerned | C3 | 12.0s |
| 5 | PC1 = +29.2 | +2.0σ | distressed, dark, tense, dangerous | C3 | 19.2s |

**핵심 발견**: 좌표값이 변하면 선택되는 씬의 감성이 **체계적으로** 변한다.
- −2σ: 따뜻하고 밝은 감성 (happy, warm, cheerful)
- 0σ: 중립적이고 복합적 (dramatic, mysterious, ethereal)
- +2σ: 어둡고 긴장된 감성 (distressed, dark, tense)

→ **좌표 제어가 영상 감성 톤을 실제로 조절한다는 실증적 증거.**

### 4.3 제약 사항

- 전체 3,355씬 중 일부만 raw MP4 보유 (manifest 144개 영상 / 전체 246개)
- SKIP율 30~80% — 비디오 파일 미보유 씬이 많아 최적 씬 대신 차선 씬이 사용됨
- AV1 코덱 영상 20개 WSL2에서 처리 불가

---

## 5. 감성 분류 성능

좌표계가 감성을 실제로 구분하는지 검증한 결과:

### 5.1 클러스터 내/외 거리

| 감성 | 비율 (외부/내부) | 판정 |
|------|-----------------|------|
| contentment | 2.38 | Excellent |
| wonder | 2.13 | Excellent |
| celebration | 2.02 | Good |
| joy | 1.94 | Good |
| warmth | 1.90 | Good |
| **평균** | **1.49** | Good |

→ 같은 감성의 씬이 좌표 공간에서 가까이 위치한다.

### 5.2 Random Forest 분류 (22개 감성, 5-fold CV)

- **전체 정확도**: 51.4%
- **Macro F1**: 0.45
- 상위: elegance (F1=0.76), seriousness (F1=0.70), sadness (F1=0.63)
- 하위: celebration (F1=0.09), loneliness (F1=0.15)

→ 좌표만으로 22개 감성을 50% 이상 예측 가능 — 7개 축이 감성 정보를 효과적으로 포착함을 증명.

---

## 6. 로드맵

### Phase 1: 좌표계 구축 ✅ 완료

| 태스크 | 상태 | 날짜 |
|--------|------|------|
| Kushi 데이터 마이그레이션 | ✅ | 03-10 |
| 임베딩 모델 비교 (5개) | ✅ | 03-10 |
| emotion_distil_norm 선정 | ✅ | 03-10 |
| 좌표축 발견 (PCA 14comp) | ✅ | 03-10 |
| 축 안정성 검증 (3가지 방법) | ✅ | 03-12 |
| 멀티모델 비교 (Claude/GPT-4o/Gemini) | ✅ | 03-12 |
| 대규모 라벨링 확장 (1,275→3,355씬) | ✅ | 03-13 |
| 좌표계 v2.0 재학습 (3,355씬) | ✅ | 03-16 |
| 축 재해석 (v2 기준) | ✅ | 03-16 |
| k=5 클러스터 확정 | ✅ | 03-18 |

### Phase 2: 좌표 기반 영상 생성 🔄 진행 중

| 태스크 | 상태 | 비고 |
|--------|------|------|
| coordinate_video_generator.py 구현 | ✅ | 3가지 모드: cluster, traverse, target |
| PC1 축 트래버설 (5단계) | ✅ | 감성 변화 검증 완료 |
| 클러스터별 대표 영상 생성 | ⬜ | 5개 클러스터 각각 30초 영상 |
| PC2 축 트래버설 | ⬜ | Somber↔Intense |
| 누락 영상 확보 (AV1 재인코딩) | ⬜ | 20개 영상, SKIP율 감소 |
| 영상 품질 개선 (duration fitting) | ⬜ | 30초 목표 달성률 향상 |

### Phase 3: YouTube 실험 ⬜ 미착수

| 태스크 | 우선순위 | 비고 |
|--------|---------|------|
| GACS 영상 vs Baseline 영상 업로드 | P0 | 교차 업로드 설계 |
| YouTube Analytics 메트릭 수집 | P0 | CTR, 시청시간, 이탈률 |
| 통계 분석 (t-test, Cohen's d) | P1 | GACS lift 계산 |
| 표본 크기 검정력 분석 | P1 | 필요 N 산출 |
| Expectancy Violation 거리 검증 | P2 | 좌표 거리 vs 시청 행동 |

### Phase 4: 논문화 ⬜ 미착수

| 태스크 | 우선순위 | 비고 |
|--------|---------|------|
| GACS 좌표계 이론 정리 | P1 | Russell 확장 논리 |
| 실험 결과 분석 및 해석 | P1 | Phase 3 결과 기반 |
| 시각화 및 figure 제작 | P2 | 축 트래버설, 클러스터 맵 |
| JBR/정보시스템연구 투고 | P3 | 목표 저널 |

---

## 7. 핵심 성과 요약

1. **7축 감성 좌표계 확립** — 3,355씬에서 안정적으로 재현되는 7개 차원 발견
2. **심리학 정합성 검증** — PC1=Valence(r=0.76), PC2=Arousal(r=0.57)
3. **좌표 기반 생성 제어 실증** — PC1 축 이동 시 영상 감성이 체계적으로 변화
4. **멀티모델 비교** — PC1은 모델 불변(0.96), 상위 축은 모델 의존적
5. **확장 가능한 파이프라인** — 새 영상 추가 시 동일 좌표계에 매핑 가능

---

## 8. 기술 스택

| 구성요소 | 기술 |
|----------|------|
| 임베딩 모델 | j-hartmann/emotion-english-distilroberta-base (768d) |
| 차원 축소 | PCA (14 components, 74.4% variance) |
| 클러스터링 | KMeans (k=5, silhouette=0.254) |
| Vision 라벨링 | Claude Sonnet 4 + GPT-4o + Gemini 2.0 Flash |
| 영상 합성 | MoviePy (H.264 / AAC) |
| 실행 환경 | Ubuntu WSL2, RTX 4090, Python 3.12 |
| 저장소 | github.com/GenTA-AI/gacs0310 |

---


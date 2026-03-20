# GACS Research Directory

> 연구 데이터, 실험 결과, 보고서 아카이브.
> 마지막 업데이트: 2026-03-13

---

## 디렉토리 구조

```
research/
├── reports/                              # 실험 보고서 (논문용)
├── 2026-03-10_coordinate_discovery/      # 좌표계 최초 발견
├── 2026-03-12_coordinate_stabilization/  # 좌표계 안정화
├── 2026-03-12_model_comparison/          # 멀티모델 라벨링 비교 (20개 샘플)
├── 2026-03-12_per_model_coordinates/     # 모델별 독립 좌표계 (100개 샘플)
└── cache/                                # 임시 캐시 파일
```

---

## 보고서 목록

| ID | 날짜 | 제목 | 상태 |
|----|------|------|------|
| GACS-R001 | 2026-03-12 | 멀티모델 Vision 라벨링 비교 실험 | 완료 |
| GACS-R002 | 2026-03-12 | 모델별 독립 GACS 좌표계 구축 및 교차 비교 | 완료 |
| GACS-R003 | 2026-03-13 | Stage 1 영상 처리: 55개 영상 멀티모델 라벨링 | 완료 |

---

## 연구 타임라인

### 2026-03-10: 좌표계 최초 발견 (`2026-03-10_coordinate_discovery/`)

Kushi 데이터(1,244씬) 기반으로 GACS 좌표계를 최초 구축한 실험.

**핵심 결과:**
- 5개 임베딩 모델 비교 → emotion-distilroberta (768d) 선정
- PCA 14축 추출, PC1=Valence(r=-0.76), PC2=Arousal(r=-0.57)
- Russell Circumplex Model과 자연 정렬 확인
- KMeans k=4 최적 (sil=0.3513), HDBSCAN 비교 완료

**파일:**
| 파일 | 설명 |
|------|------|
| `final_report.md` | 종합 연구 보고서 |
| `gacs_coordinates.csv` | 1,275씬 × 14PC 좌표 |
| `axis_interpretation.json` | PC축 해석 (이름, 상관계수) |
| `axis_correlation_matrix.json` | 34개 감정 × 14PC 상관행렬 |
| `clustering_comparison.json` | 45개 클러스터링 알고리즘 비교 |
| `optimal_clusters.json` | 최적 클러스터 설정 |
| `coordinate_validation.json` | 좌표계 검증 지표 |
| `final_scatter_*.png` | 2D 시각화 (클러스터별, 카테고리별, 감정별) |
| `final_scatter_3d.html` | 3D 인터랙티브 시각화 (Plotly) |
| `axis_visualization.png` | PC축 시각화 |
| `validation_plots.png` | 검증 플롯 |

---

### 2026-03-12: 좌표계 안정화 (`2026-03-12_coordinate_stabilization/`)

좌표계의 안정성 검증 및 개선 작업.

**핵심 결과:**
- PC1~PC7 안정 (bootstrap cos>0.94), PC11~PC14 불안정
- Cluster 3(64%) → C3a(joy/active 30%) + C3b(calm/contemplative 33%) 세분화
- MOOD_MAP 553→34 카테고리, 커버리지 60.76%→98.73%
- 좌표계 v1 직렬화 (Scaler+PCA+KMeans → .pkl)

**파일:**
| 파일 | 설명 |
|------|------|
| `gacs_coordinate_system_v1.pkl` | 직렬화된 좌표계 (70KB) |
| `gacs_transform.py` | 신규 데이터 변환 모듈 |
| `gacs_coordinates_v2.csv` | 계층적 클러스터 라벨 포함 |
| `axis_stability.json` | Bootstrap/split-half 안정성 |
| `cluster_subdivision.json` | C3 세분화 결과 |
| `mood_map_extended.py` | 확장 MOOD_MAP (34 카테고리) |
| `mood_map_analysis.json` | MOOD_MAP 커버리지 분석 |
| `GACS_좌표계_설명서.md` | 비즈니스용 좌표계 설명서 (한국어) |
| `*.png` | 시각화 |

---

### 2026-03-12: 멀티모델 라벨링 비교 (`2026-03-12_model_comparison/`)

Claude, GPT-4o, Gemini 3개 모델의 감정 라벨링 차이 분석. (→ GACS-R001)

**핵심 결과:**
- 임베딩 유사도: Claude-GPT 0.59, Claude-Gemini 0.63, GPT-Gemini 0.55
- 단어 겹침(Jaccard): ~20%
- 모델마다 감정 해석 편향 존재

**파일:**
| 파일 | 설명 |
|------|------|
| `model_comparison_labels.csv` | 20개 이미지 × 3모델 라벨 |
| `model_comparison_stats.json` | 유사도 통계 |
| `model_embeddings.json` | 768d 임베딩 (모델별) |

---

### 2026-03-12: 모델별 독립 좌표계 (`2026-03-12_per_model_coordinates/`)

100개 샘플로 모델별 독립 PCA 좌표계 구축 및 교차 비교. (→ GACS-R002)

**핵심 결과:**
- PC1(Valence)은 모델 무관 (cos>0.95) — 보편적 축
- PC2 이후는 모델 종속 (cos 0.01~0.83)
- 클러스터 일치도 낮음 (ARI 0.12~0.18)

**파일:**
| 파일 | 설명 |
|------|------|
| `{claude,gpt4o,gemini}_coordinate_system.pkl` | 모델별 좌표계 |
| `{claude,gpt4o,gemini}_coordinates.csv` | 100개 이미지 좌표 |
| `cross_model_comparison.json` | 교차 비교 지표 |
| `sample_labels.csv` | 100개 이미지 라벨 캐시 |

---

### 2026-03-13: Stage 1 영상 처리 (→ GACS-R003)

55개 신규 YouTube 영상 처리. 데이터 보고서에 기록 (`reports/003_*.md`).

**핵심 결과:**
- 35개 영상 → 2,111씬 감지 (20개 AV1 미지원)
- 3개 모델 라벨링: Claude 99.9%, GPT-4o 100%, Gemini 100%
- 데이터셋 1,244 → 3,355씬 (+170%)

---

## 데이터 규모 요약

| 시점 | 영상 수 | 씬 수 | 라벨링 모델 |
|------|---------|-------|-------------|
| Kushi 원본 | 89 | 1,275 | Gemini 2.5 Flash |
| 마이그레이션 후 | 86 | 1,244 | Claude (재라벨링) |
| **현재 (2026-03-13)** | **121** | **3,355** | **Claude + GPT-4o + Gemini** |

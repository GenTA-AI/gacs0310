# GACS Research Pipeline — Project Context

> **이 파일은 Claude Code가 프로젝트를 이해하고 이어서 작업할 수 있도록 작성된 컨텍스트 문서입니다.**
> 마지막 업데이트: 2026-03-20 (폴더 구조 정리 + 좌표계 v2.0 반영)

---

## 프로젝트 개요

**GACS** = Generative Affective Coordinate System.
감성 좌표 기반으로 영상 콘텐츠를 분석/생성하고, YouTube 실험을 통해 CTR·시청시간 등 성과를 검증하는 연구 파이프라인.

- **회사**: GenTA Inc. (j.lee@genta.co.kr)
- **이론 기반**: "From Visuals to Value" (JBR 2025) — Expectancy Violation Theory
- **실행 환경**: Ubuntu WSL2 + RTX 4090
- **Python**: 3.12 (venv: `.venv/`)
- **Git Remote**: `git@github.com:GenTA-AI/gacs0310.git`

---

## Repo 구조

```
gacs0310/
├── run_pipeline.py              # 통합 CLI (dataset/generate/upload/metrics/analyze)
├── gacs_config.py               # 중앙 설정 (40+ 상수)
├── video_manifest.csv           # 원본 영상 목록 (246개)
├── check_secrets.py             # 시크릿 스캐너
│
├── src/                         # 핵심 파이프라인 모듈
│   ├── dataset_builder.py       # Stage 1: 영상→씬→라벨→임베딩
│   ├── video_generator.py       # Stage 2: 클러스터→씬선택→영상합성
│   ├── experiment_runner.py     # Stage 3: YouTube A/B 테스트
│   ├── labeling_backend.py      # 듀얼 라벨링 (Claude Vision + LLaVA)
│   └── coordinate_analyzer.py   # Stage 4: 좌표계 분석
│
├── scripts/                     # 유틸리티 스크립트
│   ├── data_collection/         # 영상 다운로드, 씬 메타데이터 생성
│   ├── labeling/                # 멀티모델 라벨링, 재시도
│   ├── coordinate/              # PCA/클러스터 학습, 축 해석, 안정성 검증
│   ├── generation/              # 좌표 기반 영상 생성
│   └── migration/               # Kushi 데이터 마이그레이션
│
├── data/
│   ├── raw_videos/              # 원본 MP4 파일 (~246개)
│   ├── scenes/                  # 키프레임 이미지 (~3,507개 JPG)
│   ├── annotations/             # 라벨링 캐시 (JSON, ~4,222개)
│   ├── embeddings/
│   │   └── gacs_dataset.csv     # 메인 데이터셋 (3,355씬, mood/style/objects/embedding)
│   ├── models/
│   │   └── gacs_coordinate_system_v2.pkl  # 학습된 좌표계 (PCA+KMeans)
│   ├── intermediate/            # 연구 중간 산출물 (step2~5 임베딩/분석)
│   ├── generated/               # 생성된 영상 (gacs/baseline/coordinate)
│   ├── kushi_original/          # Kushi 원본 데이터 (참조용)
│   ├── experiments/             # YouTube 실험 결과
│   ├── metrics/                 # 수집된 메트릭
│   └── logs/                    # 로그
│
├── research/                    # 연구 결과 (날짜별)
│   ├── 2026-03-10_coordinate_discovery/    # v1 좌표계 (1,275씬)
│   ├── 2026-03-12_model_comparison/        # 임베딩 모델 비교
│   ├── 2026-03-12_coordinate_stabilization/  # 안정성 검증
│   ├── 2026-03-12_per_model_coordinates/   # 모델별 좌표계
│   ├── 2026-03-16_coordinate_v2/           # v2 좌표계 (3,355씬, 최종)
│   └── reports/                            # 연구 리포트
│
├── docs/                        # 참고 문서
│   ├── GACS_Roadmap_2026.pdf
│   ├── From_Visuals_to_Value_JBR2025.pdf   # 이론 기반 논문
│   └── prompts/                            # Claude 프롬프트 이력
│
├── notebooks/                   # 레거시 Jupyter 노트북 (참고용)
├── tests/                       # 91개 유닛 테스트
└── .venv/                       # Python 가상환경
```

---

## 현재 진행 상황 (2026-03-20)

### Phase 1: 좌표계 구축 — 완료

| 항목 | 결과 |
|---|---|
| 데이터셋 | 3,355씬 (246 영상, 4 카테고리) |
| 라벨링 | 3-모델 합의 (Claude Sonnet 4 + GPT-4o + Gemini Flash) |
| 임베딩 | emotion-english-distilroberta-base (768d, normalized) |
| 좌표계 | PCA 14 components, 7개 안정축 (bootstrap r>0.85) |
| 클러스터 | k=5 (Joyful/Somber/Serene/Mysterious/Intense) |
| 심리학 정합 | PC1=Valence (r=0.76), PC2=Arousal (r=0.57) |

**7개 안정 축:**
1. PC1: Valence (밝음↔어두움) — 분산 18.4%
2. PC2: Arousal (긴장↔평온) — 분산 10.1%
3. PC3: Complexity (복잡↔단순) — 분산 7.2%
4. PC4: Familiarity (친숙↔신비) — 분산 5.8%
5. PC5: Tension (갈등↔조화) — 분산 4.9%
6. PC6: Energy (활발↔차분)
7. PC7: Novelty (새로움↔전통)

### Phase 2: 좌표 기반 생성 제어 — 부분 완료

- PC1 축 트래버설 1회 실행 (5단계 영상 생성 성공)
- `scripts/generation/coordinate_video_generator.py` — 3개 모드 (cluster/traverse/target)
- 블로커: 일부 씬의 원본 MP4 파일 누락

### Phase 3-4: YouTube A/B 테스트, 최적화 — 미착수

---

## 파이프라인 실행

```bash
# 가상환경 활성화
source .venv/bin/activate

# 시스템 확인
python run_pipeline.py info

# 전체 파이프라인 (빠른 테스트)
python run_pipeline.py all --quick-test

# 개별 단계
python run_pipeline.py dataset
python run_pipeline.py generate
python run_pipeline.py upload
python run_pipeline.py metrics
python run_pipeline.py analyze

# 좌표 기반 영상 생성
python scripts/generation/coordinate_video_generator.py --mode cluster
python scripts/generation/coordinate_video_generator.py --mode traverse --axis PC1 --steps 5
python scripts/generation/coordinate_video_generator.py --mode target --pc1 10 --pc2 -5
```

---

## 주요 Config 값 (`gacs_config.py`)

| 상수 | 값 | 설명 |
|---|---|---|
| `SCHEMA_VERSION` | `"1.0.0"` | 데이터 스키마 버전 |
| `CLAUDE_MODEL` | `"claude-sonnet-4-20250514"` | Claude API 라벨링 모델 |
| `SBERT_MODEL` | `"all-MiniLM-L6-v2"` | 임베딩 모델 (Stage 1) |
| `DEFAULT_K_CLUSTERS` | `5` | 감성 클러스터 수 |
| `TARGET_DURATION` | `30` | 생성 영상 목표 길이(초) |
| `QUICK_TEST_MODE` | env `GACS_QUICK_TEST=1` | 1 비디오, 3 씬으로 제한 |

---

## 데이터 스키마 (v1.0.0)

### `data/embeddings/gacs_dataset.csv`
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `image_id` | str | 키프레임 고유 ID |
| `video_id` | str | 원본 비디오 ID |
| `scene_id` | str | 씬 ID (`{video_id}_s{NNNN}`) |
| `mood_1`~`mood_5` | str | 감성 라벨 (5개) |
| `style_1`~`style_3` | str | 스타일 라벨 (3개) |
| `object_1`~`object_N` | str | 객체 라벨 (2-5개) |
| `mood_embedding` | str (JSON) | SBERT 384-dim float vector |

### `data/models/gacs_coordinate_system_v2.pkl`
```python
{
    "pca": PCA(n_components=14),      # 학습된 PCA
    "kmeans": KMeans(n_clusters=5),    # k=5 클러스터
    "scaler": StandardScaler(),        # 정규화
    "axis_names": ["Valence", "Arousal", ...],
    "n_stable_pcs": 7,
}
```

---

## 비협상 규칙

1. **시크릿 금지**: .gitignore + check_secrets.py + pre-commit hook
2. **테스트 경로**: 모든 변경에 quick-test mode 경로 포함
3. **스키마 안정성**: 스키마 변경 시 `SCHEMA_VERSION` bump + migration
4. **가독성**: 글로벌 상태 최소화, 중앙 config, 로깅 항상 켜짐

# GACS 연구 총괄 프롬프트

> 너는 이 연구의 PM이다. 에이전트 팀을 알아서 구성하고, 작업을 분배하고, 결과를 종합해라.
> 사용자는 최종 결과만 받아본다. 중간에 질문하지 말고 알아서 판단해서 진행해라.
> 모든 결과는 **수치(숫자)**로 나와야 한다. 감성적인 해석은 수치 뒤에 붙여라.

---

## 프로젝트 한 줄 요약

**영상 씬의 감성을 숫자 좌표로 변환하는 엔진을 만들어라.**

입력: 영상 씬 → 출력: (x₁, x₂, ..., xₙ) 좌표값.
이 좌표값으로 "이 씬은 Valence=0.72, Arousal=-0.35, Complexity=0.58이다"라고 말할 수 있어야 한다.

---

## 현재 보유 자산

| 자산 | 위치 | 설명 |
|---|---|---|
| 원본 데이터 | `gacs0202(kushi)/gacs_labeled_scenes.csv` | 1,275 씬, 89 영상, Gemini 라벨링 (mood/style/objects) |
| L3 임베딩 (원본) | CSV embedding 컬럼 | paraphrase-MiniLM-L3-v2, 384d |
| L6 임베딩 | `data/step2/emb_original_L6v2.npy` | all-MiniLM-L6-v2, 384d |
| L6 정규화 임베딩 | `data/step2/emb_normalized_L6v2.npy` | 정규화된 mood 텍스트로 재임베딩, 384d |
| **감성 특화 임베딩** | `data/step3/emb_emotion_distil_norm.npy` | **j-hartmann/emotion-english-distilroberta-base, 768d, sil=0.2926** |
| 텍스트 매핑 | `data/step2/texts.csv` | original + normalized 텍스트 |
| 씬 인덱스 | `data/step2/scene_index.csv` | scene_id, video_name |
| Step 1 결과 | 아래 MOOD_MAP 참조 | 553개 mood → 35개 카테고리 정규화 |

**핵심**: `emb_emotion_distil_norm.npy` (768d, silhouette=0.2926)가 가장 성능 좋음. 이걸 기반으로 진행.

---

## 연구 목표 (순서대로)

### 1. 최적 클러스터 구조 확정
- KMeans k=3~25 + DBSCAN + HDBSCAN + Gaussian Mixture 비교
- 평가 지표: Silhouette, Calinski-Harabasz, Davies-Bouldin (3개 다)
- **산출물**: 최적 알고리즘 + k값, 각 지표 수치 테이블

### 2. 좌표축 발견 + 명명
- PCA 상위 N개 축 추출 (누적 분산 80% 기준으로 N 결정)
- 각 PC축과 35개 normalized mood 간 **point-biserial 상관계수** 계산
- 각 축의 양 끝(+3σ, -3σ)에 위치한 씬들의 mood 분포 분석
- 축 명명 예시: PC1 = "Valence" (warmth +0.49 vs fear -0.35)
- **산출물**: 축 이름, 각 축의 상관계수 테이블, 해석 근거

### 3. 좌표 매핑 함수 구축
- `embedding(768d) → GACS_coordinate(Nd)` 변환 파이프라인
- 각 씬에 좌표값 할당
- 좌표 공간에서의 거리 함수 정의 (Expectancy Violation Distance)
- **산출물**: `src/coordinate_analyzer.py` 모듈 (class GACSCoordinateSystem)

### 4. 좌표계 검증
- 좌표값과 원래 mood 라벨 간 일치도 검증
  - 같은 mood를 가진 씬들이 좌표 공간에서 가까운가? (intra-class distance)
  - 다른 mood를 가진 씬들이 좌표 공간에서 먼가? (inter-class distance)
- 카테고리(movie/ads/emotional/animations)별 좌표 분포 차이 t-test
- Cross-validation: 80% 학습, 20% 검증으로 좌표→mood 예측 정확도
- **산출물**: 검증 수치 테이블, confusion matrix

### 5. 시각화 + 최종 보고서
- 2D scatter: GACS 좌표 공간에 모든 씬 배치 (mood별 색상)
- 3D interactive용 데이터 (plotly export)
- 클러스터별 프로필 카드 (top moods, top styles, 대표 씬)
- **산출물**: `research/final_report.md` + PNG 시각화 파일들

---

## 핵심 데이터 (에이전트에 전달용)

### Mood 정규화 맵 (553 → 35)

```python
MOOD_MAP = {
    "joy": ["joyful","joyous","happy","cheerful","jubilant","overjoyed","delighted","ecstatic","lighthearted","upbeat","bright","radiant","glowing"],
    "excitement": ["excited","exciting","exhilarating","thrilling","energetic","vibrant","lively","dynamic","active","vigorous","spirited","boisterous","fast-paced","fast","bustling"],
    "celebration": ["celebratory","festive","triumphant","proud","accomplished"],
    "amusement": ["playful","whimsical","humorous","amusing","amused","comical","silly","mischievous","quirky","cute","adorable"],
    "wonder": ["magical","wondrous","enchanting","enchanted","majestic","awe-inspiring","breathtaking","captivating","grand","epic","impressive"],
    "adventure": ["adventurous","daring","bold","wild","free","exploratory","ambitious"],
    "calm": ["calm","relaxed","tranquil","serene","peaceful","quiet","gentle","mild","mellow","soothing","soft","subtle","understated","composed"],
    "warmth": ["warm","tender","affectionate","loving","caring","nurturing","supportive","kind","compassionate","empathetic","heartwarming","heartfelt","sweet","endearing","fond"],
    "contentment": ["content","pleasant","comfortable","cozy","homey","safe","welcoming","inviting","friendly","amicable","convivial","carefree"],
    "hope": ["hopeful","optimistic","encouraging","uplifting","inspiring","inspired","positive","resilient","determined"],
    "nostalgia": ["nostalgic","sentimental","wistful","bittersweet"],
    "romance": ["romantic","intimate","flirtatious","passionate"],
    "gratitude": ["grateful","appreciative","relieved","moved","touched","sincere"],
    "neutral": ["neutral","ordinary","mundane","everyday","routine","casual","simple","plain","blank","unremarkable","commonplace"],
    "focus": ["focused","attentive","observant","watchful","engaged","precise","careful","concentrated","absorbed","diligent","dedicated","purposeful","resolute"],
    "contemplation": ["pensive","thoughtful","contemplative","reflective","introspective","questioning","curious","intrigued","intriguing"],
    "seriousness": ["serious","solemn","formal","dignified","reserved","stoic","stately","commanding","authoritative"],
    "informative": ["informative","informational","professional","technical","clinical","factual","objective","direct","functional","practical"],
    "sadness": ["sad","somber","melancholic","melancholy","sorrowful","tearful","heartbreaking","tragic","dejected","unhappy","disappointed","gloomy","bleak"],
    "loneliness": ["lonely","solitary","isolated","desolate","abandoned","stranded","empty","detached","distant"],
    "weariness": ["tired","weary","exhausted","fatigued","sleepy","bored","apathetic","disengaged","subdued","muted"],
    "vulnerability": ["vulnerable","helpless","defeated","overwhelmed","struggling","desperate","pleading","pained"],
    "poignance": ["poignant","touching","emotional","moving","profound","raw","expressive"],
    "tension": ["tense","intense","suspenseful","anticipatory","expectant","anxious","uneasy","apprehensive","stressed","uncomfortable","uncertain","hesitant","cautious","wary"],
    "fear": ["scared","fearful","terrifying","terrified","frightening","alarming","horrific","eerie","creepy","unsettling","ominous","foreboding","menacing","threatening","perilous","dangerous"],
    "anger": ["angry","furious","enraged","aggressive","confrontational","defiant","rebellious","fierce","violent","brutal"],
    "chaos": ["chaotic","frantic","frenzied","rushed","overwhelming","explosive","destructive","catastrophic","apocalyptic"],
    "darkness": ["dark","grim","gritty","cold","stark","oppressive","haunting","gothic","murky"],
    "mystery": ["mysterious","enigmatic","surreal","ethereal","dreamlike","dreamy","otherworldly","mystical","fantastical","cosmic","abstract"],
    "elegance": ["elegant","luxurious","sophisticated","refined","glamorous","opulent","extravagant","sleek","prestigious","regal","graceful"],
    "domesticity": ["domestic","familial","communal","social","collaborative","inclusive","united","connected"],
    "nature": ["natural","organic","rustic","earthy","verdant","tropical","wintry","aquatic","idyllic"],
    "urban": ["urban","modern","futuristic","digital","industrial","corporate","busy","crowded"],
    "tradition": ["traditional","historical","historic","cultural","ceremonial","classical","classic","vintage","ancient"],
}
```

### Valence / Arousal 수치 (검증용)

```python
VALENCE = {
    "joy":1.0, "excitement":0.9, "celebration":0.9, "amusement":0.8, "wonder":0.7, "adventure":0.7,
    "calm":0.6, "warmth":0.7, "contentment":0.6, "hope":0.7, "nostalgia":0.3, "romance":0.6, "gratitude":0.7,
    "neutral":0, "focus":0.1, "contemplation":0, "seriousness":-0.1, "informative":0,
    "sadness":-0.7, "loneliness":-0.6, "weariness":-0.4, "vulnerability":-0.6, "poignance":-0.3,
    "tension":-0.3, "fear":-0.8, "anger":-0.7, "chaos":-0.6, "darkness":-0.5, "mystery":-0.1,
    "elegance":0.3, "domesticity":0.3, "nature":0.4, "urban":0, "tradition":0.1
}
AROUSAL = {
    "joy":0.6, "excitement":0.9, "celebration":0.8, "amusement":0.5, "wonder":0.4, "adventure":0.8,
    "calm":-0.7, "warmth":-0.3, "contentment":-0.5, "hope":0.2, "nostalgia":-0.3, "romance":0.1, "gratitude":-0.2,
    "neutral":0, "focus":0.2, "contemplation":-0.3, "seriousness":0.1, "informative":-0.1,
    "sadness":-0.4, "loneliness":-0.5, "weariness":-0.8, "vulnerability":-0.2, "poignance":-0.1,
    "tension":0.7, "fear":0.8, "anger":0.9, "chaos":1.0, "darkness":0.3, "mystery":0.3,
    "elegance":-0.2, "domesticity":-0.3, "nature":-0.4, "urban":0.3, "tradition":-0.2
}
```

---

## 최종 산출물 체크리스트

완료 시 아래 파일이 모두 존재해야 한다:

```
research/
├── clustering_comparison.json     # 알고리즘별 지표 수치
├── clustering_comparison.png      # 시각화
├── optimal_clusters.json          # 최적 클러스터 프로필
├── axis_correlation_matrix.json   # PC축 × mood 상관계수
├── axis_interpretation.json       # 축 이름 + 근거
├── axis_visualization.png         # 축 해석 시각화
├── coordinate_validation.json     # 검증 수치 (intra/inter distance, accuracy)
├── validation_plots.png           # confusion matrix 등
├── gacs_coordinates.csv           # 모든 씬의 GACS 좌표값
├── final_scatter_2d.png           # 최종 2D 좌표 공간
├── final_scatter_3d.html          # 3D plotly (선택)
└── final_report.md                # 전체 결과 종합 보고서

src/
├── coordinate_analyzer.py         # GACSCoordinateSystem 클래스

tests/
├── test_coordinate_analyzer.py    # 단위 테스트
```

## 최종 보고서(final_report.md) 필수 포함 내용

1. **모델 비교 결론**: L3 vs L6 vs emotion_distil 수치 비교표
2. **최적 클러스터**: 알고리즘, k값, 3가지 지표
3. **좌표축 정의**: 각 축 이름, 상관계수 상위 5개 mood, 해석
4. **검증 결과**: intra/inter-class distance ratio, mood 예측 accuracy
5. **GACS 좌표 예시**: 5개 대표 씬의 좌표값 + mood 라벨
6. **한계점 + 다음 단계**: 데이터 부족, 라벨 품질, 추가 실험 필요 사항

---

## 규칙

- 모든 수치는 소수점 4자리까지 기록
- 시각화는 `matplotlib.use('Agg')`, 해상도 150dpi 이상
- 에러 시 fallback 포함 (HDBSCAN 없으면 KMeans만으로)
- 중간에 사용자에게 묻지 말고 알아서 판단
- 폴더 없으면 `mkdir -p`로 생성
- `CLAUDE.md` 먼저 읽어서 프로젝트 컨텍스트 파악할 것

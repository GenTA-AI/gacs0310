---
report_id: GACS-R001
title: "멀티모델 Vision 라벨링 비교 실험"
date: "2026-03-12"
timestamp: "2026-03-12T22:45:00+09:00"
authors: ["GACS Research Pipeline"]
status: completed
tags: [vision-model, labeling, embedding, comparison]
---

# GACS-R001: 멀티모델 Vision 라벨링 비교 실험

## 1. 실험 목적

본 실험은 다음의 두 가지 연구 질문에 답하기 위해 설계되었다.

- **RQ1**: 동일한 키프레임 이미지에 대해 Claude, GPT-4o, Gemini가 생성하는 감정(mood) 라벨은 어느 정도의 일치도를 보이는가?
- **RQ2**: GACS 감정 좌표계(emotion coordinate system)가 특정 Vision 모델에 종속되는 구조적 한계를 가지는지 검증한다.

GACS 파이프라인은 키프레임에서 추출한 감정 라벨을 임베딩하여 좌표계를 구성하므로, 라벨의 모델 종속성은 곧 좌표계의 재현성(reproducibility) 문제와 직결된다.

## 2. 실험 설계

| 항목 | 내용 |
|------|------|
| **샘플 크기** | 20개 키프레임 |
| **카테고리 분포** | 4개 카테고리(advertisements, animations, emotional_shorts, movie_trailers)에서 균등 추출 |
| **비교 모델** | Claude Sonnet 4 (`claude-sonnet-4-20250514`), GPT-4o, Gemini 2.0 Flash |
| **프롬프트 통제** | 세 모델 모두 동일한 MOOD 프롬프트(5개 단어)와 STYLE 프롬프트(3개 단어) 사용 |
| **임베딩 모델** | `j-hartmann/emotion-english-distilroberta-base` (768차원) |
| **유사도 지표** | 코사인 유사도(cosine similarity), Jaccard 유사도(단어 수준) |

## 3. 실험 결과

### 3.1 임베딩 코사인 유사도

세 모델 쌍에 대한 MOOD 임베딩의 코사인 유사도를 측정하였다. 각 이미지에서 모델이 출력한 5개 MOOD 단어를 연결(concatenate)한 후 emotion-distilroberta 모델로 768차원 벡터를 추출하고, 모델 쌍별 코사인 유사도를 산출하였다.

| 모델 쌍 | Mean | Std | Min | Max | N |
|---------|------|-----|-----|-----|---|
| Claude vs GPT-4o | 0.5894 | 0.2425 | 0.0600 | 0.9483 | 20 |
| Claude vs Gemini | 0.6300 | 0.2416 | 0.0582 | 0.9363 | 20 |
| GPT-4o vs Gemini | 0.5498 | 0.2569 | 0.0455 | 0.9814 | 20 |

**관찰 요약**:
- 전체 평균 유사도는 0.55~0.63 범위로, 세 모델 간 감정 해석에 상당한 차이가 존재한다.
- Claude-Gemini 쌍이 가장 높은 평균 유사도(0.6300)를 기록하여, 두 모델의 감정 해석 패턴이 상대적으로 유사하다.
- GPT-4o-Gemini 쌍은 가장 낮은 평균(0.5498)이면서 가장 높은 max(0.9814)를 보여, 분산이 크다.
- 표준편차가 모든 쌍에서 0.24 이상으로, 이미지에 따른 일치도 편차가 매우 크다.

### 3.2 단어 겹침 (Jaccard Similarity)

MOOD 라벨의 단어 수준 Jaccard 유사도(교집합/합집합)를 산출하였다.

| 모델 쌍 | Jaccard Similarity |
|---------|--------------------|
| Claude vs GPT-4o | 0.1810 |
| Claude vs Gemini | 0.2081 |
| GPT-4o vs Gemini | 0.1931 |

단어 수준 일치율은 약 18~21%에 불과하나, 임베딩 유사도(55~63%)와의 차이는 동의어(synonym) 사용에 기인한다. 예를 들어 "melancholy"와 "somber"는 단어는 다르지만 감정 임베딩 공간에서는 인접한 벡터로 표현된다.

### 3.3 주요 불일치 사례 (Top 5)

코사인 유사도가 가장 낮은 5개 이미지를 분석하였다. 이들은 모델 간 감정 해석이 극단적으로 분기하는 사례이다.

#### 불일치 1: `gacs_emotional_shorts_00_WAmw-erI_scene_89.jpg`

| 모델 | MOOD | STYLE |
|------|------|-------|
| **Claude** | *(라벨링 거부)* — "I can't analyze the mood or emotions from this image, as it appears to show people in what might be an intimate or private situation." | warm-toned, cinematic, intimate |
| **GPT-4o** | calm, relaxed, casual, cozy, intimate | warm-toned, cozy, modern |
| **Gemini** | awkward, uncomfortable, concerned, subdued, casual | soft, muted, domestic |

**분석**: Claude의 content safety filter가 작동하여 MOOD 라벨을 거부한 반면, GPT-4o는 긍정적(calm, cozy), Gemini는 부정적(awkward, uncomfortable) 감정을 부여하였다. 이 사례는 세 모델의 safety 정책 및 감정 편향 차이를 극명히 보여준다.

#### 불일치 2: `gacs_animations_00_-HMqv0zl_scene_00.jpg`

| 모델 | MOOD | STYLE |
|------|------|-------|
| **Claude** | neutral, minimalist, stark, empty, clinical | minimalist, high-contrast, geometric |
| **GPT-4o** | bright, hopeful, serene, calm, peaceful | bright, minimalistic, high-contrast |
| **Gemini** | blank, empty, neutral, unclear, serene | overexposed, minimal, bleached |

**분석**: 거의 빈 화면으로 보이는 프레임에 대해 Claude와 Gemini는 "empty, neutral"로 사실적 묘사를 택한 반면, GPT-4o는 "hopeful, serene, peaceful"이라는 긍정 감정을 과잉 부여하였다. GPT-4o의 긍정 편향이 두드러지는 대표 사례이다.

#### 불일치 3: `gacs_animations_03_NWQH8cMp_scene_05.jpg`

| 모델 | MOOD | STYLE |
|------|------|-------|
| **Claude** | adventurous, determined, prepared, anticipatory, ready | animated, hand-drawn, cel-shaded |
| **GPT-4o** | mysterious, calm, neutral, exploring, simple | animated, minimalist, muted |
| **Gemini** | uncertain, anticipation, subdued, curious, vulnerable | flat, cartoonish, muted |

**분석**: Claude는 적극적이고 긍정적인 감정(adventurous, determined)을, GPT-4o는 중립적(calm, neutral), Gemini는 불안감(uncertain, vulnerable)을 부여하였다. 동일 애니메이션 프레임에 대한 세 가지 상이한 해석이 공존한다.

#### 불일치 4: `toy_story_5_trailer_scene_00.jpg`

| 모델 | MOOD | STYLE |
|------|------|-------|
| **Claude** | busy, cluttered, organized, commercial, mundane | dim-lit, realistic, cluttered |
| **GPT-4o** | anticipatory, focused, curious, secluded, enigmatic | dramatic, focused, shadowed |
| **Gemini** | intriguing, focused, curious, expectant, concealed | staged, cardboard, volumetric |

**분석**: Claude는 물리적 공간 속성(busy, cluttered)에 초점을 맞춘 반면, GPT-4o와 Gemini는 서사적 기대감(anticipatory, intriguing)에 초점을 맞추었다. Claude의 라벨링이 감정보다 장면 묘사에 가까운 경향을 보인다.

#### 불일치 5: `gacs_movie_trailers_00_Way9Dexn_scene_10.jpg`

| 모델 | MOOD | STYLE |
|------|------|-------|
| **Claude** | hazy, dreamlike, soft, intimate, melancholic | moody, sepia-toned, soft-focus |
| **GPT-4o** | ominous, chaotic, intense, mysterious, dramatic | dusty, chaotic, blurred |
| **Gemini** | chaotic, disorienting, bleak, apocalyptic, ominous | desaturated, hazy, gritty |

**분석**: Claude는 몽환적(dreamlike, soft)이고 서정적 해석을 취한 반면, GPT-4o와 Gemini는 위협적(ominous, apocalyptic, chaotic) 해석을 취하였다. Claude의 문학적 어휘 선택 경향이 다른 두 모델과 방향을 달리하는 사례이다.

### 3.4 모델별 특성 관찰

#### Claude Sonnet 4
- **Content safety 거부**: 친밀하거나 사적인 상황으로 판단된 이미지에 대해 MOOD 라벨링을 거부하는 사례가 확인됨 (`gacs_emotional_shorts_00_WAmw-erI_scene_89.jpg`)
- **보수적 라벨링**: 감정 부여보다 장면의 물리적 속성 묘사에 가까운 라벨을 선택하는 경향 (예: "cluttered", "stark", "clinical")
- **문학적 어휘**: "dreamlike", "enchanting", "contemplative" 등 문학적 수사를 활용

#### GPT-4o
- **긍정 편향(Positive Bias)**: 감정적 단서가 부족한 이미지에 대해서도 긍정적 감정을 부여하는 경향이 뚜렷함 (빈 화면에 "hopeful, serene, peaceful")
- **감정 과잉 부여**: 중립적 장면에 대해 서사적·감정적 해석을 과도하게 적용
- **일관적 서사 구성**: 5개 단어가 하나의 일관된 서사(narrative)를 구성하는 경향

#### Gemini 2.0 Flash
- **부정적 감정 민감성**: "awkward", "uncomfortable", "vulnerable", "bleak" 등 부정적 뉘앙스의 단어를 더 빈번하게 선택
- **Claude와의 유사성**: 평균 코사인 유사도 0.6300으로, GPT-4o보다 Claude와 더 유사한 감정 해석 패턴
- **사실적 묘사 선호**: STYLE 라벨에서 기술적 용어("desaturated", "volumetric", "bleached")를 적극 활용

## 4. 핵심 발견

1. **감정 임베딩 유사도 0.55~0.63**: 세 모델의 감정 임베딩 간 평균 코사인 유사도는 0.55~0.63으로, 약 37~45%의 좌표 차이가 발생한다. 이는 동일 이미지에 대해 모델별로 감정 좌표계의 위치가 상당히 다르게 산출됨을 의미한다.

2. **단어-의미 괴리**: 단어 수준 일치율은 약 20%에 불과하나, 의미적 유사도(임베딩)는 이보다 2~3배 높다. 모델들이 서로 다른 어휘를 사용하지만 유사한 감정 방향을 가리키는 경우가 다수 존재한다.

3. **모델별 감정 해석 편향**: GPT-4o는 긍정 편향, Gemini는 부정 민감성, Claude는 보수적 묘사 경향을 보인다. 이러한 편향은 GACS 좌표계에 체계적(systematic) 왜곡으로 전파될 수 있다.

4. **Claude의 라벨링 거부**: Content safety filter에 의한 라벨링 거부 사례가 확인되었다. 이는 파이프라인의 안정성(robustness) 관점에서 예외 처리 로직이 필요함을 시사한다.

## 5. 시사점 및 후속 과제

### 시사점

- **GACS 좌표계의 모델 종속성 확인**: 본 실험을 통해 GACS 좌표계가 사용된 Vision 모델에 종속적임이 실증적으로 확인되었다. 단일 모델로 구축된 좌표계는 해당 모델의 감정 해석 편향을 반영하게 된다.
- **재현성 문제**: 모델 업데이트 시 좌표계의 일관성이 보장되지 않으므로, 모델 버전 관리와 좌표계 버전 관리의 연동이 필요하다.

### 후속 과제

| 과제 ID | 내용 | 우선순위 |
|---------|------|----------|
| GACS-R002 | 모델별 독립 좌표계 구축 및 PCA 축 비교 | 높음 |
| GACS-R003 | 앙상블 좌표계(ensemble coordinate system) 가능성 탐색 | 중간 |
| GACS-R004 | Claude 라벨링 거부 사례에 대한 fallback 전략 수립 | 높음 |
| GACS-R005 | 모델별 감정 편향 보정(calibration) 기법 연구 | 중간 |

## 6. 실험 환경

| 항목 | 상세 |
|------|------|
| **Hardware** | Windows 4090 Workstation (WSL2) |
| **OS** | Linux (WSL2, kernel 6.6.87.2-microsoft-standard-WSL2) |
| **Python** | 3.12 |
| **임베딩 라이브러리** | sentence-transformers |
| **임베딩 모델** | j-hartmann/emotion-english-distilroberta-base (768차원) |
| **API SDK** | anthropic SDK, openai SDK, google-generativeai SDK |
| **실험 스크립트** | `compare_vision_models.py` |

---

## 부록

### A. 전체 라벨링 결과

아래 표는 20개 키프레임에 대한 3개 모델의 MOOD(5단어) 및 STYLE(3단어) 라벨링 전체 결과이다.

| # | Image | Claude MOOD | Claude STYLE | GPT-4o MOOD | GPT-4o STYLE | Gemini MOOD | Gemini STYLE |
|---|-------|-------------|--------------|-------------|--------------|-------------|--------------|
| 1 | gacs_advertisements_00_-P6q0A9K_scene_00.jpg | excited, enthusiastic, promotional, tech-focused, cheerful | neon-lit, tech-focused, promotional | futuristic, vibrant, excited, enthusiastic, energetic | futuristic, vibrant, sleek | excited, futuristic, innovative, bright, optimistic | high-contrast, vibrant, futuristic |
| 2 | gacs_advertisements_02_VGa1imAp_scene_08.jpg | dramatic, intense, supernatural, ominous, theatrical | dramatic, bronze-toned, sculptural | dramatic, intense, powerful, motion, ancient | dramatic, dynamic, expressive | surreal, unsettling, curious, dramatic, theatrical | bright, airy, classical |
| 3 | gacs_animations_00_-HMqv0zl_scene_00.jpg | neutral, minimalist, stark, empty, clinical | minimalist, high-contrast, geometric | bright, hopeful, serene, calm, peaceful | bright, minimalistic, high-contrast | blank, empty, neutral, unclear, serene | overexposed, minimal, bleached |
| 4 | gacs_animations_02_1o8GWhoD_scene_09.jpg | mysterious, whimsical, dramatic, enchanting, theatrical | animated, vibrant, fantasy | dramatic, intense, confident, heroic, bold | vivid, dynamic, bold | intense, determined, dramatic, ominous, surreal | stylized, vibrant, animated |
| 5 | gacs_emotional_shorts_00_44buVmzh_scene_00.jpg | relaxed, friendly, cheerful, casual, engaging | professional, broadcast, studio-lighting | cheerful, energetic, enthusiastic, welcoming, lively | colorful, casual, studio | friendly, positive, cheerful, engaging, relaxed | studio, bright, straightforward |
| 6 | gacs_emotional_shorts_02_DZQtVmKM_scene_118.jpg | bright, curious, welcoming, peaceful, contemporary | modern, minimalist, bright | warm, welcoming, joyful, intimate, affectionate | bright, modern, candid | warm, sentimental, domestic, loving, intimate | bright, clean, neutral |
| 7 | gacs_movie_trailers_00_UDfjsSqC_scene_00.jpg | explosive, chaotic, destructive, intense, apocalyptic | cinematic, explosive, dramatic | intense, chaotic, destructive, dramatic, apocalyptic | dramatic, explosive, dynamic | chaotic, destructive, intense, apocalyptic, desperate | chaotic, apocalyptic, gritty |
| 8 | gacs_movie_trailers_02_aWzlQ2N6_scene_06.jpg | intense, aggressive, violent, chaotic, dramatic | cinematic, motion-blur, high-contrast | intense, action-packed, dynamic, confrontational, thrilling | action-packed, dynamic, gritty | violent, chaotic, aggressive, intense, dangerous | action-oriented, desaturated, blurred |
| 9 | ready_or_not_trailer_scene_00.jpg | melancholy, lonely, contemplative, somber, reflective | cinematic, moody, atmospheric | desolate, intense, fiery, somber, reflective | dramatic, fiery, contrasting | desolate, tragic, disturbed, unsettling, resigned | stark, theatrical, desaturated |
| 10 | ready_or_not_trailer_scene_05.jpg | confident, authoritative, dramatic, intense, commanding | cinematic, warm-toned, dramatic-lighting | confident, assertive, focused, determined, engaging | dramatic, natural-light, dynamic | assertive, commanding, confident, serious, intense | candid, naturalistic, indoor |
| 11 | toy_story_5_trailer_scene_00.jpg | busy, cluttered, organized, commercial, mundane | dim-lit, realistic, cluttered | anticipatory, focused, curious, secluded, enigmatic | dramatic, focused, shadowed | intriguing, focused, curious, expectant, concealed | staged, cardboard, volumetric |
| 12 | toy_story_5_trailer_scene_02.jpg | anxious, distressed, worried, panicked, fearful | colorful, handmade, whimsical | confused, surprised, quirky, whimsical, playful | playful, colorful, whimsical | worried, anxious, uncertain, apprehensive, uneasy | cartoonish, bright, whimsical |
| 13 | man_vs_baby_trailer_scene_00.jpg | serious, authoritative, tense, official, dramatic | vintage, television-style, warm-toned | serious, concerned, formal, authoritative, focused | futuristic, dimly-lit, framed | neutral, serious, calm, informative, direct | staged, flat, framed |
| 14 | man_vs_baby_trailer_scene_05.jpg | serious, tense, confrontational, focused, intense | cinematic, warm-toned, shallow-focus | tense, serious, concerned, confrontational, pressured | cinematic, warm-toned, dramatic | serious, concerned, wary, observant, thoughtful | clean, neutral, cinematic |
| 15 | gacs_advertisements_00_-P6q0A9K_scene_01.jpg | excited, enthusiastic, cheerful, engaging, animated | professional, tech-focused, colorful | enthusiastic, informative, cheerful, engaging, welcoming | bright, modern, colorful | enthusiastic, informative, optimistic, engaging, cheerful | bright, saturated, informative |
| 16 | gacs_advertisements_04_w7oDM_as.temp_scene_07.jpg | mysterious, melancholic, atmospheric, contemplative, moody | moody, atmospheric, industrial | dark, mysterious, ominous, foreboding, dreary | dark, moody, industrial | gloomy, isolated, eerie, tense, melancholic | bleak, moody, urban |
| 17 | gacs_animations_03_NWQH8cMp_scene_05.jpg | adventurous, determined, prepared, anticipatory, ready | animated, hand-drawn, cel-shaded | mysterious, calm, neutral, exploring, simple | animated, minimalist, muted | uncertain, anticipation, subdued, curious, vulnerable | flat, cartoonish, muted |
| 18 | gacs_emotional_shorts_00_WAmw-erI_scene_89.jpg | *(라벨링 거부 — content safety filter 작동)* | warm-toned, cinematic, intimate | calm, relaxed, casual, cozy, intimate | warm-toned, cozy, modern | awkward, uncomfortable, concerned, subdued, casual | soft, muted, domestic |
| 19 | gacs_emotional_shorts_02_DZQtVmKM_scene_198.jpg | warm, affectionate, tender, loving, caring | casual, handheld, everyday | warm, comforting, affectionate, nostalgic, tender | casual, candid, soft | concerned, surprised, anxious, awkward, emotional | naturalistic, bright, candid |
| 20 | gacs_movie_trailers_00_Way9Dexn_scene_10.jpg | hazy, dreamlike, soft, intimate, melancholic | moody, sepia-toned, soft-focus | ominous, chaotic, intense, mysterious, dramatic | dusty, chaotic, blurred | chaotic, disorienting, bleak, apocalyptic, ominous | desaturated, hazy, gritty |

### B. 사용된 프롬프트

#### MOOD_PROMPT

```
Analyze the mood/emotion of this video frame.
Return EXACTLY 5 mood descriptor words, comma-separated.
Example: tense, mysterious, dark, suspenseful, foreboding
Output ONLY the 5 words, nothing else.
```

#### STYLE_PROMPT

```
Analyze the visual style of this video frame.
Return EXACTLY 3 style descriptor words, comma-separated.
Example: cinematic, warm-toned, shallow-focus
Output ONLY the 3 words, nothing else.
```

---

*본 보고서는 GACS Research Pipeline에 의해 자동 생성되었으며, 실험 데이터는 `research/model_comparison/` 디렉토리에 보관되어 있다.*

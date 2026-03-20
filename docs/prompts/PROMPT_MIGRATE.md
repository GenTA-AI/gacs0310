# Claude Code 작업 지시서: 환경 셋업 + Kushi 데이터 마이그레이션

CLAUDE.md를 먼저 읽고 프로젝트 컨텍스트를 파악한 뒤, 아래 순서대로 실행해.

## Step 1: Git 레포 클론 + 합치기

현재 이 폴더에는 `CLAUDE.md`, `migrate_kushi_data.py`, `gacs0202(kushi)/` 가 있고,
파이프라인 코드(`src/`, `tests/`, `run_pipeline.py` 등)는 GitHub에 있다.

```bash
# 레포 클론 (임시 디렉토리로)
git clone git@github.com:GenTA-AI/gacs_0202.git _repo_tmp

# 레포 내용을 현재 폴더로 합치기 (기존 파일 보존)
cp -rn _repo_tmp/* .
cp -rn _repo_tmp/.* . 2>/dev/null  # .gitignore, .github 등

# .git 디렉토리도 가져오기
mv _repo_tmp/.git .

# 임시 폴더 제거
rm -rf _repo_tmp
```

클론 후 확인:
- `src/dataset_builder.py`, `src/video_generator.py`, `src/experiment_runner.py` 존재
- `run_pipeline.py`, `gacs_config.py` 존재
- `tests/` 존재
- `git status`로 상태 확인

## Step 2: Python 환경 + 의존성 설치

```bash
# PyTorch CUDA 12.x
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# 나머지 의존성
pip install -r requirements.txt
```

확인:
```bash
python run_pipeline.py info    # GPU/CUDA 감지 확인
nvidia-smi                      # 4090 확인
python -m pytest tests/ -q      # 91개 테스트 pass 확인
```

실패하면 에러 분석 후 수정할 것.

## Step 3: Kushi 데이터 마이그레이션

```bash
# dry-run으로 먼저 검증
python migrate_kushi_data.py --dry-run

# 문제 없으면 full 실행 (all-MiniLM-L6-v2 임베딩 재계산, GPU 사용)
python migrate_kushi_data.py --full

# 씬 이미지 복사
mkdir -p data/scenes
cp -r "gacs0202(kushi)/scenes/"* data/scenes/
```

검증:
```python
import pandas as pd
df = pd.read_csv("data/embeddings/gacs_dataset.csv")
assert len(df) == 1275
assert df["mood_embedding"].notna().all()
assert df["mood_1"].ne("").sum() > 1200
print(f"OK: {len(df)} rows, {df['video_id'].nunique()} videos")
```

## Step 4: .gitignore 확인

다음 항목들이 `.gitignore`에 포함되어 있는지 확인하고, 없으면 추가:
```
gacs0202(kushi)/
data/scenes/
data/raw_videos/
data/frames/
data/generated/
temp_clone/
_repo_tmp/
*.npy
.env
```

## Step 5: Stage 2 파이프라인 테스트

```bash
python run_pipeline.py generate --quick-test
```

실패하면 에러 로그 분석 후 수정. 특히:
- `data/scenes/` 경로와 CSV의 `rep_frame_path` 매칭 확인
- 원본 영상이 없어도 씬 이미지만으로 테스트 가능한지 확인

## Step 6: 커밋 + 푸시

```bash
git add migrate_kushi_data.py CLAUDE.md data/embeddings/gacs_dataset.csv video_manifest.csv .gitignore
git commit -m "feat: migrate Kushi dataset (1,275 scenes) to CLAUDE.md schema v1.0.0"
git push origin main
```

## 에러 대응
- `git clone` 인증 실패 → SSH 키 확인: `ssh -T git@github.com`
- `sentence-transformers` 미설치 → `pip install sentence-transformers`
- CUDA OOM → `migrate_kushi_data.py`에서 `batch_size=128`을 `64`로 줄이기
- pytest 실패 → 에러 메시지 확인하고 하나씩 수정
- Stage 2 generate 실패 → `gacs_config.py`의 경로 설정 확인

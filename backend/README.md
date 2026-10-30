# backend

AI Canvas Note의 API 서버다. FastAPI, 표준 `sqlite3`, Gemini(`google-genai`)를 쓴다. 노트·쪽 저장, 손글씨 줄 인식, 답 스트리밍(SSE), 연구용 이벤트 기록을 맡는다. API 계약은 `docs/work/feat/note-app-mvp/1031_note-app-mvp.md` §6.2.

## 실행

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # macOS·Linux: .venv/bin/python
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

`http://localhost:8000/api/health`가 `{"ok": true}`를 돌려주면 된다. 환경 변수는 저장소 루트 `.env.example`을 본다(로컬 실행에서는 셸 환경 변수로 넣는다).

## 시험

```bash
.venv/Scripts/python -m pytest
.venv/Scripts/python -m mypy
.venv/Scripts/python -m ruff check .
.venv/Scripts/python -m ruff format --check .
```

시험은 Gemini를 부르지 않는다. `app.gemini`의 함수를 가짜로 바꿔 끼운다.

## 환경 변수

| Name | Default | 뜻 |
|------|---------|-----|
| `GEMINI_API_KEY` | 없음 | 서버 키. 없으면 요청의 `X-Gemini-Key` 헤더를 쓴다 |
| `GEMINI_VISION_MODEL` | `gemini-3.8-flash` | 손글씨 인식 모델 |
| `GEMINI_ANSWER_MODEL` | `gemini-3.8-flash` | 답 모델 |
| `GEMINI_THINKING_LEVEL` | `low` | `minimal`/`low`/`medium`/`high`. 비우면 보내지 않는다 |
| `DATABASE_PATH` | `./data/note.db` | SQLite 파일 (Docker: `/data/note.db`) |
| `CORS_ORIGINS` | `http://localhost:5173` | 쉼표로 구분한 허용 출처 |

## 구조

| Path | 역할 |
|------|------|
| `app/main.py` | 앱, CORS, 라우터, `/api/health`, `/api/config` |
| `app/config.py` | 환경 변수 |
| `app/db.py` | SQLite 연결과 스키마 |
| `app/routers/` | `notebooks`, `pages`, `ai`(인식·답), `events` |
| `app/gemini.py` | Gemini 호출과 오류 메시지 변환 |
| `app/prompts.py` | 인식·답 프롬프트 |

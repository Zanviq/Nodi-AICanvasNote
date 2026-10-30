# AI Canvas Note

태블릿과 펜으로 쓰는 손글씨 노트 앱. 필기하다가 궁금한 문장 위를 **펜으로 두 번 톡** 치면, 앱이 그 문장을 찾아 읽고 **질문 바로 아래 줄에 AI 답**을 써 준다. 답을 두 번 톡 하면 이어 질문 칸이 열린다. 입력창은 없다.

[Nodi](https://github.com/Nodi-Laboratory/Nodi)를 논문용으로 축소·개선한 프로그램이다.

## 기능

- **진짜 노트**: 괘선·모눈·무지 종이, 펜·연필·형광펜·지우개·올가미, 압력에 따른 굵기, 손바닥 무시, 실행 취소, 손가락으로 이동·확대
- **두 번 톡 질문**: 글자 위를 0.3초 안에 두 번 톡 → 후보 줄 덩어리(점선) → 손글씨 인식 → 문장 하나로 좁히기(형광펜) → 답. 마침표·쌍점·말줄임표 같은 점 필기는 질문으로 잡지 않는다
- **질문 아래 답**: 답은 갈색 인쇄체로 줄에 맞춰 써지고, 아래 필기는 줄 단위로 밀린다. 쪽이 넘치면 종이가 이어 붙는다
- **이어 질문**: 답을 두 번 톡 → 칸에 쓰고 「묻기」 → 그 아래로 같은 줄기의 답. 여백에 번호와 연필선
- **올가미로 묻기**: 자동 범위가 틀리면 올가미로 고르고 「이 부분 묻기」
- **질문이 바뀜**: 답을 받은 뒤 질문 글씨를 고치면 표시하고 「다시 묻기」를 권한다

문장 범위 알고리즘: [`docs/design/1030_v01_canvas-note/1030_v01_handwriting-question-recognition.md`](docs/design/1030_v01_canvas-note/1030_v01_handwriting-question-recognition.md)

## 바로 실행 (Docker)

```bash
cp .env.example .env
```

`.env`에 `GEMINI_API_KEY`를 넣는다. 비워 두면 앱의 **설정 → Gemini API 키**에서 넣을 수 있다(그 브라우저에만 저장).

```bash
docker compose up --build
```

<http://localhost:8080>에서 연다. 태블릿에서는 같은 네트워크의 `http://{컴퓨터 IP}:8080`으로 열고, 공유 메뉴의 「홈 화면에 추가」로 앱처럼 쓴다.

### 공개 서버에 띄울 때

로그인이 없는 앱이라 주소를 아는 사람은 누구나 노트를 보고 서버의 Gemini 키를 쓸 수 있다. 반드시 `.env`에 `APP_ACCESS_TOKEN`을 정하고, 앱 **설정 → 접근 코드**에 같은 값을 넣는다. 펜 입력과 홈 화면 앱을 쓰려면 HTTPS 뒤에 두는 것이 좋다.

## 환경 변수

| Name | Default | 설명 |
|------|---------|------|
| `GEMINI_API_KEY` | (없음) | 서버 Gemini 키. 없으면 설정 화면의 키를 쓴다 |
| `GEMINI_VISION_MODEL` | `gemini-3.8-flash` | 손글씨 인식 모델 |
| `GEMINI_ANSWER_MODEL` | `gemini-3.8-flash` | 답 모델 |
| `GEMINI_THINKING_LEVEL` | `low` | `minimal`/`low`/`medium`/`high`, 비우면 보내지 않음 |
| `APP_ACCESS_TOKEN` | (없음) | 정하면 모든 API가 이 접근 코드를 요구한다 |
| `DATABASE_PATH` | `/data/note.db` | SQLite 파일 (Docker 볼륨 `note-data`) |
| `CORS_ORIGINS` | `http://localhost:5173` | 개발 서버 출처 |
| `PORT` | `8080` | `docker compose`가 여는 포트 |

## 개발

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

(macOS·Linux는 `.venv/bin/…`)

```bash
cd frontend
npm install
npm run dev
```

<http://localhost:5173>. Vite가 `/api`를 8000번으로 넘긴다. 데스크톱에서는 마우스로 쓰고 두 번 클릭으로 질문한다(설정에서 끌 수 있다).

### 검사

| Scope | 명령 |
|-------|------|
| frontend | `npm run typecheck`, `npm test`, `npm run lint:tokens`, `npm run build` |
| backend | `pytest`, `mypy app`, `ruff check .` |

## 구조

```text
frontend/            Vite + React + TypeScript SPA (nginx로 서빙)
  src/question/      두 번 톡 판정, 줄 구성, 1·2단계 문장 범위, 답 자리, 질문 흐름
  src/ink/           필기 렌더러, 입력 표면
  src/styles/        디자인 토큰(tokens.css)과 화면 스타일
backend/             FastAPI + SQLite + Gemini(google-genai)
docs/                결정 로그, 설계 묶음, 작업 설계, PR 기록
CLAUDE.md            작업 규칙 (사람과 AI 공통)
DESIGN.md            디자인 요약
```

## 문서

- 작업 규칙: [`CLAUDE.md`](CLAUDE.md)
- 디자인: [`DESIGN.md`](DESIGN.md)
- 결정 로그: [`docs/design/1030_DL_decision-log.md`](docs/design/1030_DL_decision-log.md)
- 설계 묶음 v01: [`docs/design/1030_v01_canvas-note/`](docs/design/1030_v01_canvas-note/README.md)

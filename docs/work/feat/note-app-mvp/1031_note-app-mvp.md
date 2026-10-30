# 노트 앱 MVP (v0.1)

| 항목 | 내용 |
|------|------|
| 작성일 | 2026-10-31 |
| 작성자 | Zanviq (Claude 작성) |
| 브랜치 | `feat/note-app-mvp` |
| 기준 커밋 | `0625333` |
| 상태 | 진행 중 |
| 관련 PR | PR 전 |

## 1. 지금 작업 내용

설계 묶음 v01을 처음으로 구현한다. 사용자 지시(2026-10-31): 웹으로, 프런트와 백을 나눠서, 손글씨 인식과 답 모두 Gemini API 키로, 최대한 가볍게, 나중에 Docker로 묶어 배포한다. 중단 없이 한 번에 쓸 수 있는 상태까지 만든다.

시각 방향은 시안 A(학교 괘선 노트)를 기본으로 하고, 종이는 괘선·모눈·무지를 모두 지원한다(D-014, D-016).

## 2. 목표

- [ ] `docker compose up` 한 번으로 프런트(8080)와 백(내부 8000)이 뜨고, 브라우저에서 노트를 만들 수 있다.
- [ ] 펜(또는 마우스)으로 쓴 획이 압력에 따라 굵기가 바뀌고, 새로고침해도 남아 있다.
- [ ] 글자 위를 0.3초 안에 두 번 톡 하면 후보 점선 → 문장 형광펜 → 「읽은 문장」 꼬리표가 차례로 나온다.
- [ ] 한 줄 중간에서 시작해 다음 줄로 넘어간 문장을 두 번 톡 하면, 앞 문장을 빼고 그 문장만 고른다(단위 시험).
- [ ] 글자 사이에 찍은 쌍점·말줄임표, 한 번 톡은 질문이 되지 않는다(단위 시험).
- [ ] 답이 질문 바로 아래 줄에 갈색 인쇄체로 스트리밍되고, 아래 필기가 줄 단위로 밀린다. 쪽을 넘치면 종이가 이어 붙는다.
- [ ] 답을 두 번 톡 하면 이어 질문 칸이 열리고, 쓰고 「묻기」를 누르면 그 아래에 이어진 답이 생기며 여백에 줄기 번호가 붙는다.
- [ ] 올가미로 고른 획을 「이 부분 묻기」로 물을 수 있다.
- [ ] 서버 `.env`에 키가 없으면 설정 화면에서 넣은 키로 동작한다.
- [ ] 프런트 typecheck·단위 시험·토큰 검사, 백엔드 pytest·mypy·ruff가 통과한다.

## 3. 범위

- 포함: 서재(노트 목록·만들기·이름 바꾸기·지우기), 노트 쪽(괘선·모눈·무지, 쪽 넘기기·추가·지우기), 펜·연필·형광펜·지우개(획 단위)·올가미(이동·지우기·묻기), 색·굵기, 실행 취소·다시 실행, 손가락 이동·확대, 손바닥 무시, 두 번 톡 질문 전체 흐름(설계 §3.3–3.13), 이어 질문, 줄기 표시, 질문 바뀜 표시와 다시 묻기, 설정(키, 두 번 톡 켜기·민감도, 왼손잡이, 연구 기록 동의), 연구용 이벤트 기록, PWA 매니페스트, Docker 구성
- 제외: 계정·로그인(D-018), RAG(D-015), PDF 내보내기, 오프라인 대기열의 영구 저장(새로고침하면 대기 중 질문은 사라짐), 영역 지우개, 도형 보정

## 4. 참고한 상위 설계

| Doc | Section | Decision |
|-----|---------|----------|
| `docs/design/1030_v01_canvas-note/1030_v01_product-overview.md` | §3.3 핵심 흐름, §3.5 범위, §3.6 필기감, §3.7 데이터 모델 | D-001, D-002, D-016 |
| `docs/design/1030_v01_canvas-note/1030_v01_handwriting-question-recognition.md` | §3.3–3.13 전체 | D-003, D-004, D-005, D-009, D-010, D-012, D-013 |
| `docs/design/1030_v01_canvas-note/1030_v01_design-system.md` | §3.2–3.10 | D-006, D-011, D-014 |
| `docs/design/1030_DL_decision-log.md` | — | D-017, D-018, D-019 |

## 5. 단계별 작업 계획

1. 작업 설계(이 문서) — 커밋 1
2. 결정 로그·설계 문서·CLAUDE.md·DESIGN.md 갱신 — 관심사별로 커밋
3. 백엔드: 설정·DB → 노트·쪽 API → Gemini 인식·답 → 이벤트 → 시험 → Docker — 단계마다 커밋
4. 프런트 뼈대: Vite·TS·토큰 CSS·API 클라이언트 — 커밋
5. 필기 엔진: 획 모델·렌더링·카메라·입력 — 커밋
6. 질문 알고리즘: 제스처 → 기하·1단계 → 래스터화 → 정렬·2단계 → 배치 — 모듈마다 시험과 함께 커밋
7. 화면: 서재·쪽·도구 막대·오버레이·설정 — 커밋
8. Docker·README — 커밋
9. 브라우저로 전체 흐름 확인, 진행 기록 갱신, PR 설명서, Draft PR

## 6. 세부 설계

### 6.1 스택 (D-017)

| Part | Stack |
|------|-------|
| Frontend | Vite + React 18 + TypeScript(strict), Zustand, perfect-freehand. CSS는 토큰 CSS 변수 + 일반 CSS (Tailwind 없음) |
| Backend | Python 3.12, FastAPI, uvicorn, `google-genai`, 표준 `sqlite3` |
| DB | SQLite 파일 (`DATABASE_PATH`, Docker 볼륨) |
| AI | Gemini — 인식 `GEMINI_VISION_MODEL`, 답 `GEMINI_ANSWER_MODEL` (기본 `gemini-3.8-flash`, `thinking_level=low`) |
| Deploy | `docker-compose.yml`: `frontend`(nginx가 정적 파일과 `/api` 프록시), `backend`(uvicorn) |
| Test | 프런트 Vitest + `tsc --noEmit` + 토큰 검사 스크립트, 백엔드 pytest + mypy + ruff |

### 6.2 API 계약

모든 경로는 `/api` 아래. 요청에 `X-Gemini-Key` 헤더가 있으면 그 키를, 없으면 서버 `GEMINI_API_KEY`를 쓴다(D-019).

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/api/health` | — | `{ok: true}` |
| GET | `/api/config` | — | `{serverKey: bool, visionModel, answerModel}` |
| GET | `/api/notebooks` | — | `Notebook[]` (`id, title, paper, createdAt, updatedAt, pageCount`) |
| POST | `/api/notebooks` | `{title, paper: "ruled"|"grid"|"plain"}` | `Notebook` (첫 쪽 함께 생성) |
| PATCH | `/api/notebooks/{id}` | `{title}` | `Notebook` |
| DELETE | `/api/notebooks/{id}` | — | 204 |
| GET | `/api/notebooks/{id}/pages` | — | `PageMeta[]` (`id, index, updatedAt`) 순서대로 |
| POST | `/api/notebooks/{id}/pages` | `{after?: number}` | `Page` (`id, notebookId, index, data, updatedAt`). `after` 뒤에 끼우고 번호를 다시 매김. 없으면 맨 끝 |
| GET | `/api/pages/{id}` | — | `Page` |
| PUT | `/api/pages/{id}` | `{data: object}` | `{id, updatedAt}` (최대 8MB) |
| DELETE | `/api/pages/{id}` | — | 204. 마지막 한 쪽은 지울 수 없음(400) |
| POST | `/api/recognize` | `{image: "data:image/png;base64,…", lineCount: number}` | `{lines: [{index, text}]}` (index는 이미지에 찍힌 1부터의 줄 번호) |
| POST | `/api/answer` | `{question, nearby?, title?, thread?: [{q, a}]}` | `text/event-stream`: `data: {"delta": "…"}` 반복, 끝에 `data: {"done": true}`, 오류면 `data: {"error": "…"}` |
| POST | `/api/events` | `{events: [{type, at, data}]}` | `{saved: n}` |

키가 없으면 인식·답 API는 400 `{detail: {code: "no_key", message}}`.

### 6.3 쪽 데이터 (`Page.data`, 서버는 그대로 저장)

```ts
interface PageData {
  v: 1;
  extraRows: number;                 // 이어 붙인 줄 수 (D-012)
  strokes: Stroke[];
  questions: QuestionItem[];         // threadId, strokeIds, text, source, answered
  answers: AnswerItem[];             // threadId, questionId, x, y, w, rows, text, status
  slots: SlotItem[];                 // threadId, afterAnswerId, x, y, w, rows
}
interface Stroke {
  id: string; tool: "pen" | "pencil" | "highlighter";
  color: PenColor;                   // 토큰 키 ("blueblack" …), HEX 저장 안 함
  size: 0 | 1 | 2;
  pts: number[];                     // [x, y, pressure, dt] 반복, 쪽 단위(pu)
  t0: number;                        // 시작 시각(epoch ms)
  t1: number;                        // 끝 시각
  answerId?: string; slotId?: string;
}
```

### 6.4 프런트 모듈

| Module | 역할 |
|--------|------|
| `src/styles/tokens.css` | 모든 디자인 토큰 값 (유일하게 HEX를 쓰는 곳) |
| `src/design/tokens.ts` | 쪽 단위 수치 토큰, CSS 변수 읽기 |
| `src/api/` | REST·SSE 클라이언트, 키 헤더 |
| `src/model/` | 타입, 쪽 문서 연산(획 추가·지우기·이동, 줄 밀기) |
| `src/store/` | 설정(localStorage), 쪽 상태·실행 취소·자동 저장 |
| `src/ink/` | perfect-freehand 윤곽 → `Path2D` 캐시, 화면 크기 캔버스 렌더링, 카메라 |
| `src/question/gesture.ts` | 설계 §3.3 G1–G7 |
| `src/question/geometry.ts` | §3.4–3.5 h 추정, 그림 획 제외, 줄·단어·덩어리 |
| `src/question/candidate.ts` | §3.6 1단계 이어짐 점수 |
| `src/question/rasterize.ts` | §3.7 줄 띠 이미지 |
| `src/question/align.ts` | §3.7 글자–획 잇기 |
| `src/question/boundary.ts` | §3.8 2단계 경계 점수 |
| `src/question/placement.ts` | §3.11 답 자리 만들기, 이어 붙이기 |
| `src/question/controller.ts` | 전체 흐름, 취소, 이어 질문, 다시 묻기 |
| `src/ui/` | 서재, 쪽 화면, 도구 막대, 오버레이, 설정 |

### 6.5 렌더링 계층 (아래부터)

1. 종이 `div` (괘선·모눈 CSS 배경, 카메라 transform)
2. 질문 형광펜 SVG (곱하기 합성)
3. 답·이어 질문 칸 DOM (같은 transform)
4. 획 캔버스 2장 (확정 획, 쓰는 중인 획). 화면 크기, 카메라 변환으로 그림
5. 시스템 표시 SVG·꼬리표 (후보 점선, 손잡이, 줄기선, 꼬리표 버튼)

### 6.6 입력

| Pointer | 동작 |
|---------|------|
| `pen` | 현재 도구. 두 번 톡 판정 |
| `mouse` | 펜처럼 (데스크톱 확인용). 휠 = 세로 이동, Ctrl+휠 = 확대 |
| `touch` | 한 손가락 이동, 두 손가락 이동·확대, 두 손가락 톡 = 실행 취소. 펜이 닿아 있거나 뗀 지 0.4초 안이면 무시(손바닥) |

## 7. 확인 방법

| Goal | Method | Expected |
|------|--------|----------|
| Docker로 실행 | `docker compose up --build` 후 `http://localhost:8080` | 서재가 보이고 노트를 만들 수 있다 |
| 필기·저장 | 브라우저에서 쓰고 새로고침 | 획이 그대로 있다 |
| 두 번 톡 흐름 | 브라우저에서 문장 두 번 클릭 (키 설정 후) | 점선 → 형광펜 → 꼬리표 → 답 |
| 문장 범위 | `npm test` (`boundary`, `candidate` 시험) | 줄 중간 시작·두 줄 문장 시험 통과 |
| 점 필기 구분 | `npm test` (`gesture` 시험) | 쌍점·말줄임표·한 번 톡이 질문이 아님 |
| 답 배치 | `npm test` (`placement` 시험) | 아래 획이 줄 단위로 밀리고 넘치면 `extraRows` 증가 |
| 백엔드 | `pytest`, `mypy app`, `ruff check` | 모두 통과 (Gemini는 가짜 클라이언트) |
| 토큰 | `npm run lint:tokens` | 화면 코드에 HEX·색 함수 없음 |

## 8. 진행 기록

| Date | Progress |
|------|----------|
| 2026-10-31 | 저장소 연결, `main`·`dev` 생성, 작업 설계 작성 |

## 9. 결정·변경 사항

- 스택을 D-008(제안)에서 D-017로 바꿨다: 답변 모델을 Upstage에서 Gemini로(사용자 지시), Next.js 대신 Vite SPA(정적 파일 하나로 nginx에서 서빙, 더 가벼움), PostgreSQL 대신 SQLite(컨테이너 하나 줄임).

## 10. 남은 일

- 진행하면서 채운다.

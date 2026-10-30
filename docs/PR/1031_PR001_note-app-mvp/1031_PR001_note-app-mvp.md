# PR1: 노트 앱 MVP v0.1 (두 번 톡 손글씨 질문, Gemini, Docker)

| 항목 | 내용 |
|------|------|
| 작성일 | 2026-10-31 |
| 작성자 | Zanviq (Claude 작성) |
| 브랜치 | `feat/note-app-mvp` → `dev` |
| PR 링크 | https://github.com/Zanviq/Nodi-AICanvasNote/pull/1 |
| 관련 이슈 | 해당 없음 |
| 관련 설계 | `docs/design/1030_v01_canvas-note/` 전체 (제품 개요 §3, 손글씨 질문 인식 §3.3–3.13, 디자인 시스템 §3), 결정 D-001–D-019 |
| 작업 설계 경로 | `docs/work/feat/note-app-mvp/1031_note-app-mvp.md` |

## 1. 목적

설계 묶음 v01의 첫 구현이다. 사용자 지시(2026-10-31)대로 웹으로, 프런트와 백을 나눠, 손글씨 인식과 답 모두 Gemini API 키로, 최대한 가볍게 만들고 Docker로 배포할 수 있게 했다.

태블릿과 펜으로 필기하다가 문장 위를 두 번 톡 하면, 그 문장의 범위를 찾아 읽고 질문 바로 아래 줄에 AI 답을 쓴다. 답을 두 번 톡 하면 이어 질문 칸이 열린다.

## 2. 변경 사항

| Area | File / Module | Change |
|------|---------------|--------|
| 문서 | `docs/work/feat/note-app-mvp/` | 작업 설계, 진행 기록 |
| 문서 | `docs/design/1030_DL_decision-log.md` | D-009–D-016 확정, D-008 → D-017 대체, D-018·D-019 추가 |
| 문서 | `docs/design/1030_v01_canvas-note/*.md`, `DESIGN.md`, `CLAUDE.md` | 확정 스택·시안 A·구현 중 바꾼 점 반영, 코드 규칙·검사 명령 |
| 백엔드 | `backend/app/routers/notebooks.py`, `pages.py` | 노트·쪽 CRUD (SQLite, 쪽 데이터는 JSON 그대로 저장) |
| 백엔드 | `backend/app/gemini.py`, `prompts.py`, `routers/ai.py` | 줄 번호 붙은 이미지 → 줄 텍스트(JSON 스키마), 답 SSE 스트리밍, 키 헤더 우선 |
| 백엔드 | `backend/app/main.py`, `config.py` | `APP_ACCESS_TOKEN` 접근 코드, CORS, `/api/config` |
| 백엔드 | `backend/app/routers/events.py` | 연구용 이벤트 기록 |
| 프런트 | `frontend/src/styles/tokens.css`, `src/design/tokens.ts` | 시안 A 디자인 토큰 (값은 여기에만) |
| 프런트 | `frontend/src/ink/` | perfect-freehand 윤곽, 화면 크기 캔버스, 입력 표면(펜·톡·지우개·올가미·손가락·손바닥 무시) |
| 프런트 | `frontend/src/question/gesture.ts` | 두 번 톡 판정 G1–G7 |
| 프런트 | `frontend/src/question/geometry.ts`, `candidate.ts` | 줄 구성(괘선·모눈·무지), 1단계 후보 덩어리 |
| 프런트 | `frontend/src/question/align.ts`, `boundary.ts` | 글자–획 잇기, 2단계 문장 경계 점수 |
| 프런트 | `frontend/src/question/placement.ts`, `controller.ts`, `rasterize.ts` | 답 자리 만들기, 질문 흐름(답·이어 질문·올가미·다시 묻기·취소) |
| 프런트 | `frontend/src/ui/` | 서재, 설정, 도구 막대(펜 트레이), 쪽 화면(답·줄기·꼬리표·손잡이·이어 질문 칸) |
| 배포 | `docker-compose.yml`, `frontend/Dockerfile`, `frontend/nginx.conf`, `backend/Dockerfile` | nginx(정적 + `/api` 프록시, SSE 버퍼링 끔) + uvicorn, SQLite 볼륨 |
| 기타 | `README.md`, `.env.example`, `.gitignore`, `.gitattributes` | 실행·배포 안내, 환경 변수 |

## 3. 설계·결정 반영

- 따른 설계: 손글씨 질문 인식 §3.3(G1–G7), §3.5(줄 구성), §3.6(이어짐 점수), §3.7(줄 띠 이미지·글자–획 잇기), §3.8(경계 점수 8특징, θb 0.9), §3.11(줄 단위 밀기·종이 이어 붙이기), §3.12(이어 질문), §3.13(충돌 처리). 디자인 시스템 §3(시안 A 토큰·컴포넌트·상태). D-003–D-019.
- 설계와 다르게 한 부분과 이유 (설계 문서도 이 PR에서 함께 고침)
  - 1단계에 `itemStart` 특징(−1.0)을 더했다. 목록 기호로 시작한 줄 바로 아래가 기호 자리에서 시작하면 새 항목이다. 이것이 없으면 흐름 시안의 「②로 시작한 윗줄은 뺀다」가 성립하지 않는다(통합 시험으로 확인).
  - 범위 손잡이는 확인 모드에서만 보이고 「묻기」로 보낸다. 자동 질문은 범위가 정해지면 바로 답 자리를 만들기 때문이다.
  - 이미 답한 질문을 다시 물으면 같은 답 자리에 새로 쓴다. 아래에 답을 계속 쌓으면 노트가 지저분해진다.
  - 오프라인 자동 재전송은 v0.1에서 뺐다(남은 일).
  - 보안 검토로 `APP_ACCESS_TOKEN`을 더했다(D-018 영향).

## 4. 디자인 영향

- 시안 A를 확정하고(D-014) `DESIGN.md` 상태를 「확정」으로 바꿨다. 토큰 값의 유일한 정의 파일은 `frontend/src/styles/tokens.css`다.
- 화면 코드에는 HEX·색 함수가 없다(`npm run lint:tokens`). CSS 크기 값도 모두 토큰이다. 미디어 쿼리 구간만 `em`을 쓴다(CSS 변수를 쓸 수 없어서).
- 디자인 시스템 문서 값을 그대로 썼고, 대비가 낮던 보조 글자색(`--color-chrome-muted`)은 설계 단계에서 이미 `#64615B`로 고친 값을 썼다.

## 5. 테스트

| Check | Command / Method | Result |
|-------|------------------|--------|
| typecheck (프런트) | `npm run typecheck` | 통과 |
| typecheck (백) | `mypy app` | 통과 (strict) |
| lint (프런트) | `npm run lint:tokens` | 통과 |
| lint (백) | `ruff check .` | 통과 |
| test (프런트) | `npm test` | 27개 통과: 두 번 톡 G1–G7, 경계 점수, 답 자리, 1·2단계 통합(괘선·무지) |
| test (백) | `pytest` | 17개 통과: CRUD, 쪽 순서, 8MB 제한, 키 없음, 인식·답(가짜 Gemini), 이벤트, 접근 코드 |
| build | `npm run build` | 통과, JS gzip 73KB |
| 수동 확인 (브라우저) | Vite + uvicorn, 가짜 펜 이벤트로 필기, Gemini 응답 흉내 | 두 줄 덩어리 → 「근데 캘빈 회로는 … 걸까?」 범위 → 질문 아래 답 → 아래 필기 3줄 밀림 → 답 두 번 톡 → 이어 질문 칸 → 같은 줄기 2번 답 → 질문 획 지우면 「질문이 바뀜」 → 실행 취소 → 새로고침 후 유지 |
| 수동 확인 (실제 백엔드) | 키 없이 두 번 톡 | 꼬리표에 키 안내와 「설정 열기」 |
| 수동 확인 (Docker) | `docker compose up` (포트 8089) | nginx 경유 health·config·SPA 경로·SSE 경로·볼륨 쓰기 정상 |
| 생략 | 실제 Gemini 호출, 실제 태블릿 펜 | 키와 기기가 없어 하지 못했다. 원격 CI 없음, 위 검사는 모두 로컬 |

## 6. 리뷰어가 볼 곳

- `frontend/src/question/candidate.ts`, `boundary.ts`: 논문의 핵심인 범위 알고리즘. 가중치·문턱은 설계 기호와 같은 이름의 상수다.
- `frontend/src/question/pipeline.test.ts`: 알고리즘이 무엇을 보장하는지 한눈에 보인다.
- `frontend/src/ink/surface.ts`: 펜 경로가 React를 거치지 않는지, 톡 점이 임시로 그려졌다가 지워지는지.
- `frontend/src/question/controller.ts`: 답 자리 만들기와 취소 시 줄을 돌려주는 부분.
- `backend/app/main.py`: 접근 코드 미들웨어.

## 7. 배포·마이그레이션 메모

- `cp .env.example .env` 후 `GEMINI_API_KEY`를 넣고 `docker compose up --build`. 포트는 `PORT`(기본 8080).
- 공개 서버면 `APP_ACCESS_TOKEN`을 반드시 정한다. 앱 설정의 「접근 코드」에 같은 값을 넣는다.
- DB는 처음 기동할 때 자동으로 만든다(볼륨 `note-data`). 마이그레이션 없음.
- 모델 기본값 `gemini-3.8-flash`, `thinking_level=low`. 바꾸려면 `.env`.

## 8. 관련 문서

- 리뷰 기록: `docs/PR/1031_PR001_note-app-mvp/1031_PR001-REVIEW_note-app-mvp.md`
- 작업 설계: `docs/work/feat/note-app-mvp/1031_note-app-mvp.md`
- 결정 로그: `docs/design/1030_DL_decision-log.md`

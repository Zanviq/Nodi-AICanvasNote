# PR1 리뷰 기록: 노트 앱 MVP v0.1 (두 번 톡 손글씨 질문, Gemini, Docker)

| 항목 | 내용 |
|------|------|
| 작성일 | 2026-10-31 |
| 리뷰어 | Claude (셀프 리뷰 + 자동 보안 검토) |
| PR 링크 | https://github.com/Zanviq/Nodi-AICanvasNote/pull/1 |
| 기준 커밋 | `de062a1` |

## 1. 확인한 범위

- 본 파일·커밋: 백엔드 전체(특히 `gemini.py`, `routers/ai.py`, `main.py`), 프런트 `question/`·`ink/`·`store/`, Docker 구성
- 돌린 검사 (모두 로컬, 원격 CI 없음): 프런트 `npm run typecheck`, `npm test`(27 통과), `npm run lint:tokens`, `npm run build` / 백엔드 `pytest`(17 통과), `mypy app`, `ruff check .` / 브라우저 흐름 확인 / `docker compose up` 확인
- 생략한 검사와 이유: 실제 Gemini 호출(키 없음), 실제 iPad·갤럭시 탭 펜 입력(기기 없음)

## 2. 수정할 사항

| # | Severity | Location | Issue | Action | Status |
|---|----------|----------|-------|--------|--------|
| 1 | major | `backend/app/routers/ai.py` | 로그인이 없어 서버 주소를 아는 누구나 서버 Gemini 키로 요청할 수 있다 (자동 보안 검토) | 이 PR | 수정됨(PR1) — `APP_ACCESS_TOKEN` 접근 코드 |
| 2 | major | `backend/app/routers/pages.py` | 노트·쪽을 소유자 확인 없이 읽고 쓸 수 있다 (자동 보안 검토) | 이 PR | 수정됨(PR1) — 같은 접근 코드로 모든 API 잠금. 계정·소유자 구분은 D-018대로 두지 않음 |
| 3 | minor | `backend/app/routers/ai.py` | 이미지 크기 제한이 base64 디코딩 뒤에 있다 (자동 보안 검토) | 이 PR | 수정됨(PR1) — 요청 필드 길이로 먼저 자름 |
| 4 | major | `frontend/src/ink/surface.ts` | `setPointerCapture`가 실패하면 획이 통째로 사라진다 (브라우저 확인 중 발견) | 이 PR | 수정됨(PR1) |
| 5 | minor | `frontend/src/question/candidate.ts` | 목록 기호로 시작한 윗줄이 아랫줄과 합쳐진다 | 이 PR | 수정됨(PR1) — `itemStart` 특징 |
| 6 | minor | `frontend/src/question/controller.ts` | 오프라인일 때 「연결되면 물어볼게요」라고 하지만 자동으로 다시 보내지 않는다 | 리뷰 수정 PR | 열림 |
| 7 | nit | `frontend/src/ui/PageSurface.tsx` | 「질문이 바뀜」 안내가 답 아래 오른쪽에 붙어 아래 필기와 겹칠 수 있다 | 리뷰 수정 PR | 열림 |

- 병합을 막는 문제(blocker)는 없다.

## 3. 메모

- 공개 배포 시 `APP_ACCESS_TOKEN`을 정하라는 안내를 README와 `.env.example`에 넣었다.

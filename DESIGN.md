# DESIGN.md

AI Canvas Note의 디자인 요약이다. 모든 UI는 이 문서를 따른다. 세부 값과 이유는 디자인 시스템 설계 문서 `docs/design/1030_v01_canvas-note/1030_v01_design-system.md`(아래 「설계 문서」)를 따른다.

> **상태: 확정.** 시각 방향은 **시안 A(학교 괘선 노트)**다(결정 로그 D-014). 종이는 괘선·모눈·무지를 고를 수 있다(D-016). 시안: `docs/design/1030_v01_canvas-note/mockups/`
>
> 토큰 값의 유일한 정의 파일: `frontend/src/styles/tokens.css`

## 규칙

- 화면 코드에는 HEX 값이나 임의 크기를 쓰지 않는다. 아래 **토큰 이름만** 쓴다. 값은 토큰 정의 파일 한 곳에만 둔다.
- 디자인을 바꾸라는 지시를 받으면 코드보다 먼저 이 파일을 고치고, 같은 PR에서 설계 문서도 고치고, 맨 아래 변경 기록에 남긴다.
- 이 파일과 설계 문서가 어긋나면 작업을 멈추고 어느 쪽이 맞는지 확인한 뒤 둘 다 맞춘다.

## 1. 원칙

1. **필기가 먼저다.** 주인공은 종이와 내 글씨다. 장치는 작고 조용하게, 종이 밖 책상 위에 둔다.
2. **AI 글은 출처가 보인다.** 인쇄체 + 전용 잉크색 + 색 말고 표시 하나(도장). AI 잉크색은 사용자 펜 색상표에 넣지 않는다.
3. **진짜 물건처럼 움직인다.** 형광펜 띠, 줄에 맞춰 써지는 답, 줄 단위로 밀리는 필기. 떠다니는 카드와 연결선은 없다.
4. **애매하면 필기로 남긴다.** 시스템 표시는 취소할 수 있고, 사용자 획은 함부로 바꾸지 않는다.

**쓰지 않는 것** (Nodi의 디자인): 흰 점 격자 무한 캔버스, 카드와 카드 오버레이, 곡선 연결선, 연두·올리브 계열 강조색, 아래쪽 채팅 입력창, 왼쪽 아이콘 세로 내비게이션, 손글씨 글꼴로 쓴 AI 글.

## 2. 색

| Token | Role | Value |
|-------|------|-------|
| `--color-desk` | 종이 밖 책상, 도구 막대 바탕 | `#E4E2DC` |
| `--color-tray` | 펜 트레이 홈 | `#D6D3CC` |
| `--color-chrome-ink` | 도구 막대 아이콘·글자 | `#3B3A37` |
| `--color-chrome-muted` | 보조 글자 | `#64615B` |
| `--color-surface` | 꼬리표·메뉴 바탕 | `#FFFFFF` |
| `--color-paper` | 종이 | `#FBFBF7` |
| `--color-rule` | 괘선·모눈 | `#BCCCDD` |
| `--color-rule-strong` | 머리 괘선, 종이 인쇄 글자, 이어 붙인 종이 이음선 | `#8FA6BE` |
| `--color-margin` | 여백선 | `#E9B1AE` |
| `--color-ink-ai` | AI 답 글자 | `#5B3B24` |
| `--color-ai-mark` | AI 답 도장 | `#8C4A2F` |
| `--color-highlight` | 질문 범위 형광펜 띠 | `#FFE45C` |
| `--color-select` | 범위 손잡이, 톡 위치, 진행 점 | `#A87400` |
| `--color-graphite` | 시스템 연필 표시(줄기선, 질문 번호, 이어 질문 칸, 후보 점선) | `#6E6C68` |
| `--color-error` | 오류 문구 | `#A8322A` |

**사용자 펜 색상표**: `--pen-blueblack` `#24315E`(기본), `--pen-black` `#1F1F22`, `--pen-red` `#C2362B`, `--pen-blue` `#2F62C9`, `--pen-graphite` `#4A4946`, `--pen-highlight-yellow` `#F3DC6B`, `--pen-highlight-pink` `#F2A7C3`.

**종이 질감**: `--texture-paper` (노이즈, 알파 0.05–0.10).

## 3. 글꼴

| Token | Family | 쓰는 곳 |
|-------|--------|---------|
| `--font-ai` | Gowun Batang | AI 답, 「읽은 문장」 |
| `--font-ui` | IBM Plex Sans KR | 도구 막대, 꼬리표, 설정, 서재 |
| `--font-hint` | Nanum Pen Script | 이어 질문 칸 안내 문구만 |

| Token | Size / Line height |
|-------|--------------------|
| `--text-ai` | `var(--row) × 0.485` / `var(--row)` — 괘선 한 줄에 한 줄 |
| `--text-ui-xs` | 11.5 / 1.4 |
| `--text-ui-sm` | 13 / 1.5 |
| `--text-ui-md` | 15 / 1.5 |
| `--text-ui-lg` | 20 / 1.3 |
| `--text-hint` | 25 / 1 |

사용자 필기는 글꼴이 아니라 펜 획이다.

## 4. 간격

| Token | Value | 뜻 |
|-------|-------|-----|
| `--page-width` | 798pu | 쪽 폭(종이 단위, 확대와 함께 커짐) |
| `--row` | 34pu | 괘선 간격. 답·이어 질문 칸·밀기는 모두 이 단위 |
| `--page-head` | 72pu | 첫 괘선 위 머리 |
| `--margin-x` / `--text-x` | 96pu / 112pu | 여백선 / 본문 시작 |
| `--grid-cell` | 20pu | 모눈 한 칸 |
| `--space-1`…`--space-6` | 4·8·12·16·24·32px | 화면 장치 간격 |
| `--toolbar-h` | 66px | 도구 막대 높이 |
| `--hit-min` | 44px | 터치 대상 최소 |
| `--radius-sm` / `--radius-md` / `--radius-pill` | 6 / 8 / 12px | 꼬리표 / 이어 질문 칸 / 칩 |
| `--shadow-paper` / `--shadow-float` | 설계 문서 §3.4 | 종이 / 떠 있는 꼬리표 |
| `--dur-fast` / `--dur-row` | 120ms / 150ms | 꼬리표 / 줄 이동 |

## 5. 컴포넌트

| Component | 요약 |
|-----------|------|
| `PaperPage` | 종이 + 질감 + 괘선(또는 모눈·무지) + 여백선 + 스프링 구멍 |
| `PageSeam` | 답 때문에 이어 붙인 종이의 이음선 |
| `PenTray` | 위쪽 펜 트레이. 고른 펜이 올라온다 |
| `InkSwatch`, `WidthDots`, `QuestionToggle` | 색, 굵기, 「두 번 톡 질문」 켜기 |
| `CandidateOutline` | 1단계 후보 범위 연필 점선 |
| `SelectionHighlight` + `SelectionHandle` | 2단계 문장 범위 형광펜 띠와 손잡이 |
| `TapRipple` | 톡 위치 표시 |
| `ReadingTag` | 「읽은 문장」 꼬리표, 진행 상태, 취소 |
| `AnswerBlock` + `AnswerStamp` | 줄 위 인쇄체 답 + 여백 「답」 도장 |
| `QuestionNumber` + `ThreadLine` | 여백의 줄기 번호와 연필선 |
| `FollowUpSlot` + `AskChip` | 이어 질문 점선 칸과 「묻기」 |
| `StaleNote`, `ErrorNote` | 질문이 바뀜 / 읽지 못함 안내 |

모양 세부: 설계 문서 §3.7.

## 6. 상태

| State | 보이는 것 |
|-------|-----------|
| `tentative-tap` | 첫 톡 점 |
| `candidate` | 후보 점선 |
| `reading` | 형광펜 띠(진하게) + 손잡이 + 「읽는 중」 |
| `confirm` | 「이 문장이 맞나요?」 + 「묻기」「범위 고치기」 |
| `answering` | 「답을 쓰는 중」 + 진행 점, 답이 줄마다 써짐 |
| `answered` | 띠 옅게, 도장 |
| `stale` | 「질문이 바뀜」 + 「다시 묻기」 |
| `error` | 무엇이 안 됐는지와 다음 행동 |
| `queued` | 「연결되면 물어볼게요」 |
| `cancelled` | 표시 없음, 사용자 획 그대로 |

## 7. 접근성

- 대비: AI 글 7:1 이상, UI 글자 4.5:1 이상, 손잡이·점선 3:1 이상. 종이 인쇄 장식은 예외.
- 출처는 색만으로 알리지 않는다(도장·라벨·번호).
- 터치 대상 44×44 이상.
- 왼손잡이 모드: 꼬리표와 세로 도구를 반대편으로.
- `prefers-reduced-motion`: 이동 없이 바로 바뀜.
- 화면 낭독: `AnswerBlock`은 `role="note"`, 라벨 「AI 답」.
- AI 글은 쪽 폭에 맞췄을 때 14px 이상.

## 변경 기록

| Date | Change | PR |
|------|--------|----|
| 2026-10-30 | 최초 작성. 시안 A 값을 잠정값으로 | 해당 없음 |
| 2026-10-31 | 시안 A 확정, 토큰 정의 파일 위치 추가 | PR 전 |

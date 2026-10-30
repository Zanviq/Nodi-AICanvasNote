# mockups

설계 묶음 v01의 HTML UI 시안을 두는 공간이다. 브라우저로 바로 열어 본다.

## 용도

- 여기에 두는 것: 화면 시안 HTML(정적, 외부 의존은 Google Fonts뿐), 시안을 모아 보는 갤러리
- 여기에 두지 않는 것: 제품 코드(`frontend/` 예정), 디자인 결정과 토큰 값(`../1030_v01_design-system.md`, 루트 `DESIGN.md`)

## 이름 규칙

- 형식: `MMDD_v{NN}_mockup-{이름}.html`
- 식별자: 설계 묶음 버전 `v{NN}`. 시안은 묶음과 함께 바뀌기 때문이다.
- 예: `1030_v01_mockup-a-school-ruled.html`

## 작성 규칙

- 토큰은 파일 맨 위 `:root`에만 값으로 쓰고, 화면 요소는 변수 이름만 쓴다. 짧은 이름과 디자인 시스템 이름의 대응은 `../1030_v01_design-system.md` §3.12.
- 시안의 손글씨는 Nanum Pen Script로 흉내 낸 것이다. 제품에서는 실제 펜 획이다.
- `?embed`를 붙여 열면 설명을 숨기고 기기만 보여 준다(갤러리용).
- 시안을 바꾸면 이 README의 목록과 디자인 시스템 문서 §2를 함께 고친다.

## 목록

| File | 내용 |
|------|------|
| `1030_v01_mockup-gallery.html` | 세 시안을 나란히 보는 갤러리 |
| `1030_v01_mockup-a-school-ruled.html` | 시안 A. 학교 괘선 노트 (세로, 줄 위 인쇄체 답, 위쪽 펜 트레이) |
| `1030_v01_mockup-b-grid-pad.html` | 시안 B. 방안 연습장 (세로, 테이프 쪽지 답, 왼쪽 자 모양 막대) |
| `1030_v01_mockup-c-plain-spread.html` | 시안 C. 무지 펼침면 (가로 두 쪽, 각주식 답, 오른쪽 펜 홀더) |
| `1030_v01_mockup-flow-double-tap.html` | 두 번 톡 질문 흐름 6단계와 필기 구분 규칙 |

## 문서 양식

시안 HTML 머리 부분 양식이다. 해당 없는 항목은 지우지 말고 「해당 없음」이라고 쓴다.

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{시안 이름}</title>
<style>
/* {시안 이름} 토큰: 화면 요소는 아래 변수 이름만 쓴다 */
:root{
  --paper:{값};
  /* … */
}
</style>
</head>
<body>
<header class="cap">
  <h1>{시안 이름}</h1>
  <p>{이 시안이 무엇을 보여 주는지 한두 문장}</p>
  <ul>
    <li><b>선택</b>{질문 범위 표시}</li>
    <li><b>답</b>{AI 답 표시}</li>
    <li><b>이어 질문</b>{이어 질문 칸}</li>
    <li><b>도구</b>{도구 막대}</li>
  </ul>
</header>
<!-- 기기 프레임과 화면 -->
</body>
</html>
```

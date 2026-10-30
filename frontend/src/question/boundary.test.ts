import { describe, expect, it } from "vitest";
import { boundaryScores, connectiveValue, endingValue, punctValue, selectSentence, THETA_B, type BToken } from "./boundary";

function toks(lines: string[], gapMs = 300): BToken[] {
  const out: BToken[] = [];
  let t = 0;
  lines.forEach((line, li) => {
    let x = 0;
    for (const w of line.split(" ")) {
      out.push({ text: w, line: li, minX: x, maxX: x + w.length * 18, t0: t, t1: t + 400 });
      x += w.length * 18 + 12;
      t += 400 + gapMs;
    }
  });
  return out;
}

describe("문장 끝 신호", () => {
  it("문장부호", () => {
    expect(punctValue("생긴다.")).toBe(1);
    expect(punctValue("걸까?")).toBe(1);
    expect(punctValue("3.5")).toBe(0);
    expect(punctValue("1.")).toBe(0);
    expect(punctValue("그리고…")).toBe(0.5);
  });
  it("종결어미와 연결어미", () => {
    expect(endingValue("생긴다.")).toBe(1);
    expect(endingValue("걸까?")).toBe(1);
    expect(endingValue("필요함")).toBe(0.6);
    expect(connectiveValue("쓰는데")).toBe(1);
    expect(connectiveValue("왜냐하면,")).toBe(1);
    expect(connectiveValue("되니까?")).toBe(0);
  });
});

describe("문장 고르기", () => {
  const lines = ["밤엔 ATP가 안 생긴다. 근데 캘빈 회로는", "빛을 직접 안 쓰는데 왜 밤에는 멈추는 걸까?"];

  it("줄 중간에서 시작해 다음 줄로 넘어간 문장만 고른다", () => {
    const tokens = toks(lines);
    const anchor = tokens.findIndex((t) => t.text === "빛을");
    const s = selectSentence({ tokens, continuations: [1.1], tauS: 54 }, anchor);
    expect(s.text).toBe("근데 캘빈 회로는 빛을 직접 안 쓰는데 왜 밤에는 멈추는 걸까?");
  });

  it("앞 문장을 짚으면 앞 문장만", () => {
    const tokens = toks(lines);
    const anchor = tokens.findIndex((t) => t.text === "ATP가");
    expect(selectSentence({ tokens, continuations: [1.1], tauS: 54 }, anchor).text).toBe("밤엔 ATP가 안 생긴다.");
  });

  it("마침표 없는 개조식은 목록 기호에서 끊는다", () => {
    const tokens = toks(["① 명반응 틸라코이드 막에서 빛 흡수", "② 탄소 고정 스트로마에서 일어남"]);
    const anchor = tokens.findIndex((t) => t.text === "스트로마에서");
    expect(selectSentence({ tokens, continuations: [0.6], tauS: 54 }, anchor).text).toBe("② 탄소 고정 스트로마에서 일어남");
  });

  it("이어짐이 약한 줄바꿈과 긴 멈춤은 경계가 된다", () => {
    const tokens = toks(["광합성 속도 영향 요인", "엽록소는 왜 초록색일까"]);
    tokens[3].t1 = 0;
    tokens[4].t0 = 120000;
    const scores = boundaryScores({ tokens, continuations: [-1.7], tauS: 54 });
    expect(scores[3]).toBeGreaterThanOrEqual(THETA_B);
  });

  it("같은 줄의 먼 덩어리는 다른 문장", () => {
    const tokens: BToken[] = [
      { text: "광합성은", line: 0, minX: 0, maxX: 60, t0: 0, t1: 100 },
      { text: "중요", line: 0, minX: 70, maxX: 100, t0: 200, t1: 300 },
      { text: "메모", line: 0, minX: 400, maxX: 440, t0: 400, t1: 500 },
    ];
    expect(selectSentence({ tokens, continuations: [], tauS: 54 }, 2).text).toBe("메모");
  });
});

// 기하(1단계) → 글자 잇기 → 경계 점수(2단계)를 가짜 손글씨로 끝까지 돌린다.
import { describe, expect, it } from "vitest";
import { alignLine, fillTimes, tokenAt, type Token } from "./align";
import { selectSentence } from "./boundary";
import { buildBlock, findWordAt } from "./candidate";
import { buildLayout } from "./geometry";
import { center, writeLine } from "./testkit";

const texts = [
  "② 탄소 고정(캘빈 회로) : 스트로마",
  "밤엔 ATP가 안 생긴다. 근데 캘빈 회로는",
  "빛을 직접 안 쓰는데 왜 밤에는 멈추는 걸까?",
  "· 광합성 속도에 영향 : 빛의 세기",
];

function notebook(paper: "ruled" | "plain" = "ruled") {
  const l0 = writeLine(texts[0], { row: 0, t0: 0, paper });
  const l1 = writeLine(texts[1], { row: 1, t0: l0.t + 1500, paper });
  const l2 = writeLine(texts[2], { row: 2, t0: l1.t + 800, paper });
  const l3 = writeLine(texts[3], { row: 3, t0: l2.t + 60000, paper });
  return [l0, l1, l2, l3];
}

function run(anchorLine: number, wordIndex: number, paper: "ruled" | "plain" = "ruled") {
  const written = notebook(paper);
  const strokes = written.flatMap((l) => l.strokes);
  const layout = buildLayout(strokes, paper);
  const line = layout.lines[anchorLine];
  const words = line.segments.flatMap((s) => s.words);
  const [x, y] = center(strokes.find((s) => s.id === words[wordIndex].strokeIds[0])!);
  const word = findWordAt(layout, x, y)!;
  const block = buildBlock(layout, word);
  let tokens: Token[] = [];
  block.lines.forEach((bl, li) => tokens.push(...alignLine(texts[bl.line.index], bl.words, li)));
  tokens = fillTimes(tokens);
  const anchor = tokenAt(tokens, x, y, new Set(word.strokeIds));
  return { layout, block, sentence: selectSentence({ tokens, continuations: block.continuations, tauS: layout.tauS }, anchor) };
}

describe("두 번 톡 문장 범위 (1단계 + 2단계)", () => {
  it("줄을 괘선 칸으로 나누고 단어를 띄어쓰기로 나눈다", () => {
    const { layout } = run(2, 0);
    expect(layout.lines.map((l) => l.row)).toEqual([0, 1, 2, 3]);
    expect(layout.lines[2].segments.flatMap((s) => s.words)).toHaveLength(texts[2].split(" ").length);
  });

  it("후보 덩어리: ②로 시작한 윗줄과 · 로 시작한 아랫줄은 뺀다", () => {
    const { block } = run(2, 0);
    expect(block.lines.map((l) => l.line.index)).toEqual([1, 2]);
  });

  it("줄 중간에서 시작해 다음 줄로 넘어간 문장을 고른다", () => {
    expect(run(2, 0).sentence.text).toBe("근데 캘빈 회로는 빛을 직접 안 쓰는데 왜 밤에는 멈추는 걸까?");
  });

  it("같은 덩어리의 앞 문장을 짚으면 앞 문장만", () => {
    expect(run(1, 1).sentence.text).toBe("밤엔 ATP가 안 생긴다.");
  });

  it("목록 줄은 그 줄만", () => {
    const { block, sentence } = run(3, 2);
    expect(block.lines.map((l) => l.line.index)).toEqual([3]);
    expect(sentence.text).toBe(texts[3]);
  });

  it("무지 종이에서도 줄을 찾고 같은 문장을 고른다", () => {
    const { layout, sentence } = run(2, 0, "plain");
    expect(layout.lines).toHaveLength(4);
    expect(sentence.text).toBe("근데 캘빈 회로는 빛을 직접 안 쓰는데 왜 밤에는 멈추는 걸까?");
  });
});

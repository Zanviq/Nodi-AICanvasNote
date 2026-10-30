import { describe, expect, it } from "vitest";
import { pageHeight } from "../design/tokens";
import { strokeGeom } from "../model/stroke";
import { emptyPage, type PageData } from "../model/types";
import { fitPage, makeRoom, releaseRows } from "./placement";
import { writeLine } from "./testkit";

function page(): PageData {
  const a = writeLine("질문 줄", { row: 2, t0: 0 }).strokes;
  const b = writeLine("아래 필기", { row: 4, t0: 1000 }).strokes;
  return {
    ...emptyPage(),
    strokes: [...a, ...b],
    answers: [{ id: "A", threadId: "t", questionId: "Q", step: 1, x: 112, y: 72 + 34 * 6, w: 600, rows: 2, text: "", status: "done" }],
  };
}

describe("답 자리 만들기 (D-012)", () => {
  it("끼우는 선 아래만 줄 단위로 내린다", () => {
    const d = page();
    const yIns = 72 + 34 * 3;
    const out = makeRoom(d, "ruled", yIns, 3);
    d.strokes.forEach((s, i) => {
      const moved = strokeGeom(s).minY >= yIns;
      expect(strokeGeom(out.strokes[i]).minY - strokeGeom(s).minY).toBeCloseTo(moved ? 102 : 0);
    });
    expect(out.answers[0].y).toBe(d.answers[0].y + 102);
  });

  it("쪽을 넘치면 종이를 줄 단위로 이어 붙인다", () => {
    const d = { ...emptyPage(), strokes: writeLine("맨 아래 줄", { row: 30, t0: 0 }).strokes };
    const out = makeRoom(d, "ruled", 72 + 34 * 29, 4);
    expect(out.extraRows).toBeGreaterThan(0);
    const bottom = Math.max(...out.strokes.map((s) => strokeGeom(s).maxY));
    expect(bottom).toBeLessThanOrEqual(pageHeight("ruled", out.extraRows));
  });

  it("돌려준 줄만큼 다시 당긴다", () => {
    const d = page();
    const yIns = 72 + 34 * 3;
    const out = releaseRows(makeRoom(d, "ruled", yIns, 3), "ruled", yIns, 3);
    out.strokes.forEach((s, i) => expect(strokeGeom(s).minY).toBeCloseTo(strokeGeom(d.strokes[i]).minY));
  });

  it("넘치지 않으면 그대로", () => {
    const d = page();
    expect(fitPage(d, "ruled")).toBe(d);
  });
});

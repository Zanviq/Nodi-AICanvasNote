import { describe, expect, it } from "vitest";
import { DoubleTapDetector, isTap, type TapSample, type TapTarget } from "./gesture";

const word: TapTarget = { kind: "word", id: "w1" };
const none: TapTarget = { kind: "none" };
let n = 0;
function tap(tDown: number, mmX: number, mmY: number, target: TapTarget, over: Partial<TapSample> = {}): TapSample {
  return { id: `tap${++n}`, x: mmX * 4, y: mmY * 4, mmX, mmY, tDown, tUp: tDown + 60, pointerType: "pen", tool: "pen", target, ...over };
}
const det = () => {
  const d = new DoubleTapDetector({ enabled: true, allowMouse: false, sensitivity: 1 });
  d.lastInkEnd = -10000;
  return d;
};

describe("두 번 톡 판정 (G1–G7)", () => {
  it("짧고 거의 안 움직인 획만 톡이다", () => {
    expect(isTap(120, 0.5)).toBe(true);
    expect(isTap(250, 0.5)).toBe(false);
    expect(isTap(120, 2)).toBe(false);
  });

  it("글자 위 같은 자리 두 번 톡은 확인 시간 뒤 질문이 된다", () => {
    const d = det();
    expect(d.onTap(tap(0, 10, 10, word))).toEqual([]);
    expect(d.onTap(tap(200, 10.5, 10.2, word))).toEqual([]);
    expect(d.onTick(300)).toEqual([]);
    const ev = d.onTick(260 + 250);
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe("gesture");
  });

  it("글자 사이에 찍은 쌍점은 필기로 남는다 (G5)", () => {
    const d = det();
    d.onTap(tap(0, 10, 10, none));
    const ev = d.onTap(tap(150, 10, 11.5, none));
    expect(ev[0]).toMatchObject({ type: "commit", reason: "G5" });
    expect(d.onTick(1000)[0]).toMatchObject({ type: "commit" });
  });

  it("말줄임표처럼 세 번 찍으면 필기다 (G6)", () => {
    const d = det();
    d.onTap(tap(0, 10, 10, word));
    d.onTap(tap(150, 11, 10, word));
    const ev = d.onTap(tap(300, 12, 10, word));
    expect(ev[0]).toMatchObject({ type: "commit", reason: "G6" });
    expect(ev[0].type === "commit" && ev[0].taps).toHaveLength(3);
  });

  it("한 번만 톡 하면 시간이 지나 점으로 확정된다", () => {
    const d = det();
    d.onTap(tap(0, 10, 10, word));
    const ev = d.onTick(60 + 301 + 1);
    expect(ev[0]).toMatchObject({ type: "commit", reason: "G3" });
  });

  it("너무 늦은 두 번째 톡은 질문이 아니다 (G3)", () => {
    const d = det();
    d.onTap(tap(0, 10, 10, word));
    const ev = d.onTap(tap(500, 10, 10, word));
    expect(ev[0]).toMatchObject({ type: "commit", reason: "G3" });
  });

  it("멀리 떨어진 두 번째 톡은 질문이 아니다 (G4)", () => {
    const d = det();
    d.onTap(tap(0, 10, 10, word));
    expect(d.onTap(tap(150, 16, 10, word))[0]).toMatchObject({ reason: "G4" });
  });

  it("쓰는 흐름 바로 뒤의 점은 질문이 아니다 (G7)", () => {
    const d = det();
    d.onInkEnd(1000);
    d.onTap(tap(1080, 10, 10, word));
    expect(d.onTap(tap(1200, 10, 10, word))[0]).toMatchObject({ reason: "G7" });
  });

  it("손가락·지우개·꺼짐에서는 판정하지 않는다 (G1, G2)", () => {
    const d = det();
    expect(d.onTap(tap(0, 10, 10, word, { pointerType: "touch" }))[0]).toMatchObject({ reason: "G1" });
    expect(d.onTap(tap(0, 10, 10, word, { tool: "eraser" }))[0]).toMatchObject({ reason: "G2" });
    d.cfg = { ...d.cfg, enabled: false };
    expect(d.onTap(tap(0, 10, 10, word))[0]).toMatchObject({ reason: "off" });
  });

  it("두 톡 뒤 곧바로 필기가 시작되면 두 점은 필기다", () => {
    const d = det();
    d.onTap(tap(0, 10, 10, word));
    d.onTap(tap(150, 10, 10, word));
    expect(d.onInkStart()[0]).toMatchObject({ type: "commit" });
  });
});

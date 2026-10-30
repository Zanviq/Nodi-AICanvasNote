// 두 번 톡 판정 (인식 설계 §3.3, D-010). 시간을 인자로 받는 상태 기계라 시험할 수 있다.

export const T_TAP = 180;
export const D_MOVE_MM = 1.0;
export const T_GAP = 300;
export const D_PAIR_MM = 3.0;
export const T_CONFIRM = 250;
export const T_BURST = 150;

export type Sensitivity = 0 | 1 | 2;
export const SENSITIVITY: Record<Sensitivity, { tGap: number; dPairMm: number }> = {
  0: { tGap: 250, dPairMm: 2 },
  1: { tGap: T_GAP, dPairMm: D_PAIR_MM },
  2: { tGap: 400, dPairMm: 4 },
};

export type TapTarget =
  | { kind: "word"; id: string }
  | { kind: "answer"; id: string }
  | { kind: "slot"; id: string }
  | { kind: "none" };

export interface TapSample {
  id: string;
  /** 쪽 좌표 (pu) */
  x: number;
  y: number;
  /** 화면 좌표 (mm) */
  mmX: number;
  mmY: number;
  tDown: number;
  tUp: number;
  pointerType: string;
  tool: string;
  target: TapTarget;
}

export function isTap(durationMs: number, moveMm: number): boolean {
  return durationMs <= T_TAP && moveMm <= D_MOVE_MM;
}

export interface DetectorConfig {
  enabled: boolean;
  allowMouse: boolean;
  sensitivity: Sensitivity;
}

export type RejectReason = "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "off";

export type DetectorEvent =
  | { type: "commit"; taps: TapSample[]; reason?: RejectReason }
  | { type: "gesture"; first: TapSample; second: TapSample; target: TapTarget };

function sameTarget(a: TapTarget, b: TapTarget): boolean {
  if (a.kind === "none" || b.kind === "none") return false;
  return a.kind === b.kind && a.id === b.id;
}

export function eligible(tap: TapSample, cfg: DetectorConfig): RejectReason | null {
  if (!cfg.enabled) return "off";
  if (!(tap.pointerType === "pen" || (tap.pointerType === "mouse" && cfg.allowMouse))) return "G1";
  if (tap.tool !== "pen" && tap.tool !== "pencil") return "G2";
  return null;
}

/** 두 톡이 질문 제스처 조건 G3–G5, G7을 만족하는지 */
export function checkPair(first: TapSample, second: TapSample, lastInkEnd: number, cfg: DetectorConfig): RejectReason | null {
  const s = SENSITIVITY[cfg.sensitivity];
  if (second.tDown - first.tUp > s.tGap) return "G3";
  if (Math.hypot(second.mmX - first.mmX, second.mmY - first.mmY) > s.dPairMm) return "G4";
  if (!sameTarget(first.target, second.target)) return "G5";
  if (first.tDown - lastInkEnd < T_BURST) return "G7";
  return null;
}

export class DoubleTapDetector {
  private pending: TapSample[] = [];
  /** 톡이 아닌 마지막 필기 획이 끝난 시각 */
  lastInkEnd = -Infinity;

  constructor(public cfg: DetectorConfig) {}

  get pendingTaps(): readonly TapSample[] {
    return this.pending;
  }

  onTap(tap: TapSample): DetectorEvent[] {
    const out: DetectorEvent[] = [];
    const s = SENSITIVITY[this.cfg.sensitivity];
    if (this.pending.length === 2) {
      const second = this.pending[1];
      const near = Math.hypot(tap.mmX - second.mmX, tap.mmY - second.mmY) <= s.dPairMm;
      if (tap.tDown - second.tUp <= s.tGap && near) {
        // 세 번째 톡: 말줄임표처럼 필기로 본다 (G6)
        out.push({ type: "commit", taps: [...this.pending, tap], reason: "G6" });
        this.pending = [];
        return out;
      }
      out.push(...this.flushPair());
    }
    if (this.pending.length === 1) {
      const first = this.pending[0];
      const why = eligible(tap, this.cfg) ?? checkPair(first, tap, this.lastInkEnd, this.cfg);
      if (!why) {
        this.pending = [first, tap];
        return out;
      }
      out.push({ type: "commit", taps: [first], reason: why });
      this.pending = [];
    }
    const why = eligible(tap, this.cfg);
    if (why) out.push({ type: "commit", taps: [tap], reason: why });
    else this.pending = [tap];
    return out;
  }

  /** 톡이 아닌 획이 시작됐다: 기다리던 톡은 모두 필기 */
  onInkStart(): DetectorEvent[] {
    if (!this.pending.length) return [];
    const taps = this.pending;
    this.pending = [];
    return [{ type: "commit", taps, reason: taps.length === 2 ? "G6" : "G3" }];
  }

  onInkEnd(t: number): void {
    this.lastInkEnd = t;
  }

  /** 시간이 지나 확정할 것이 있으면 내보낸다 */
  onTick(now: number): DetectorEvent[] {
    const s = SENSITIVITY[this.cfg.sensitivity];
    if (this.pending.length === 2 && now - this.pending[1].tUp >= T_CONFIRM) return this.flushPair();
    if (this.pending.length === 1 && now - this.pending[0].tUp > s.tGap) {
      const taps = this.pending;
      this.pending = [];
      return [{ type: "commit", taps, reason: "G3" }];
    }
    return [];
  }

  /** 다음 확인 시각 (없으면 null) */
  nextDeadline(): number | null {
    const s = SENSITIVITY[this.cfg.sensitivity];
    if (this.pending.length === 2) return this.pending[1].tUp + T_CONFIRM;
    if (this.pending.length === 1) return this.pending[0].tUp + s.tGap + 1;
    return null;
  }

  private flushPair(): DetectorEvent[] {
    const [first, second] = this.pending;
    this.pending = [];
    return [{ type: "gesture", first, second, target: first.target }];
  }

  reset(): DetectorEvent[] {
    if (!this.pending.length) return [];
    const taps = this.pending;
    this.pending = [];
    return [{ type: "commit", taps }];
  }
}

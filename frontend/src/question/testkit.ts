// 시험용 가짜 손글씨: 글자 하나를 지그재그 획 하나로, 문장부호는 작은 획으로 만든다.
import { paperMetrics } from "../design/tokens";
import type { Stroke } from "../model/types";

let seq = 0;
function stroke(points: [number, number][], t0: number): Stroke {
  const pts: number[] = [];
  points.forEach(([x, y], i) => pts.push(x, y, 0.5, i * 8));
  return { id: `t${++seq}`, tool: "pen", color: "blueblack", size: 1, pts, t0, t1: t0 + 100 };
}

function zigzag(x: number, y: number, w: number, h: number): [number, number][] {
  const corners: [number, number][] = [[x, y], [x + w, y + h * 0.33], [x, y + h * 0.66], [x + w, y + h]];
  const out: [number, number][] = [];
  for (let i = 1; i < corners.length; i++) {
    const [ax, ay] = corners[i - 1], [bx, by] = corners[i];
    for (let k = 0; k < 8; k++) out.push([ax + ((bx - ax) * k) / 8, ay + ((by - ay) * k) / 8]);
  }
  out.push(corners[corners.length - 1]);
  return out;
}

function circle(cx: number, cy: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k <= 24; k++) out.push([cx + r * Math.cos((k / 24) * Math.PI * 2), cy + r * Math.sin((k / 24) * Math.PI * 2)]);
  return out;
}

export interface WriteOptions {
  x?: number;
  row: number;
  t0: number;
  h?: number;
  charW?: number;
  charGap?: number;
  wordGap?: number;
  perChar?: number;
  paper?: "ruled" | "grid" | "plain";
}

/** 한 줄을 쓴다. 반환: 획 목록과 다음 글자 시각 */
export function writeLine(text: string, o: WriteOptions): { strokes: Stroke[]; t: number; endX: number } {
  const { row, head } = paperMetrics(o.paper ?? "ruled");
  const h = o.h ?? 18, w = o.charW ?? 16, cg = o.charGap ?? 3, wg = o.wordGap ?? 12, per = o.perChar ?? 150;
  const top = head + o.row * row + (row - h) / 2 - 2;
  let x = o.x ?? 112, t = o.t0;
  const strokes: Stroke[] = [];
  for (const ch of text) {
    if (ch === " ") {
      x += wg - cg;
      continue;
    }
    if (ch === "." || ch === "·") {
      const y = ch === "." ? top + h - 2 : top + h / 2;
      strokes.push(stroke([[x, y], [x + 1.5, y + 1]], t));
      x += 4 + cg;
    } else if (ch === ",") {
      strokes.push(stroke([[x, top + h - 3], [x - 1, top + h + 2]], t));
      x += 4 + cg;
    } else if (ch === ":") {
      strokes.push(stroke([[x, top + 5], [x + 1.5, top + 6]], t));
      strokes.push(stroke([[x, top + h - 4], [x + 1.5, top + h - 3]], t + 40));
      x += 4 + cg;
    } else if (ch === "?") {
      strokes.push(stroke([[x, top + 3], [x + 6, top], [x + 9, top + 5], [x + 5, top + 10], [x + 5, top + 13]], t));
      strokes.push(stroke([[x + 5, top + h - 2], [x + 6, top + h - 1]], t + 40));
      x += 10 + cg;
    } else if (/[①-⑳]/.test(ch)) {
      strokes.push(stroke(circle(x + h / 2, top + h / 2, h / 2), t));
      strokes.push(stroke([[x + h / 2, top + 4], [x + h / 2, top + h - 4]], t + 60));
      x += h + cg;
    } else {
      strokes.push(stroke(zigzag(x, top, w, h), t));
      x += w + cg;
    }
    t += per;
  }
  return { strokes, t, endX: x };
}

export function center(s: Stroke): [number, number] {
  let x = 0, y = 0, n = 0;
  for (let i = 0; i < s.pts.length; i += 4) {
    x += s.pts[i];
    y += s.pts[i + 1];
    n++;
  }
  return [x / n, y / n];
}

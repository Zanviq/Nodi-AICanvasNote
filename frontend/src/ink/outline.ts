// 획 윤곽: perfect-freehand로 압력에 따라 굵기가 바뀌는 다각형을 만들고 Path2D로 캐시한다.
import { getStroke, type StrokeOptions } from "perfect-freehand";
import { PEN_SIZES } from "../design/tokens";
import { STRIDE } from "../model/stroke";
import type { InkTool, Stroke } from "../model/types";

export function strokeOptions(tool: InkTool, size: 0 | 1 | 2, simulate: boolean, last: boolean): StrokeOptions {
  const base = PEN_SIZES[tool][size];
  if (tool === "pencil") return { size: base, thinning: 0.35, smoothing: 0.55, streamline: 0.35, simulatePressure: simulate, last };
  if (tool === "highlighter") return { size: base, thinning: 0, smoothing: 0.6, streamline: 0.5, simulatePressure: false, last, start: { cap: false }, end: { cap: false } };
  return { size: base, thinning: 0.62, smoothing: 0.5, streamline: 0.32, simulatePressure: simulate, last };
}

export function toInput(pts: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < pts.length; i += STRIDE) out.push([pts[i], pts[i + 1], pts[i + 2]]);
  return out;
}

export function outlinePath(points: number[][]): Path2D {
  const path = new Path2D();
  if (!points.length) return path;
  if (points.length < 3) {
    const [x, y] = points[0];
    path.arc(x, y, 1, 0, Math.PI * 2);
    return path;
  }
  path.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

/** 압력값이 모두 같으면(마우스) 속도로 압력을 흉내 낸다 */
export function needsSimulation(pts: number[]): boolean {
  const p0 = pts[2];
  for (let i = 2; i < pts.length; i += STRIDE) if (Math.abs(pts[i] - p0) > 0.01) return false;
  return p0 === 0.5 || p0 === 0 || p0 === 1;
}

const cache = new WeakMap<Stroke, Path2D>();

export function strokePath(s: Stroke): Path2D {
  const hit = cache.get(s);
  if (hit) return hit;
  let path: Path2D;
  if (s.pts.length <= STRIDE) {
    path = new Path2D();
    const r = PEN_SIZES[s.tool][s.size] * 0.55;
    path.arc(s.pts[0], s.pts[1], r, 0, Math.PI * 2);
  } else {
    path = outlinePath(getStroke(toInput(s.pts), strokeOptions(s.tool, s.size, needsSimulation(s.pts), true)));
  }
  cache.set(s, path);
  return path;
}

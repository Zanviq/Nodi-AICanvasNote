// 획 기하 도우미 (DOM 없음)
import type { Rect, Stroke } from "./types";

export const STRIDE = 4;

export interface StrokeGeom {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** 몸통 구간: 점 y값의 15–85 백분위 */
  coreTop: number;
  coreBottom: number;
  length: number;
  t0: number;
  t1: number;
  closed: boolean;
}

const geomCache = new WeakMap<Stroke, StrokeGeom>();

export function strokeGeom(s: Stroke): StrokeGeom {
  const hit = geomCache.get(s);
  if (hit) return hit;
  const p = s.pts;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, length = 0;
  const ys: number[] = [];
  for (let i = 0; i < p.length; i += STRIDE) {
    const x = p[i], y = p[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    ys.push(y);
    if (i >= STRIDE) length += Math.hypot(x - p[i - STRIDE], y - p[i - STRIDE + 1]);
  }
  ys.sort((a, b) => a - b);
  const q = (f: number) => ys[Math.min(ys.length - 1, Math.max(0, Math.round(f * (ys.length - 1))))];
  const n = p.length / STRIDE;
  const closeDist = n > 1 ? Math.hypot(p[0] - p[p.length - STRIDE], p[1] - p[p.length - STRIDE + 1]) : 0;
  const g: StrokeGeom = {
    id: s.id,
    minX, minY, maxX, maxY,
    coreTop: q(0.15),
    coreBottom: q(0.85),
    length,
    t0: s.t0,
    t1: s.t1,
    closed: length > 0 && closeDist < 0.2 * length,
  };
  geomCache.set(s, g);
  return g;
}

export function strokeRect(s: Stroke): Rect {
  const g = strokeGeom(s);
  return { x: g.minX, y: g.minY, w: g.maxX - g.minX, h: g.maxY - g.minY };
}

export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 점에서 획 경로까지 가장 가까운 거리 */
export function distToStroke(s: Stroke, x: number, y: number): number {
  const p = s.pts;
  if (p.length < STRIDE) return Infinity;
  if (p.length === STRIDE) return Math.hypot(x - p[0], y - p[1]);
  let best = Infinity;
  for (let i = STRIDE; i < p.length; i += STRIDE) {
    const d = distToSegment(x, y, p[i - STRIDE], p[i - STRIDE + 1], p[i], p[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function translateStroke(s: Stroke, dx: number, dy: number): Stroke {
  const pts = s.pts.slice();
  for (let i = 0; i < pts.length; i += STRIDE) {
    pts[i] += dx;
    pts[i + 1] += dy;
  }
  return { ...s, pts };
}

export function pointInPolygon(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const v = values.slice().sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

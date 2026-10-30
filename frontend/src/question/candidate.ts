// 1단계: 후보 줄 덩어리 (인식 설계 §3.6). 순수 함수.
import { distToStroke } from "../model/stroke";
import type { Stroke } from "../model/types";
import { boxOf, columnRight, type Cluster, type InkLine, type Layout, type Segment, type Word } from "./geometry";

export const THETA_C = 0.5;
export const MAX_UP = 3;
export const MAX_DOWN = 3;
export const C_WEIGHTS = {
  full: 1.0,
  align: 0.6,
  time: 0.5,
  bullet: -1.5,
  indent: -1.0,
  vgap: -2.0,
  endmark: -0.8,
  /** 윗줄이 목록 기호로 시작하고 아랫줄이 그 기호 자리에 맞춰 시작하면 새 항목이다 */
  itemStart: -1.0,
} as const;

export type ContinuationFeature = keyof typeof C_WEIGHTS;

export interface BlockLine {
  line: InkLine;
  words: Word[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  t0: number;
  t1: number;
}

export interface Block {
  lines: BlockLine[];
  anchor: Word;
  anchorLine: number;
  xR: number;
  /** 덩어리 안 이웃 줄 사이 이어짐 점수 C(u, d) */
  continuations: number[];
}

/** 점 위(또는 0.3h 안)에 있는 단어 */
export function findWordAt(layout: Layout, x: number, y: number, slack = 1): Word | null {
  const maxD = Math.max(0.3 * layout.h, 3) * slack;
  let best: { w: Word; d: number } | null = null;
  for (const [id, w] of layout.wordOfStroke) {
    if (x < w.minX - maxD || x > w.maxX + maxD || y < w.minY - maxD || y > w.maxY + maxD) continue;
    const s = layout.strokes.get(id) as Stroke;
    const d = distToStroke(s, x, y);
    if (d <= maxD && (!best || d < best.d)) best = { w, d };
  }
  return best?.w ?? null;
}

function lineSegments(line: InkLine, colL: number, colR: number): Segment[] {
  return line.segments.filter((s) => {
    const o = Math.min(s.maxX, colR) - Math.max(s.minX, colL);
    return o >= 0.3 * Math.max(1, s.maxX - s.minX);
  });
}

function toBlockLine(line: InkLine, segs: Segment[]): BlockLine {
  const words = segs.flatMap((s) => s.words).sort((a, b) => a.minX - b.minX);
  const b = boxOf(segs);
  return { line, words, ...b, t0: Math.min(...segs.map((s) => s.t0)), t1: Math.max(...segs.map((s) => s.t1)) };
}

function firstCluster(bl: BlockLine): Cluster | undefined {
  return bl.words[0]?.clusters[0];
}

/** 줄 머리의 목록 기호: 작은 점·줄표, 동그라미 숫자, 숫자+점 */
export function looksLikeBullet(layout: Layout, bl: BlockLine): boolean {
  const h = layout.h;
  const w0 = bl.words[0];
  const c = firstCluster(bl);
  if (!w0 || !c) return false;
  const cw = c.maxX - c.minX, ch = c.maxY - c.minY;
  if (w0.clusters.length === 1 && bl.words.length > 1 && cw <= 0.6 * h && ch <= 0.6 * h) return true;
  if (cw >= 0.8 * h && ch >= 0.8 * h && cw / ch > 0.7 && cw / ch < 1.4) {
    const closed = c.strokeIds.some((id) => {
      const s = layout.strokes.get(id);
      if (!s || s.pts.length < 12) return false;
      const n = s.pts.length;
      const gap = Math.hypot(s.pts[0] - s.pts[n - 4], s.pts[1] - s.pts[n - 3]);
      return gap < 0.35 * Math.max(cw, ch);
    });
    if (closed && c.strokeIds.length >= 2) return true;
  }
  if (w0.clusters.length <= 3 && w0.maxX - w0.minX <= 1.6 * h && bl.words.length > 1) {
    const last = w0.clusters[w0.clusters.length - 1];
    if (w0.clusters.length >= 2 && last.maxX - last.minX <= 0.35 * h && last.maxY - last.minY <= 0.35 * h) return true;
  }
  return false;
}

/** 줄 끝의 마침표·물음표 모양 */
export function looksLikeEndMark(layout: Layout, bl: BlockLine): boolean {
  const h = layout.h;
  const lw = bl.words[bl.words.length - 1];
  const c = lw?.clusters[lw.clusters.length - 1];
  if (!c) return false;
  const cw = c.maxX - c.minX, ch = c.maxY - c.minY;
  if (cw <= 0.4 * h && ch <= 0.4 * h && c.minY > (bl.line.coreTop + bl.line.coreBottom) / 2) return true;
  if (cw <= 0.6 * h && c.strokeIds.length >= 2) {
    const parts = c.strokeIds.map((id) => layout.strokes.get(id)).filter(Boolean) as Stroke[];
    const boxes = parts.map((s) => {
      let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
      for (let i = 0; i < s.pts.length; i += 4) {
        x0 = Math.min(x0, s.pts[i]); x1 = Math.max(x1, s.pts[i]);
        y0 = Math.min(y0, s.pts[i + 1]); y1 = Math.max(y1, s.pts[i + 1]);
      }
      return { x0, x1, y0, y1 };
    });
    const dot = boxes.find((b) => b.x1 - b.x0 <= 0.3 * h && b.y1 - b.y0 <= 0.3 * h);
    const tall = boxes.find((b) => b !== dot && b.y1 - b.y0 >= 0.5 * h);
    if (dot && tall && dot.y0 >= tall.y1 - 0.1 * h) return true;
  }
  return false;
}

export function continuationFeatures(layout: Layout, u: BlockLine, d: BlockLine, xR: number): Record<ContinuationFeature, number> {
  const h = layout.h;
  const vgap =
    layout.paper === "plain"
      ? (d.line.coreTop + d.line.coreBottom) / 2 - (u.line.coreTop + u.line.coreBottom) / 2 > 1.6 * layout.lineSpacing
      : d.line.row - u.line.row > 1;
  const dt = d.t0 - u.t1;
  return {
    full: u.maxX >= xR - 2 * h ? 1 : 0,
    align: Math.abs(d.minX - u.minX) <= 1 * h ? 1 : 0,
    time: dt <= 5000 && dt >= -1000 ? 1 : 0,
    bullet: looksLikeBullet(layout, d) ? 1 : 0,
    indent: d.minX - u.minX > 1.5 * h ? 1 : 0,
    vgap: vgap ? 1 : 0,
    endmark: looksLikeEndMark(layout, u) ? 1 : 0,
    itemStart: looksLikeBullet(layout, u) && Math.abs(d.minX - u.minX) <= 1 * h ? 1 : 0,
  };
}

export function continuationScore(f: Record<ContinuationFeature, number>): number {
  let s = 0;
  for (const k of Object.keys(C_WEIGHTS) as ContinuationFeature[]) s += C_WEIGHTS[k] * f[k];
  return s;
}

/** 앵커 단어에서 위아래로 이어지는 줄을 붙인다 */
export function buildBlock(layout: Layout, anchor: Word): Block {
  const lines = layout.lines;
  const li = anchor.lineIndex;
  const line = lines[li];
  const seg = line.segments.find((s) => s.words.includes(anchor)) as Segment;
  const segIdx = line.segments.indexOf(seg);
  const next = line.segments[segIdx + 1];
  const xR = next ? next.minX - layout.tauW : columnRight(layout, li);
  const colL = seg.minX - 2 * layout.h;
  const colR = xR;

  const center = toBlockLine(line, [seg]);
  const up: BlockLine[] = [];
  const upC: number[] = [];
  let cur = center;
  for (let i = li - 1, n = 0; i >= 0 && n < MAX_UP; i--, n++) {
    const segs = lineSegments(lines[i], colL, colR);
    if (!segs.length) break;
    const cand = toBlockLine(lines[i], segs);
    const c = continuationScore(continuationFeatures(layout, cand, cur, xR));
    if (c < THETA_C) break;
    up.unshift(cand);
    upC.unshift(c);
    cur = cand;
  }
  const down: BlockLine[] = [];
  const downC: number[] = [];
  cur = center;
  for (let i = li + 1, n = 0; i < lines.length && n < MAX_DOWN; i++, n++) {
    const segs = lineSegments(lines[i], colL, colR);
    if (!segs.length) break;
    const cand = toBlockLine(lines[i], segs);
    const c = continuationScore(continuationFeatures(layout, cur, cand, xR));
    if (c < THETA_C) break;
    down.push(cand);
    downC.push(c);
    cur = cand;
  }
  return {
    lines: [...up, center, ...down],
    anchor,
    anchorLine: up.length,
    xR,
    continuations: [...upC, ...downC],
  };
}

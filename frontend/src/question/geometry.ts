// 획 전처리와 줄 구성 (인식 설계 §3.4–3.5). 순수 함수.
import { PAGE, paperMetrics } from "../design/tokens";
import { median, strokeGeom, type StrokeGeom } from "../model/stroke";
import type { PaperKind, Stroke } from "../model/types";

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Cluster extends Box {
  strokeIds: string[];
  t0: number;
  t1: number;
}

export interface Word extends Box {
  id: string;
  lineIndex: number;
  clusters: Cluster[];
  strokeIds: string[];
  t0: number;
  t1: number;
}

export interface Segment extends Box {
  words: Word[];
  t0: number;
  t1: number;
}

export interface InkLine extends Box {
  index: number;
  /** 괘선·모눈 종이의 줄 칸 번호. 무지는 추정 줄 번호. */
  row: number;
  coreTop: number;
  coreBottom: number;
  segments: Segment[];
  t0: number;
  t1: number;
}

export interface Layout {
  paper: PaperKind;
  /** 글자 높이 h */
  h: number;
  /** 줄 간격 p (무지는 쪽 줄 간격) */
  row: number;
  head: number;
  /** 단어 간격 τw, 덩어리 간격 τs */
  tauW: number;
  tauS: number;
  /** 무지에서 줄 사이 간격 중앙값 */
  lineSpacing: number;
  lines: InkLine[];
  wordOfStroke: Map<string, Word>;
  lineOfStroke: Map<string, number>;
  drawings: Set<string>;
  strokes: Map<string, Stroke>;
}

export function boxOf(geoms: { minX: number; minY: number; maxX: number; maxY: number }[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const g of geoms) {
    minX = Math.min(minX, g.minX);
    minY = Math.min(minY, g.minY);
    maxX = Math.max(maxX, g.maxX);
    maxY = Math.max(maxY, g.maxY);
  }
  return { minX, minY, maxX, maxY };
}

/** 글씨로 볼 획만 남긴다: 형광펜, 답 주석, 그림 획 제외 */
function splitDrawings(geoms: StrokeGeom[], h0: number): { text: StrokeGeom[]; drawings: Set<string> } {
  const drawings = new Set<string>();
  for (const g of geoms) {
    const height = g.coreBottom - g.coreTop;
    const fullH = g.maxY - g.minY;
    if (height > 2.5 * h0 || fullH > 3.2 * h0) drawings.add(g.id);
    else if (g.closed && g.length > 8 * h0 && fullH > 1.2 * h0) drawings.add(g.id);
    else if (!g.closed && g.length > 10 * h0 && fullH > 1.4 * h0) drawings.add(g.id);
  }
  // 닫힌 그림 안쪽 획도 그림으로 본다 (엽록체 안의 그라나 같은 것)
  const closedDrawings = geoms.filter((g) => drawings.has(g.id) && g.closed);
  for (const g of geoms) {
    if (drawings.has(g.id)) continue;
    const cx = (g.minX + g.maxX) / 2, cy = (g.minY + g.maxY) / 2;
    if (closedDrawings.some((d) => cx > d.minX && cx < d.maxX && cy > d.minY && cy < d.maxY)) drawings.add(g.id);
  }
  return { text: geoms.filter((g) => !drawings.has(g.id)), drawings };
}

function estimateInitialH(geoms: StrokeGeom[], row: number): number {
  const hs = geoms.map((g) => g.maxY - g.minY).filter((v) => v > 1);
  if (hs.length < 5) return 0.55 * row;
  return clamp(median(hs) * 1.4, 0.3 * row, 1.2 * row);
}

/** 괘선·모눈: 몸통이 가장 많이 걸친 줄 칸 */
function rowOf(g: StrokeGeom, head: number, row: number): number {
  const top = g.coreTop, bottom = Math.max(g.coreBottom, g.coreTop + 0.01);
  const r0 = Math.floor((top - head) / row), r1 = Math.floor((bottom - head) / row);
  if (r0 === r1) return r0;
  let best = r0, bestOverlap = -1;
  for (let r = r0; r <= r1; r++) {
    const a = head + r * row, b = a + row;
    const o = Math.min(b, bottom) - Math.max(a, top);
    if (o > bestOverlap) {
      bestOverlap = o;
      best = r;
    }
  }
  return best;
}

interface PlainLine {
  ids: StrokeGeom[];
  slope: number;
  icpt: number;
}

function fitLine(l: PlainLine, h: number) {
  const pts = l.ids.map((g) => [(g.minX + g.maxX) / 2, (g.coreTop + g.coreBottom) / 2]);
  const xs = pts.map((p) => p[0]);
  const spread = Math.max(...xs) - Math.min(...xs);
  if (pts.length >= 3 && spread > 2 * h) {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    let num = 0, den = 0;
    for (const [x, y] of pts) {
      num += (x - mx) * (y - my);
      den += (x - mx) * (x - mx);
    }
    l.slope = clamp(den ? num / den : 0, -0.15, 0.15);
    l.icpt = my - l.slope * mx;
  } else {
    l.slope = 0;
    l.icpt = median(pts.map((p) => p[1]));
  }
}

/** 무지: 몸통 중심을 기준선에 붙여 줄을 만든다. 애매하면 쓴 시간으로 정한다. */
function clusterPlainLines(geoms: StrokeGeom[], h: number): StrokeGeom[][] {
  const sorted = geoms.slice().sort((a, b) => a.t0 - b.t0);
  const lines: PlainLine[] = [];
  for (const g of sorted) {
    const cx = (g.minX + g.maxX) / 2, cy = (g.coreTop + g.coreBottom) / 2;
    const near = lines
      .map((l) => ({ l, d: Math.abs(cy - (l.slope * cx + l.icpt)) }))
      .filter((c) => c.d <= 0.6 * h)
      .sort((a, b) => a.d - b.d);
    let target: PlainLine | undefined = near[0]?.l;
    if (near.length > 1) {
      const recent = near.find((c) => c.l.ids.some((o) => Math.abs(g.t0 - o.t1) < 1500 || Math.abs(o.t0 - g.t1) < 1500));
      if (recent) target = recent.l;
    }
    if (target) {
      target.ids.push(g);
      fitLine(target, h);
    } else {
      const l: PlainLine = { ids: [g], slope: 0, icpt: cy };
      lines.push(l);
    }
  }
  // 세로로 많이 겹치고 가로로 겹치지 않는 줄은 합친다
  const groups = lines.map((l) => l.ids);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = boxCore(groups[i]), b = boxCore(groups[j]);
        const vo = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const minH = Math.min(a.bottom - a.top, b.bottom - b.top);
        const xOverlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        if (minH > 0 && vo / minH > 0.5 && xOverlap < 0.5 * h) {
          groups[i] = groups[i].concat(groups[j]);
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return groups;
}

function boxCore(gs: StrokeGeom[]) {
  return {
    top: median(gs.map((g) => g.coreTop)),
    bottom: median(gs.map((g) => g.coreBottom)),
    minX: Math.min(...gs.map((g) => g.minX)),
    maxX: Math.max(...gs.map((g) => g.maxX)),
  };
}

/** 가로로 겹치는 획을 글자 묶음으로 */
function makeClusters(gs: StrokeGeom[], h: number): Cluster[] {
  const sorted = gs.slice().sort((a, b) => a.minX - b.minX);
  const out: Cluster[] = [];
  for (const g of sorted) {
    const last = out[out.length - 1];
    if (last && g.minX <= last.maxX + 0.05 * h) {
      last.strokeIds.push(g.id);
      last.maxX = Math.max(last.maxX, g.maxX);
      last.minY = Math.min(last.minY, g.minY);
      last.maxY = Math.max(last.maxY, g.maxY);
      last.t0 = Math.min(last.t0, g.t0);
      last.t1 = Math.max(last.t1, g.t1);
    } else {
      out.push({ strokeIds: [g.id], minX: g.minX, maxX: g.maxX, minY: g.minY, maxY: g.maxY, t0: g.t0, t1: g.t1 });
    }
  }
  return out;
}

export interface LayoutOptions {
  /** 이 획들만 쓴다 (올가미, 이어 질문 칸) */
  only?: Set<string>;
}

export function buildLayout(all: Stroke[], paper: PaperKind, opts: LayoutOptions = {}): Layout {
  const { row, head } = paperMetrics(paper);
  const strokes = new Map<string, Stroke>();
  const pool: StrokeGeom[] = [];
  for (const s of all) {
    if (s.tool === "highlighter") continue;
    if (opts.only ? !opts.only.has(s.id) : s.answerId || s.slotId) continue;
    if (s.pts.length < 4) continue;
    strokes.set(s.id, s);
    pool.push(strokeGeom(s));
  }
  const h0 = estimateInitialH(pool, row);
  const { text, drawings } = opts.only ? { text: pool, drawings: new Set<string>() } : splitDrawings(pool, h0);

  // 1. 줄 나누기
  let groups: { row: number; gs: StrokeGeom[] }[];
  if (paper === "plain") {
    groups = clusterPlainLines(text, h0).map((gs) => ({ row: 0, gs }));
    groups.sort((a, b) => boxCore(a.gs).top - boxCore(b.gs).top);
    groups.forEach((g) => (g.row = Math.floor((boxCore(g.gs).top + boxCore(g.gs).bottom) / 2 / row)));
  } else {
    const byRow = new Map<number, StrokeGeom[]>();
    for (const g of text) {
      const r = rowOf(g, head, row);
      const arr = byRow.get(r);
      if (arr) arr.push(g);
      else byRow.set(r, [g]);
    }
    groups = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([r, gs]) => ({ row: r, gs }));
  }

  // 2. 글자 높이 h 다시 추정 (글자 묶음 높이)
  const clusterLists = groups.map((g) => makeClusters(g.gs, h0));
  const clusterHeights = clusterLists.flat().map((c) => c.maxY - c.minY).filter((v) => v > 1);
  const h = clusterHeights.length >= 3 ? clamp(median(clusterHeights), 0.25 * row, 1.3 * row) : h0;

  // 3. 단어·덩어리 간격
  const gaps: number[] = [];
  for (const cl of clusterLists) for (let i = 1; i < cl.length; i++) {
    const gap = cl[i].minX - cl[i - 1].maxX;
    if (gap > 0) gaps.push(gap);
  }
  const g = gaps.length ? median(gaps) : 0.15 * h;
  const tauW = Math.max(0.4 * h, 1.8 * g);
  const tauS = Math.max(3 * h, 3 * tauW);

  const wordOfStroke = new Map<string, Word>();
  const lineOfStroke = new Map<string, number>();
  const lines: InkLine[] = groups.map((grp, li) => {
    const clusters = clusterLists[li];
    const segments: Segment[] = [];
    let words: Word[] = [];
    let cur: Cluster[] = [];
    const flushWord = () => {
      if (!cur.length) return;
      const b = boxOf(cur);
      const ids = cur.flatMap((c) => c.strokeIds);
      const w: Word = {
        id: `w${li}_${words.length}_${segments.length}`,
        lineIndex: li,
        clusters: cur,
        strokeIds: ids,
        ...b,
        t0: Math.min(...cur.map((c) => c.t0)),
        t1: Math.max(...cur.map((c) => c.t1)),
      };
      words.push(w);
      cur = [];
    };
    const flushSeg = () => {
      flushWord();
      if (!words.length) return;
      segments.push({ words, ...boxOf(words), t0: Math.min(...words.map((w) => w.t0)), t1: Math.max(...words.map((w) => w.t1)) });
      words = [];
    };
    clusters.forEach((c, i) => {
      if (i > 0) {
        const gap = c.minX - clusters[i - 1].maxX;
        if (gap > tauS) flushSeg();
        else if (gap > tauW) flushWord();
      }
      cur.push(c);
    });
    flushSeg();
    for (const seg of segments) for (const w of seg.words) for (const id of w.strokeIds) {
      wordOfStroke.set(id, w);
      lineOfStroke.set(id, li);
    }
    const b = boxOf(grp.gs);
    return {
      index: li,
      row: grp.row,
      ...b,
      coreTop: median(grp.gs.map((x) => x.coreTop)),
      coreBottom: median(grp.gs.map((x) => x.coreBottom)),
      segments,
      t0: Math.min(...grp.gs.map((x) => x.t0)),
      t1: Math.max(...grp.gs.map((x) => x.t1)),
    };
  });

  const spacings: number[] = [];
  for (let i = 1; i < lines.length; i++) spacings.push((lines[i].coreTop + lines[i].coreBottom) / 2 - (lines[i - 1].coreTop + lines[i - 1].coreBottom) / 2);
  const lineSpacing = spacings.length ? median(spacings) : row;

  return { paper, h, row, head, tauW, tauS, lineSpacing, lines, wordOfStroke, lineOfStroke, drawings, strokes };
}

/** 줄 아래 경계 (답을 끼우는 선). 줄 칸에 맞춘다. */
export function lineBottomY(layout: Layout, line: InkLine): number {
  if (layout.paper !== "plain") return layout.head + (line.row + 1) * layout.row;
  const k = Math.ceil((line.maxY + 2 - layout.head) / layout.row);
  return layout.head + Math.max(0, k) * layout.row;
}

/** 본문 열의 오른쪽 끝 */
export function columnRight(layout: Layout, around: number): number {
  if (layout.paper === "ruled") return PAGE.rightX;
  const near = layout.lines.filter((l) => Math.abs(l.index - around) <= 10).map((l) => l.maxX).sort((a, b) => a - b);
  const p95 = near.length ? near[Math.min(near.length - 1, Math.floor(near.length * 0.95))] : PAGE.rightX;
  return Math.max(p95, Math.min(PAGE.rightX, p95 + layout.h));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

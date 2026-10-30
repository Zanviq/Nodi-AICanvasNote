// 인식 글자와 획 잇기 (인식 설계 §3.7). 순수 함수.
import type { Cluster, Word } from "./geometry";

export interface Token {
  text: string;
  /** 덩어리 안 줄 번호 */
  line: number;
  strokeIds: string[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  t0: number;
  t1: number;
}

type Unit = Pick<Cluster, "minX" | "maxX" | "minY" | "maxY" | "t0" | "t1" | "strokeIds">;

export function splitTokens(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * 한 줄의 인식 텍스트를 띄어쓰기로 나눠 그 줄의 획 묶음에 잇는다.
 * 토큰 수 = 단어 수면 1:1, 아니면 글자 수 비례로 단어(또는 글자 묶음)를 나눠 준다.
 */
export function alignLine(text: string, words: Word[], line: number): Token[] {
  const parts = splitTokens(text);
  if (!parts.length || !words.length) return [];
  const sorted = words.slice().sort((a, b) => a.minX - b.minX);
  const lineMinY = Math.min(...sorted.map((w) => w.minY));
  const lineMaxY = Math.max(...sorted.map((w) => w.maxY));

  if (parts.length === sorted.length) {
    return parts.map((t, i) => fromUnits(t, line, [sorted[i]], lineMinY, lineMaxY, sorted[i].minX, sorted[i].maxX));
  }

  // 토큰이 적으면 단어 단위로, 많으면 글자 묶음 단위로 나눈다
  const units: Unit[] = parts.length < sorted.length ? sorted : sorted.flatMap((w) => w.clusters);
  const x0 = units[0].minX;
  const x1 = Math.max(...units.map((u) => u.maxX));
  const span = Math.max(1, x1 - x0);
  const lens = parts.map((t) => [...t].length);
  const total = lens.reduce((a, b) => a + b, 0) + 0.5 * (parts.length - 1);
  const edges: [number, number][] = [];
  let acc = 0;
  for (let i = 0; i < parts.length; i++) {
    const a = acc / total;
    acc += lens[i];
    const b = acc / total;
    acc += 0.5;
    edges.push([x0 + a * span, x0 + b * span]);
  }
  const buckets: Unit[][] = parts.map(() => []);
  for (const u of units) {
    const c = (u.minX + u.maxX) / 2;
    let k = edges.findIndex(([a, b], i) => c >= a && (c < b || i === edges.length - 1));
    if (k < 0) k = c < edges[0][0] ? 0 : edges.length - 1;
    // 사이 공백에 떨어지면 가까운 쪽
    if (!(c >= edges[k][0] && c <= edges[k][1])) {
      let best = 0, bd = Infinity;
      edges.forEach(([a, b], i) => {
        const d = c < a ? a - c : c > b ? c - b : 0;
        if (d < bd) { bd = d; best = i; }
      });
      k = best;
    }
    buckets[k].push(u);
  }
  return parts.map((t, i) => fromUnits(t, line, buckets[i], lineMinY, lineMaxY, edges[i][0], edges[i][1]));
}

function fromUnits(text: string, line: number, units: Unit[], y0: number, y1: number, fx0: number, fx1: number): Token {
  if (!units.length) {
    return { text, line, strokeIds: [], minX: fx0, maxX: fx1, minY: y0, maxY: y1, t0: NaN, t1: NaN };
  }
  return {
    text,
    line,
    strokeIds: units.flatMap((u) => u.strokeIds),
    minX: Math.min(...units.map((u) => u.minX)),
    maxX: Math.max(...units.map((u) => u.maxX)),
    minY: Math.min(...units.map((u) => u.minY)),
    maxY: Math.max(...units.map((u) => u.maxY)),
    t0: Math.min(...units.map((u) => u.t0)),
    t1: Math.max(...units.map((u) => u.t1)),
  };
}

/** 획 목록이 빈 토큰의 시간은 이웃 토큰으로 채운다 */
export function fillTimes(tokens: Token[]): Token[] {
  return tokens.map((t, i) => {
    if (!Number.isNaN(t.t0)) return t;
    const prev = tokens.slice(0, i).reverse().find((x) => !Number.isNaN(x.t1));
    const next = tokens.slice(i + 1).find((x) => !Number.isNaN(x.t0));
    const t0 = prev ? prev.t1 : next ? next.t0 : 0;
    return { ...t, t0, t1: next ? next.t0 : t0 };
  });
}

/** 탭 위치가 들어 있거나 가장 가까운 토큰 */
export function tokenAt(tokens: Token[], x: number, y: number, strokeIds?: Set<string>): number {
  if (strokeIds) {
    const hit = tokens.findIndex((t) => t.strokeIds.some((id) => strokeIds.has(id)));
    if (hit >= 0) return hit;
  }
  let best = 0, bd = Infinity;
  tokens.forEach((t, i) => {
    const dx = x < t.minX ? t.minX - x : x > t.maxX ? x - t.maxX : 0;
    const dy = y < t.minY ? t.minY - y : y > t.maxY ? y - t.maxY : 0;
    const d = dx * dx + dy * dy * 4;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

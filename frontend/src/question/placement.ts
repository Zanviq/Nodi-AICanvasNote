// 답 자리 만들기 (인식 설계 §3.11, D-012). 순수 함수.
import { pageHeight, paperMetrics } from "../design/tokens";
import { strokeGeom, translateStroke } from "../model/stroke";
import type { PageData, PaperKind, Stroke } from "../model/types";

const EPS = 0.5;

/**
 * yIns 아래 내용을 rows줄만큼 내린다.
 * - 위쪽 끝이 yIns 아래인 객체는 모두 내린다.
 * - yIns에 걸친 획은 xRange와 가로로 겹치고 절반 이상이 아래에 있으면 통째로 내린다.
 * - 답에 딸린 주석 획은 답과 함께 움직인다.
 * - 쪽 아래로 넘치면 extraRows를 늘려 종이를 이어 붙인다.
 */
export function makeRoom(
  doc: PageData,
  paper: PaperKind,
  yIns: number,
  rows: number,
  xRange: [number, number] = [-Infinity, Infinity],
): PageData {
  if (rows <= 0) return doc;
  const { row } = paperMetrics(paper);
  const dy = rows * row;

  const movedAnswers = new Set<string>();
  const answers = doc.answers.map((a) => {
    if (a.y >= yIns - EPS) {
      movedAnswers.add(a.id);
      return { ...a, y: a.y + dy };
    }
    return a;
  });

  const strokes = doc.strokes.map((s) => {
    if (s.answerId) return movedAnswers.has(s.answerId) ? translateStroke(s, 0, dy) : s;
    return shouldMove(s, yIns, xRange) ? translateStroke(s, 0, dy) : s;
  });

  const slots = doc.slots.map((sl) => (sl.y >= yIns - EPS ? { ...sl, y: sl.y + dy } : sl));
  const questions = doc.questions.map((q) => {
    if (!q.bands.some((b) => b.y >= yIns - EPS)) return q;
    return { ...q, bands: q.bands.map((b) => (b.y >= yIns - EPS ? { ...b, y: b.y + dy } : b)) };
  });

  return fitPage({ ...doc, strokes, answers, slots, questions }, paper);
}

function shouldMove(s: Stroke, yIns: number, xRange: [number, number]): boolean {
  const g = strokeGeom(s);
  if (g.minY >= yIns - EPS) return true;
  if (g.maxY <= yIns + EPS) return false;
  const overlapsX = g.maxX >= xRange[0] && g.minX <= xRange[1];
  const below = (g.maxY - yIns) / Math.max(1, g.maxY - g.minY);
  return overlapsX && below >= 0.5;
}

/** 비워 둔 [yFrom, yFrom + rows줄) 구간을 돌려준다. 아래 내용을 위로 당긴다. */
export function releaseRows(doc: PageData, paper: PaperKind, yFrom: number, rows: number): PageData {
  if (rows <= 0) return doc;
  const { row } = paperMetrics(paper);
  const dy = rows * row;
  const limit = yFrom + dy - EPS;
  const movedAnswers = new Set<string>();
  const answers = doc.answers.map((a) => {
    if (a.y >= limit) {
      movedAnswers.add(a.id);
      return { ...a, y: a.y - dy };
    }
    return a;
  });
  const strokes = doc.strokes.map((s) => {
    if (s.answerId) return movedAnswers.has(s.answerId) ? translateStroke(s, 0, -dy) : s;
    return strokeGeom(s).minY >= limit ? translateStroke(s, 0, -dy) : s;
  });
  const slots = doc.slots.map((sl) => (sl.y >= limit ? { ...sl, y: sl.y - dy } : sl));
  const questions = doc.questions.map((q) =>
    q.bands.some((b) => b.y >= limit) ? { ...q, bands: q.bands.map((b) => (b.y >= limit ? { ...b, y: b.y - dy } : b)) } : q,
  );
  return { ...doc, strokes, answers, slots, questions };
}

/** 내용의 맨 아래 */
export function contentBottom(doc: PageData, paper: PaperKind): number {
  const { row } = paperMetrics(paper);
  let bottom = 0;
  for (const s of doc.strokes) bottom = Math.max(bottom, strokeGeom(s).maxY);
  for (const a of doc.answers) bottom = Math.max(bottom, a.y + a.rows * row);
  for (const sl of doc.slots) bottom = Math.max(bottom, sl.y + sl.rows * row);
  return bottom;
}

/** 내용이 쪽을 넘치면 줄 단위로 종이를 이어 붙인다 (한 줄 여유). */
export function fitPage(doc: PageData, paper: PaperKind): PageData {
  const { row } = paperMetrics(paper);
  const h = pageHeight(paper, doc.extraRows);
  const bottom = contentBottom(doc, paper);
  if (bottom <= h - row) return doc;
  const add = Math.ceil((bottom - (h - row)) / row);
  return { ...doc, extraRows: doc.extraRows + add };
}

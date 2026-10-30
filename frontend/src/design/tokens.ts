// 쪽 단위(pu) 수치 토큰과 CSS 변수 읽기. 수치는 tokens.css와 같아야 한다.
import type { InkTool, PaperKind, PenColor } from "../model/types";

export const PAGE = {
  width: 798,
  head: 72,
  marginX: 96,
  textX: 112,
  rightX: 770,
  baseRows: 31,
} as const;

/** 종이마다 줄 간격(p)과 첫 줄 위치. 모눈은 두 칸이 한 줄. */
export function paperMetrics(paper: PaperKind): { row: number; head: number } {
  if (paper === "grid") return { row: 40, head: 40 };
  return { row: 34, head: PAGE.head };
}

export function pageHeight(paper: PaperKind, extraRows: number): number {
  const { row, head } = paperMetrics(paper);
  return head + (PAGE.baseRows + extraRows) * row;
}

/** CSS 기준 1mm의 화면 px. 제스처 기준(mm)을 바꿀 때 쓴다. */
export const PX_PER_MM = 96 / 25.4;

export const PEN_VARS: Record<PenColor, string> = {
  blueblack: "--pen-blueblack",
  black: "--pen-black",
  red: "--pen-red",
  blue: "--pen-blue",
  graphite: "--pen-graphite",
  hlYellow: "--pen-highlight-yellow",
  hlPink: "--pen-highlight-pink",
};

export const INK_PALETTE: PenColor[] = ["blueblack", "black", "red", "blue"];
export const HIGHLIGHT_PALETTE: PenColor[] = ["hlYellow", "hlPink"];

/** 펜 종류별 굵기 단계 (pu). */
export const PEN_SIZES: Record<InkTool, [number, number, number]> = {
  pen: [2.2, 3.2, 4.6],
  pencil: [2.0, 2.8, 3.8],
  highlighter: [14, 20, 26],
};

const cache = new Map<string, string>();
/** CSS 변수 값을 읽는다. 캔버스는 이 함수로만 색을 얻는다. */
export function cssVar(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  cache.set(name, v);
  return v;
}

export function penColor(c: PenColor): string {
  return cssVar(PEN_VARS[c]);
}

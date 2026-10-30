// 쪽 데이터 형식 (작업 설계 §6.3). 서버는 PageData를 그대로 저장한다.

export type PaperKind = "ruled" | "grid" | "plain";
export type InkTool = "pen" | "pencil" | "highlighter";
export type Tool = InkTool | "eraser" | "lasso";
export type PenColor = "blueblack" | "black" | "red" | "blue" | "graphite" | "hlYellow" | "hlPink";

export interface Stroke {
  id: string;
  tool: InkTool;
  color: PenColor;
  size: 0 | 1 | 2;
  /** [x, y, pressure, dtMs] 반복. 좌표는 쪽 단위(pu). */
  pts: number[];
  t0: number;
  t1: number;
  /** 답 위에 쓴 주석이면 그 답 id (답과 함께 움직인다). */
  answerId?: string;
  /** 이어 질문 칸 안에서 시작한 획이면 그 칸 id. */
  slotId?: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type QuestionSource = "double-tap" | "lasso" | "slot";

export interface QuestionItem {
  id: string;
  threadId: string;
  /** 줄기 안 순서 (여백 번호). */
  step: number;
  strokeIds: string[];
  text: string;
  source: QuestionSource;
  /** 줄마다 형광펜 띠 영역. */
  bands: Rect[];
}

export type AnswerStatus = "streaming" | "done" | "error" | "stale";

export interface AnswerItem {
  id: string;
  threadId: string;
  questionId: string;
  step: number;
  x: number;
  y: number;
  w: number;
  rows: number;
  text: string;
  status: AnswerStatus;
  error?: string;
}

export interface SlotItem {
  id: string;
  threadId: string;
  afterAnswerId: string;
  x: number;
  y: number;
  w: number;
  rows: number;
}

export interface PageData {
  v: 1;
  extraRows: number;
  strokes: Stroke[];
  questions: QuestionItem[];
  answers: AnswerItem[];
  slots: SlotItem[];
}

export interface Notebook {
  id: string;
  title: string;
  paper: PaperKind;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
}

export interface PageMeta {
  id: string;
  index: number;
  updatedAt: string;
}

export interface Page extends PageMeta {
  notebookId: string;
  data: PageData | Record<string, never>;
}

export function emptyPage(): PageData {
  return { v: 1, extraRows: 0, strokes: [], questions: [], answers: [], slots: [] };
}

export function normalizePage(data: unknown): PageData {
  const d = (data ?? {}) as Partial<PageData>;
  return {
    v: 1,
    extraRows: typeof d.extraRows === "number" ? d.extraRows : 0,
    strokes: Array.isArray(d.strokes) ? d.strokes : [],
    questions: Array.isArray(d.questions) ? d.questions : [],
    answers: Array.isArray(d.answers) ? d.answers : [],
    slots: Array.isArray(d.slots) ? d.slots : [],
  };
}

let counter = 0;
export function newId(prefix = ""): string {
  counter = (counter + 1) % 1e6;
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + counter.toString(36);
}

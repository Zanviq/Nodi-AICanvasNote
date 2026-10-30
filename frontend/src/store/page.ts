// 노트·쪽 상태, 실행 취소, 자동 저장, 진행 중인 질문 표시.
import { create } from "zustand";
import { api } from "../api/client";
import { paperMetrics } from "../design/tokens";
import type { Token } from "../question/align";
import { fitPage, makeRoom, releaseRows } from "../question/placement";
import { normalizePage, emptyPage, type Notebook, type PageData, type PageMeta, type QuestionSource, type Rect } from "../model/types";

export type QueryPhase = "candidate" | "reading" | "confirm" | "answering" | "error" | "queued";

export interface ActiveQuery {
  id: string;
  phase: QueryPhase;
  source: QuestionSource;
  /** 꼬리표를 붙일 위치 (쪽 좌표, 범위의 오른쪽 끝) */
  tagX: number;
  tagY: number;
  candidate?: Rect[];
  bands?: Rect[];
  tokens?: Token[];
  span?: { start: number; end: number };
  text?: string;
  message?: string;
  answerId?: string;
  existingQuestionId?: string;
  /** 2단계 결과를 다시 계산할 때 필요한 값 */
  continuations?: number[];
  tauS?: number;
}

export type SaveState = "saved" | "dirty" | "saving" | "error";

interface PageState {
  notebook: Notebook | null;
  pages: PageMeta[];
  pageIndex: number;
  pageId: string | null;
  doc: PageData;
  undoStack: PageData[];
  redoStack: PageData[];
  saveState: SaveState;
  loading: boolean;
  error: string | null;
  queries: ActiveQuery[];
  selection: string[];

  open: (notebook: Notebook, index?: number) => Promise<void>;
  goTo: (index: number) => Promise<void>;
  addPage: () => Promise<void>;
  deletePage: () => Promise<void>;
  /** 실행 취소 기록을 남기며 문서를 바꾼다 */
  commit: (fn: (d: PageData) => PageData) => void;
  /** 실행 취소 기록 없이 바꾼다 (답 스트리밍, 줄 조정) */
  patch: (fn: (d: PageData) => PageData) => void;
  undo: () => void;
  redo: () => void;
  setAnswerRows: (answerId: string, needed: number) => void;
  upsertQuery: (q: ActiveQuery) => void;
  updateQuery: (id: string, patch: Partial<ActiveQuery>) => void;
  removeQuery: (id: string) => void;
  setSelection: (ids: string[]) => void;
  flush: () => Promise<void>;
}

const MAX_UNDO = 100;
let saveTimer: number | undefined;

/** 질문 획이 바뀌면 그 답에 「질문이 바뀜」을 표시한다 */
function markStale(prev: PageData, next: PageData): PageData {
  if (prev.strokes === next.strokes || !next.questions.length) return next;
  const before = new Map(prev.strokes.map((s) => [s.id, s]));
  const after = new Map(next.strokes.map((s) => [s.id, s]));
  const changed = new Set<string>();
  for (const [id, s] of before) if (after.get(id) !== s) changed.add(id);
  if (!changed.size) return next;
  // 답 자리 만들기로 함께 내려간 획은 「바뀜」이 아니다: 질문 띠도 같이 움직였는지로 구분한다
  const staleQ = new Set(
    next.questions
      .filter((q) => {
        const old = prev.questions.find((o) => o.id === q.id);
        const moved = old && old.bands[0] && q.bands[0] && old.bands[0].y !== q.bands[0].y;
        return !moved && q.strokeIds.some((id) => changed.has(id));
      })
      .map((q) => q.id),
  );
  if (!staleQ.size) return next;
  return { ...next, answers: next.answers.map((a) => (staleQ.has(a.questionId) && a.status === "done" ? { ...a, status: "stale" } : a)) };
}

export const usePage = create<PageState>((set, get) => {
  const scheduleSave = () => {
    set({ saveState: "dirty" });
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void get().flush(), 800);
  };

  const load = async (index: number) => {
    const { pages } = get();
    const meta = pages[Math.max(0, Math.min(index, pages.length - 1))];
    if (!meta) return;
    set({ loading: true });
    const page = await api.getPage(meta.id);
    set({
      pageIndex: meta.index,
      pageId: meta.id,
      doc: normalizePage(page.data),
      undoStack: [],
      redoStack: [],
      saveState: "saved",
      loading: false,
      queries: [],
      selection: [],
    });
  };

  return {
    notebook: null,
    pages: [],
    pageIndex: 0,
    pageId: null,
    doc: emptyPage(),
    undoStack: [],
    redoStack: [],
    saveState: "saved",
    loading: false,
    error: null,
    queries: [],
    selection: [],

    open: async (notebook, index = 0) => {
      set({ notebook, error: null, loading: true });
      try {
        const pages = await api.listPages(notebook.id);
        set({ pages });
        await load(index);
      } catch (e) {
        set({ error: (e as Error).message, loading: false });
      }
    },

    goTo: async (index) => {
      await get().flush();
      await load(index);
    },

    addPage: async () => {
      const { notebook, pageIndex } = get();
      if (!notebook) return;
      await get().flush();
      const page = await api.addPage(notebook.id, pageIndex);
      const pages = await api.listPages(notebook.id);
      set({ pages });
      await load(page.index);
    },

    deletePage: async () => {
      const { notebook, pageId, pageIndex, pages } = get();
      if (!notebook || !pageId || pages.length <= 1) return;
      window.clearTimeout(saveTimer);
      await api.deletePage(pageId);
      const next = await api.listPages(notebook.id);
      set({ pages: next, saveState: "saved" });
      await load(Math.min(pageIndex, next.length - 1));
    },

    commit: (fn) => {
      const { doc, undoStack, notebook } = get();
      let next = fn(doc);
      if (next === doc) return;
      if (notebook) next = fitPage(next, notebook.paper);
      next = markStale(doc, next);
      set({ doc: next, undoStack: [...undoStack.slice(-MAX_UNDO + 1), doc], redoStack: [] });
      scheduleSave();
    },

    patch: (fn) => {
      const { doc } = get();
      const next = fn(doc);
      if (next === doc) return;
      set({ doc: next });
      scheduleSave();
    },

    undo: () => {
      const { undoStack, redoStack, doc } = get();
      const prev = undoStack[undoStack.length - 1];
      if (!prev) return;
      set({ doc: prev, undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, doc] });
      scheduleSave();
    },

    redo: () => {
      const { undoStack, redoStack, doc } = get();
      const next = redoStack[redoStack.length - 1];
      if (!next) return;
      set({ doc: next, redoStack: redoStack.slice(0, -1), undoStack: [...undoStack, doc] });
      scheduleSave();
    },

    setAnswerRows: (answerId, needed) => {
      const { doc, notebook } = get();
      if (!notebook) return;
      const a = doc.answers.find((x) => x.id === answerId);
      if (!a) return;
      const rows = Math.max(1, needed);
      const { row } = paperMetrics(notebook.paper);
      if (rows > a.rows) {
        get().patch((d) => {
          const moved = makeRoom(d, notebook.paper, a.y + a.rows * row, rows - a.rows, [a.x, a.x + a.w]);
          return { ...moved, answers: moved.answers.map((x) => (x.id === answerId ? { ...x, rows } : x)) };
        });
      } else if (rows < a.rows && a.status !== "streaming") {
        get().patch((d) => {
          const moved = releaseRows(d, notebook.paper, a.y + rows * row, a.rows - rows);
          return { ...moved, answers: moved.answers.map((x) => (x.id === answerId ? { ...x, rows } : x)) };
        });
      }
    },

    upsertQuery: (q) => set({ queries: [...get().queries.filter((x) => x.id !== q.id), q] }),
    updateQuery: (id, p) => set({ queries: get().queries.map((q) => (q.id === id ? { ...q, ...p } : q)) }),
    removeQuery: (id) => set({ queries: get().queries.filter((q) => q.id !== id) }),
    setSelection: (ids) => set({ selection: ids }),

    flush: async () => {
      window.clearTimeout(saveTimer);
      const { pageId, doc, saveState } = get();
      if (!pageId || saveState === "saved") return;
      set({ saveState: "saving" });
      try {
        await api.savePage(pageId, doc);
        if (get().doc === doc) set({ saveState: "saved" });
        else scheduleSave();
      } catch {
        set({ saveState: "error" });
        saveTimer = window.setTimeout(() => void get().flush(), 5000);
      }
    },
  };
});

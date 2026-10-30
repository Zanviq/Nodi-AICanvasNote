// 질문 흐름 전체 (인식 설계 §3.2): 두 번 톡 → 후보 → 인식 → 문장 → 답 → 이어 질문.
import { api, ApiError, logEvent } from "../api/client";
import { paperMetrics } from "../design/tokens";
import { strokeGeom } from "../model/stroke";
import { newId, type AnswerItem, type PageData, type PaperKind, type QuestionItem, type QuestionSource, type Rect, type Stroke } from "../model/types";
import { usePage, type ActiveQuery } from "../store/page";
import { alignLine, fillTimes, tokenAt, type Token } from "./align";
import { selectSentence } from "./boundary";
import { buildBlock, findWordAt } from "./candidate";
import { buildLayout, columnRight, lineBottomY, type Layout } from "./geometry";
import { makeRoom, releaseRows } from "./placement";
import { rasterizeLines, type RasterLine } from "./rasterize";

const INITIAL_ROWS = 3;
const aborts = new Map<string, AbortController>();

const page = () => usePage.getState();
const paper = (): PaperKind => page().notebook?.paper ?? "ruled";

function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "문제가 생겼어요. 다시 시도해 주세요.";
}

function bandsFor(tokens: Token[], layout: Layout): Rect[] {
  const byLine = new Map<number, Token[]>();
  for (const t of tokens) byLine.set(t.line, [...(byLine.get(t.line) ?? []), t]);
  const out: Rect[] = [];
  for (const ts of byLine.values()) {
    const x0 = Math.min(...ts.map((t) => t.minX)) - 5;
    const x1 = Math.max(...ts.map((t) => t.maxX)) + 5;
    const y0 = Math.min(...ts.map((t) => t.minY));
    const y1 = Math.max(...ts.map((t) => t.maxY));
    if (layout.paper === "plain") out.push({ x: x0, y: y0 - 0.12 * layout.h, w: x1 - x0, h: y1 - y0 + 0.24 * layout.h });
    else {
      const mid = (y0 + y1) / 2;
      const r = Math.floor((mid - layout.head) / layout.row);
      const top = layout.head + r * layout.row;
      out.push({ x: x0, y: top + 7, w: x1 - x0, h: layout.row - 9 });
    }
  }
  return out.sort((a, b) => a.y - b.y);
}

function rectsOfLines(layout: Layout): Rect[] {
  return layout.lines.map((l) => ({ x: l.minX - 6, y: l.minY - 4, w: l.maxX - l.minX + 12, h: l.maxY - l.minY + 8 }));
}

function rasterFromLayout(layout: Layout): RasterLine[] {
  return layout.lines.map((l) => ({
    strokes: l.segments.flatMap((s) => s.words.flatMap((w) => w.strokeIds)).map((id) => layout.strokes.get(id) as Stroke),
    minX: l.minX,
    minY: l.minY,
    maxX: l.maxX,
    maxY: l.maxY,
  }));
}

/** 줄기에서 이 질문보다 앞선 질문·답 */
function threadContext(doc: PageData, threadId: string, beforeStep: number) {
  return doc.questions
    .filter((q) => q.threadId === threadId && q.step < beforeStep)
    .sort((a, b) => a.step - b.step)
    .map((q) => ({ q: q.text, a: doc.answers.find((a) => a.questionId === q.id)?.text ?? "" }))
    .filter((p) => p.a)
    .slice(-4);
}

/** 두 번 톡으로 단어를 짚었다 */
export async function startQuery(x: number, y: number): Promise<void> {
  const { doc, upsertQuery, updateQuery } = page();
  const layout = buildLayout(doc.strokes, paper());
  const word = findWordAt(layout, x, y, 1.6);
  if (!word) return;

  // 이미 물은 질문이면 다시 묻기를 권한다
  const existing = doc.questions.find((q) => q.strokeIds.some((id) => word.strokeIds.includes(id)));
  if (existing) {
    const b = existing.bands[existing.bands.length - 1];
    upsertQuery({ id: newId("q"), phase: "confirm", source: existing.source, tagX: b.x + b.w, tagY: b.y, text: existing.text, existingQuestionId: existing.id, bands: [] });
    return;
  }

  const block = buildBlock(layout, word);
  const t0 = performance.now();
  const id = newId("q");
  const anchorRect = block.lines[block.anchorLine];
  const candidate = block.lines.map((l) => ({ x: l.minX - 6, y: l.minY - 4, w: l.maxX - l.minX + 12, h: l.maxY - l.minY + 8 }));
  upsertQuery({ id, phase: "candidate", source: "double-tap", tagX: anchorRect.maxX, tagY: anchorRect.minY, candidate });
  logEvent("candidate", { lines: block.lines.length, continuations: block.continuations });

  const ctrl = new AbortController();
  aborts.set(id, ctrl);
  const raster: RasterLine[] = block.lines.map((l) => ({
    strokes: l.words.flatMap((w) => w.strokeIds).map((sid) => layout.strokes.get(sid) as Stroke),
    minX: l.minX,
    minY: l.minY,
    maxX: l.maxX,
    maxY: l.maxY,
  }));
  let lines: { index: number; text: string }[];
  try {
    const res = await api.recognize(rasterizeLines(raster, layout.h), raster.length, ctrl.signal);
    lines = res.lines;
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    const offline = e instanceof ApiError && e.code === "offline";
    updateQuery(id, { phase: offline ? "queued" : "error", message: errorText(e) });
    return;
  }
  if (!page().queries.some((q) => q.id === id)) return;

  let tokens: Token[] = [];
  block.lines.forEach((bl, li) => {
    const text = lines.find((l) => l.index === li + 1)?.text ?? "";
    tokens.push(...alignLine(text, bl.words, li));
  });
  tokens = fillTimes(tokens);
  if (!tokens.length) {
    updateQuery(id, { phase: "error", message: "글씨를 읽지 못했어요. 범위를 올가미로 골라 다시 물어 주세요." });
    return;
  }
  const anchor = tokenAt(tokens, x, y, new Set(word.strokeIds));
  const sentence = selectSentence({ tokens, continuations: block.continuations, tauS: layout.tauS }, anchor);
  const spanTokens = tokens.slice(sentence.start, sentence.end + 1);
  const bands = bandsFor(spanTokens, layout);
  const last = bands[bands.length - 1];
  const count = spanTokens.length;
  const lowConfidence = count <= 3 || count >= 40 || spanTokens.some((t) => !t.strokeIds.length);
  logEvent("span", { tokens: tokens.length, start: sentence.start, end: sentence.end, ms: Math.round(performance.now() - t0) });
  updateQuery(id, {
    phase: lowConfidence ? "confirm" : "reading",
    tokens,
    span: { start: sentence.start, end: sentence.end },
    text: sentence.text,
    bands,
    candidate: undefined,
    tagX: last.x + last.w,
    tagY: last.y,
    continuations: block.continuations,
    tauS: layout.tauS,
  });
  if (!lowConfidence) await ask(id);
}

/** 범위가 정해진 질문을 보낸다 */
export async function ask(queryId: string): Promise<void> {
  const q = page().queries.find((x) => x.id === queryId);
  if (!q) return;
  if (q.existingQuestionId) return reask(q.existingQuestionId, queryId);
  if (!q.tokens || !q.span || !q.text) return;
  const { doc } = page();
  const layout = buildLayout(doc.strokes, paper());
  const spanTokens = q.tokens.slice(q.span.start, q.span.end + 1);
  const strokeIds = [...new Set(spanTokens.flatMap((t) => t.strokeIds))];
  const lastLineIdx = Math.max(...strokeIds.map((id) => layout.lineOfStroke.get(id) ?? -1));
  const firstLineIdx = Math.min(...strokeIds.map((id) => layout.lineOfStroke.get(id) ?? Infinity));
  const lastLine = layout.lines[lastLineIdx];
  const firstLine = layout.lines[firstLineIdx];
  if (!lastLine || !firstLine) return;
  const firstSeg = firstLine.segments.find((s) => s.words.some((w) => w.strokeIds.some((id) => strokeIds.includes(id)))) ?? firstLine.segments[0];
  const xL = Math.max(8, Math.min(firstSeg.minX, ...spanTokens.map((t) => t.minX)));
  const xR = Math.max(xL + 200, columnRight(layout, lastLineIdx));
  const nearby = q.tokens.filter((_, i) => i < q.span!.start || i > q.span!.end).map((t) => t.text).join(" ");
  await placeAndAnswer(queryId, {
    source: q.source,
    threadId: newId("t"),
    step: 1,
    strokeIds,
    text: q.text,
    bands: q.bands ?? [],
    yIns: lineBottomY(layout, lastLine),
    xL,
    xR,
    nearby,
  });
}

interface PlaceArgs {
  source: QuestionSource;
  threadId: string;
  step: number;
  strokeIds: string[];
  text: string;
  bands: Rect[];
  yIns: number;
  xL: number;
  xR: number;
  nearby?: string;
}

async function placeAndAnswer(queryId: string, a: PlaceArgs): Promise<void> {
  const { commit, updateQuery } = page();
  const kind = paper();
  const question: QuestionItem = { id: newId("Q"), threadId: a.threadId, step: a.step, strokeIds: a.strokeIds, text: a.text, source: a.source, bands: a.bands };
  const answer: AnswerItem = {
    id: newId("A"), threadId: a.threadId, questionId: question.id, step: a.step,
    x: a.xL, y: a.yIns, w: a.xR - a.xL, rows: INITIAL_ROWS, text: "", status: "streaming",
  };
  commit((d) => {
    const moved = makeRoom(d, kind, a.yIns, INITIAL_ROWS, [a.xL, a.xR]);
    return { ...moved, questions: [...moved.questions, question], answers: [...moved.answers, answer] };
  });
  updateQuery(queryId, { phase: "answering", answerId: answer.id });
  await streamInto(queryId, answer.id, {
    question: a.text,
    nearby: a.nearby || undefined,
    title: page().notebook?.title,
    thread: threadContext(page().doc, a.threadId, a.step),
  });
}

async function streamInto(queryId: string, answerId: string, body: Parameters<typeof api.answer>[0]): Promise<void> {
  const { patch, removeQuery, updateQuery } = page();
  const ctrl = new AbortController();
  aborts.set(queryId, ctrl);
  const t0 = performance.now();
  let first = 0;
  const setAnswer = (fn: (a: AnswerItem) => AnswerItem) =>
    patch((d) => ({ ...d, answers: d.answers.map((x) => (x.id === answerId ? fn(x) : x)) }));
  try {
    await api.answer(
      body,
      (delta) => {
        if (!first) first = performance.now() - t0;
        setAnswer((a) => ({ ...a, text: a.text + delta }));
      },
      ctrl.signal,
    );
    setAnswer((a) => ({ ...a, status: "done", error: undefined }));
    removeQuery(queryId);
    logEvent("answer_done", { firstTokenMs: Math.round(first), totalMs: Math.round(performance.now() - t0) });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    setAnswer((a) => ({ ...a, status: "error", error: errorText(e) }));
    updateQuery(queryId, { phase: "error", message: errorText(e) });
  } finally {
    aborts.delete(queryId);
  }
}

/** 취소: 요청을 멈추고, 쓰던 답은 지우고 자리를 돌려준다 */
export function cancelQuery(queryId: string): void {
  aborts.get(queryId)?.abort();
  aborts.delete(queryId);
  const { queries, removeQuery, patch } = page();
  const q = queries.find((x) => x.id === queryId);
  removeQuery(queryId);
  logEvent("cancel", { phase: q?.phase });
  if (!q?.answerId || q.existingQuestionId) return;
  const kind = paper();
  patch((d) => {
    const a = d.answers.find((x) => x.id === q.answerId);
    if (!a || a.status === "done") return d;
    const rest = { ...d, answers: d.answers.filter((x) => x.id !== a.id), questions: d.questions.filter((x) => x.id !== a.questionId) };
    return releaseRows(rest, kind, a.y, a.rows);
  });
}

/** 손잡이로 범위를 고쳤다 */
export function adjustSpan(queryId: string, start: number, end: number): void {
  const q = page().queries.find((x) => x.id === queryId);
  if (!q?.tokens) return;
  const s = Math.max(0, Math.min(start, end)), e = Math.min(q.tokens.length - 1, Math.max(start, end));
  const layout = buildLayout(page().doc.strokes, paper());
  const bands = bandsFor(q.tokens.slice(s, e + 1), layout);
  const last = bands[bands.length - 1];
  page().updateQuery(queryId, {
    span: { start: s, end: e },
    text: q.tokens.slice(s, e + 1).map((t) => t.text).join(" "),
    bands,
    tagX: last.x + last.w,
    tagY: last.y,
    phase: "confirm",
  });
  logEvent("span_adjusted", { start: s, end: e });
}

/** 답을 두 번 톡: 그 아래에 이어 질문 칸을 연다 */
export function openSlot(answerId: string): void {
  const { doc, commit } = page();
  const a = doc.answers.find((x) => x.id === answerId);
  if (!a || doc.slots.some((s) => s.afterAnswerId === answerId)) return;
  const kind = paper();
  const { row } = paperMetrics(kind);
  const y = a.y + a.rows * row;
  commit((d) => {
    const moved = makeRoom(d, kind, y, 2, [a.x, a.x + a.w]);
    return { ...moved, slots: [...moved.slots, { id: newId("S"), threadId: a.threadId, afterAnswerId: a.id, x: a.x, y, w: a.w, rows: 2 }] };
  });
  logEvent("slot_open", {});
}

/** 칸에 쓴 글 전체를 질문으로 보낸다 */
export async function submitSlot(slotId: string): Promise<void> {
  const { doc, upsertQuery, updateQuery } = page();
  const slot = doc.slots.find((s) => s.id === slotId);
  if (!slot) return;
  const strokes = doc.strokes.filter((s) => s.slotId === slotId);
  if (!strokes.length) return;
  const kind = paper();
  const { row } = paperMetrics(kind);
  const queryId = newId("q");
  const prev = doc.answers.find((a) => a.id === slot.afterAnswerId);
  upsertQuery({ id: queryId, phase: "candidate", source: "slot", tagX: slot.x + slot.w, tagY: slot.y, candidate: [{ x: slot.x, y: slot.y, w: slot.w, h: slot.rows * row }] });
  const text = await recognizeStrokes(queryId, strokes, kind);
  if (text === null) return;
  const layout = buildLayout(strokes, kind, { only: new Set(strokes.map((s) => s.id)) });
  const bands = rectsOfLines(layout);
  const yIns = slot.y + slot.rows * row;
  // 칸을 닫고 그 글씨를 질문으로 바꾼다
  page().commit((d) => ({
    ...d,
    slots: d.slots.filter((s) => s.id !== slotId),
    strokes: d.strokes.map((s) => (s.slotId === slotId ? { ...s, slotId: undefined } : s)),
  }));
  updateQuery(queryId, { text, phase: "reading", tagX: slot.x + slot.w, tagY: slot.y });
  await placeAndAnswer(queryId, {
    source: "slot",
    threadId: slot.threadId,
    step: (prev?.step ?? 0) + 1,
    strokeIds: strokes.map((s) => s.id),
    text,
    bands,
    yIns,
    xL: slot.x,
    xR: slot.x + slot.w,
  });
}

/** 올가미로 고른 획을 질문으로 */
export async function askSelection(ids: string[]): Promise<void> {
  const { doc, upsertQuery, updateQuery, setSelection } = page();
  const strokes = doc.strokes.filter((s) => ids.includes(s.id) && s.tool !== "highlighter");
  if (!strokes.length) return;
  setSelection([]);
  const kind = paper();
  const layout = buildLayout(strokes, kind, { only: new Set(strokes.map((s) => s.id)) });
  if (!layout.lines.length) return;
  const last = layout.lines[layout.lines.length - 1];
  const queryId = newId("q");
  upsertQuery({ id: queryId, phase: "candidate", source: "lasso", tagX: last.maxX, tagY: last.minY, candidate: rectsOfLines(layout) });
  const text = await recognizeStrokes(queryId, strokes, kind);
  if (text === null) return;
  const bands = rectsOfLines(layout);
  updateQuery(queryId, { text, phase: "reading", bands, candidate: undefined });
  const xL = Math.min(...layout.lines.map((l) => l.minX));
  const full = buildLayout(page().doc.strokes, kind);
  await placeAndAnswer(queryId, {
    source: "lasso",
    threadId: newId("t"),
    step: 1,
    strokeIds: strokes.map((s) => s.id),
    text,
    bands,
    yIns: lineBottomY(layout, last),
    xL,
    xR: Math.max(xL + 200, columnRight(full, 0)),
  });
}

async function recognizeStrokes(queryId: string, strokes: Stroke[], kind: PaperKind): Promise<string | null> {
  const layout = buildLayout(strokes, kind, { only: new Set(strokes.map((s) => s.id)) });
  const raster = rasterFromLayout(layout);
  if (!raster.length) return null;
  const ctrl = new AbortController();
  aborts.set(queryId, ctrl);
  try {
    const res = await api.recognize(rasterizeLines(raster, layout.h), raster.length, ctrl.signal);
    const text = res.lines.map((l) => l.text).filter(Boolean).join(" ").trim();
    if (!text) {
      page().updateQuery(queryId, { phase: "error", message: "글씨를 읽지 못했어요. 조금 더 크게 써 보세요." });
      return null;
    }
    return text;
  } catch (e) {
    if ((e as Error).name === "AbortError") return null;
    page().updateQuery(queryId, { phase: "error", message: errorText(e) });
    return null;
  }
}

/** 질문 글씨를 다시 읽고 같은 답 자리에 새로 답한다 */
export async function reask(questionId: string, queryId = newId("q")): Promise<void> {
  const { doc, upsertQuery, updateQuery, patch } = page();
  const q = doc.questions.find((x) => x.id === questionId);
  const a = doc.answers.find((x) => x.questionId === questionId);
  if (!q || !a) return;
  const strokes = doc.strokes.filter((s) => q.strokeIds.includes(s.id));
  const b = q.bands[q.bands.length - 1] ?? { x: a.x, y: a.y, w: a.w, h: 0 };
  upsertQuery({ id: queryId, phase: "reading", source: q.source, tagX: b.x + b.w, tagY: b.y, answerId: a.id, existingQuestionId: q.id, text: q.text });
  let text = q.text;
  if (strokes.length) {
    const read = await recognizeStrokes(queryId, strokes, paper());
    if (read === null) return;
    text = read;
  }
  const layout = strokes.length ? buildLayout(strokes, paper(), { only: new Set(strokes.map((s) => s.id)) }) : null;
  patch((d) => ({
    ...d,
    questions: d.questions.map((x) => (x.id === questionId ? { ...x, text, strokeIds: strokes.map((s) => s.id), bands: layout ? rectsOfLines(layout) : x.bands } : x)),
    answers: d.answers.map((x) => (x.id === a.id ? { ...x, text: "", status: "streaming", error: undefined } : x)),
  }));
  updateQuery(queryId, { phase: "answering", text });
  await streamInto(queryId, a.id, { question: text, title: page().notebook?.title, thread: threadContext(page().doc, q.threadId, q.step) });
}

/** 답 지우기: 답과 그 주석을 지우고 빈 줄은 남긴다 */
export function deleteAnswer(answerId: string): void {
  page().commit((d) => {
    const a = d.answers.find((x) => x.id === answerId);
    if (!a) return d;
    return {
      ...d,
      answers: d.answers.filter((x) => x.id !== answerId),
      questions: d.questions.filter((x) => x.id !== a.questionId),
      strokes: d.strokes.filter((s) => s.answerId !== answerId),
      slots: d.slots.filter((s) => s.afterAnswerId !== answerId),
    };
  });
}

/** 칸에 쓴 획이 마지막 줄에 닿으면 칸을 한 줄 늘린다 */
export function growSlotIfNeeded(slotId: string, stroke: Stroke): void {
  const { doc, patch } = page();
  const slot = doc.slots.find((s) => s.id === slotId);
  if (!slot) return;
  const kind = paper();
  const { row } = paperMetrics(kind);
  const g = strokeGeom(stroke);
  if (g.maxY < slot.y + (slot.rows - 1) * row) return;
  const y = slot.y + slot.rows * row;
  patch((d) => {
    const moved = makeRoom(d, kind, y, 1, [slot.x, slot.x + slot.w]);
    return { ...moved, slots: moved.slots.map((s) => (s.id === slotId ? { ...s, rows: s.rows + 1 } : s)) };
  });
}

export function activeQueries(): ActiveQuery[] {
  return page().queries;
}

// 쪽 화면: 종이·답(아래) → 획 캔버스 → 표시·꼬리표(위)
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { PAGE, pageHeight, paperMetrics } from "../design/tokens";
import { Surface } from "../ink/surface";
import { strokeGeom } from "../model/stroke";
import type { AnswerItem, PageData, PaperKind, Rect, SlotItem } from "../model/types";
import { tokenAt } from "../question/align";
import { adjustSpan, ask, cancelQuery, reask, submitSlot } from "../question/controller";
import { releaseRows } from "../question/placement";
import { usePage, type ActiveQuery } from "../store/page";
import { useSettings } from "../store/settings";
import { useUi } from "../store/ui";
import { formatAnswer } from "./format";

let currentSurface: Surface | null = null;

function Paper({ kind, height, extraRows }: { kind: PaperKind; height: number; extraRows: number }) {
  const { row, head } = paperMetrics(kind);
  const seam = head + PAGE.baseRows * row;
  return (
    <div className={`paper${kind === "grid" ? " grid" : ""}`} style={{ height }}>
      {kind === "ruled" && (
        <>
          <div className="rules" />
          <div className="holes" />
          <div className="margin-line" />
          <div className="print" aria-hidden>
            <span>No.</span>
            <span>Date</span>
          </div>
        </>
      )}
      {kind === "grid" && <div className="grid-lines" />}
      {extraRows > 0 && (
        <svg className="page-svg" height={height} aria-hidden>
          <line className="svg-seam" x1={0} x2={PAGE.width} y1={seam} y2={seam} />
        </svg>
      )}
    </div>
  );
}

function AnswerText({ a, paper }: { a: AnswerItem; paper: PaperKind }) {
  const ref = useRef<HTMLDivElement>(null);
  const { row } = paperMetrics(paper);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const h = el.offsetHeight;
      const needed = Math.max(1, Math.ceil((h - 4) / row));
      usePage.getState().setAnswerRows(a.id, needed);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [a.id, a.text, a.status, row]);
  return (
    <div ref={ref} className={`answer${paper === "grid" ? " grid" : ""}`} style={{ left: a.x, top: a.y, width: a.w }} role="note" aria-label="AI 답">
      {formatAnswer(a.text)}
      {a.status === "streaming" && <span className="caret" />}
    </div>
  );
}

function markX(x: number) {
  return Math.max(6, x - 54);
}

function ThreadMarks({ doc, paper }: { doc: PageData; paper: PaperKind }) {
  const { row } = paperMetrics(paper);
  const threads = new Map<string, { y0: number; y1: number; x: number }>();
  for (const q of doc.questions) {
    const b = q.bands[0];
    if (!b) continue;
    const a = doc.answers.find((x) => x.questionId === q.id);
    const x = markX(a?.x ?? b.x);
    const t = threads.get(q.threadId) ?? { y0: Infinity, y1: -Infinity, x };
    t.y0 = Math.min(t.y0, b.y + b.h / 2);
    if (a) t.y1 = Math.max(t.y1, a.y + a.rows * row - row / 2);
    threads.set(q.threadId, t);
  }
  for (const s of doc.slots) {
    const t = threads.get(s.threadId);
    if (t) t.y1 = Math.max(t.y1, s.y + s.rows * row - row / 2);
  }
  return (
    <>
      <svg className="page-svg" height={1} aria-hidden>
        {[...threads.values()].map((t, i) =>
          t.y1 > t.y0 ? (
            <path key={i} className="svg-thread" d={`M${t.x + 14} ${t.y0} C ${t.x + 13} ${t.y0 + 60}, ${t.x + 15} ${t.y1 - 60}, ${t.x + 14} ${t.y1}`} />
          ) : null,
        )}
      </svg>
      {doc.questions.map((q) => {
        const b = q.bands[0];
        const a = doc.answers.find((x) => x.questionId === q.id);
        if (!b) return null;
        return (
          <div key={q.id} className="qnum" style={{ left: markX(a?.x ?? b.x) + 2, top: b.y + b.h / 2 - 12 }} aria-hidden>
            {q.step}
          </div>
        );
      })}
      {doc.answers.map((a) => (
        <div key={a.id} className="stamp" style={{ left: markX(a.x), top: a.y + 3 }} aria-hidden>
          답
        </div>
      ))}
    </>
  );
}

function bandPath(b: Rect) {
  return `M${b.x + 3} ${b.y + 1} L${b.x + b.w} ${b.y - 1} L${b.x + b.w - 2} ${b.y + b.h} L${b.x} ${b.y + b.h + 1} Z`;
}

function pagePoint(e: RPointerEvent | PointerEvent, layer: HTMLElement): [number, number] {
  const r = layer.getBoundingClientRect();
  const s = r.width / PAGE.width;
  return [(e.clientX - r.left) / s, (e.clientY - r.top) / s];
}

function Handles({ q, layer }: { q: ActiveQuery; layer: HTMLElement | null }) {
  if (!q.bands?.length || !q.tokens || !q.span || q.phase !== "confirm" || q.existingQuestionId) return null;
  const first = q.bands[0], last = q.bands[q.bands.length - 1];
  const drag = (which: "start" | "end") => (e: RPointerEvent) => {
    if (!layer) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const cur = usePage.getState().queries.find((x) => x.id === q.id);
      if (!cur?.tokens || !cur.span) return;
      const [x, y] = pagePoint(ev, layer);
      const i = tokenAt(cur.tokens, x, y);
      if (which === "start") adjustSpan(q.id, i, cur.span.end);
      else adjustSpan(q.id, cur.span.start, i);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  const knob = (h: number, top: boolean) => (
    <svg className="svg-handle" viewBox={`0 -12 44 ${h + 24}`} aria-hidden>
      <line x1={22} x2={22} y1={0} y2={h} />
      <circle cx={22} cy={top ? -4 : h + 4} r={4.5} />
    </svg>
  );
  return (
    <>
      <div data-ui className="handle" style={{ left: first.x, top: first.y, height: first.h }} onPointerDown={drag("start")} aria-label="질문 시작 위치">
        {knob(first.h, true)}
      </div>
      <div data-ui className="handle" style={{ left: last.x + last.w, top: last.y, height: last.h }} onPointerDown={drag("end")} aria-label="질문 끝 위치">
        {knob(last.h, false)}
      </div>
    </>
  );
}

const PHASE_LABEL: Record<ActiveQuery["phase"], string> = {
  candidate: "글씨를 읽는 중",
  reading: "질문을 보내는 중",
  confirm: "이 문장이 맞나요?",
  answering: "답을 쓰는 중",
  error: "",
  queued: "연결되면 물어볼게요",
};

function Tag({ q }: { q: ActiveQuery }) {
  const left = useSettings((s) => s.leftHanded);
  const W = 300;
  const startX = q.bands?.[0]?.x ?? q.tagX;
  let x = left ? startX - W - 14 : q.tagX + 16;
  let y = q.tagY - 4;
  let flip = left;
  if (x + W > PAGE.width - 4 || x < 4) {
    x = Math.max(8, Math.min(PAGE.width - W - 8, q.tagX - W));
    y = q.tagY + 40;
    flip = false;
  }
  const busy = q.phase === "candidate" || q.phase === "reading" || q.phase === "answering";
  const close = () => cancelQuery(q.id);
  const needsKey = q.phase === "error" && /키/.test(q.message ?? "");
  const needsAccess = q.phase === "error" && /접근 코드/.test(q.message ?? "");
  return (
    <div data-ui className={`tag${flip ? " flip" : ""}`} style={{ left: x, top: y }} role="status" aria-live="polite">
      {q.existingQuestionId ? <span className="k">이미 답한 질문</span> : q.text && <span className="k">{q.phase === "confirm" ? "이 문장이 맞나요?" : "읽은 문장"}</span>}
      {q.text && <span className="v">{q.text}</span>}
      {q.phase === "error" && <span className="v error">{q.message}</span>}
      <div className="s">
        <span>
          {q.phase !== "error" && q.phase !== "confirm" && PHASE_LABEL[q.phase]}
          {busy && (
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
          )}
        </span>
        <span className="btns">
          {q.phase === "confirm" && (
            <button className="chip primary" onClick={() => void ask(q.id)}>
              {q.existingQuestionId ? "다시 묻기" : "묻기"}
            </button>
          )}
          {(needsKey || needsAccess) && (
            <button className="chip" onClick={() => useUi.getState().setSettingsOpen(true)}>
              설정 열기
            </button>
          )}
          <button className="chip quiet" onClick={close}>
            {busy ? "취소" : "닫기"}
          </button>
        </span>
      </div>
    </div>
  );
}

function SlotChips({ s, hasInk }: { s: SlotItem; hasInk: boolean }) {
  const { row } = paperMetrics(usePage.getState().notebook?.paper ?? "ruled");
  const remove = () =>
    usePage.getState().commit((d) => {
      const rest = { ...d, slots: d.slots.filter((x) => x.id !== s.id), strokes: d.strokes.filter((x) => x.slotId !== s.id) };
      return releaseRows(rest, usePage.getState().notebook?.paper ?? "ruled", s.y, s.rows);
    });
  return (
    <div data-ui className="ask-chip" style={{ left: s.x + s.w, top: s.y + s.rows * row - 36 }}>
      {!hasInk && (
        <button className="chip quiet" onClick={remove}>
          닫기
        </button>
      )}
      <button className="chip" disabled={!hasInk} onClick={() => void submitSlot(s.id)}>
        묻기
      </button>
    </div>
  );
}

function SelectionMenu({ ids, doc }: { ids: string[]; doc: PageData }) {
  const set = new Set(ids);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of doc.strokes) if (set.has(s.id)) {
    const g = strokeGeom(s);
    x0 = Math.min(x0, g.minX); y0 = Math.min(y0, g.minY); x1 = Math.max(x1, g.maxX); y1 = Math.max(y1, g.maxY);
  }
  if (!Number.isFinite(x0)) return null;
  return (
    <>
      <svg className="page-svg" height={1} aria-hidden>
        <rect className="svg-selection" x={x0 - 8} y={y0 - 8} width={x1 - x0 + 16} height={y1 - y0 + 16} rx={6} />
      </svg>
      <div data-ui className="sel-menu" style={{ left: Math.max(4, x0 - 8), top: Math.max(4, y0 - 60) }}>
        <button className="chip primary" onClick={() => currentSurface?.askSelection()}>
          이 부분 묻기
        </button>
        <button className="chip" onClick={() => currentSurface?.deleteSelection()}>
          지우기
        </button>
        <button className="chip quiet" onClick={() => usePage.getState().setSelection([])}>
          닫기
        </button>
      </div>
    </>
  );
}

function AnswerNotes({ a, paper }: { a: AnswerItem; paper: PaperKind }) {
  const { row } = paperMetrics(paper);
  if (a.status === "stale")
    return (
      <div data-ui className="note-line end" style={{ left: a.x + a.w, top: a.y + a.rows * row + 2 }}>
        <span>질문이 바뀜</span>
        <button className="chip" onClick={() => void reask(a.questionId)}>
          다시 묻기
        </button>
      </div>
    );
  if (a.status === "error")
    return (
      <div data-ui className="note-line error" style={{ left: a.x, top: a.y + 4 }}>
        <span>{a.error ?? "답을 받지 못했어요."}</span>
        <button className="chip" onClick={() => void reask(a.questionId)}>
          다시 묻기
        </button>
      </div>
    );
  return null;
}

export function PageSurface() {
  const host = useRef<HTMLDivElement>(null);
  const under = useRef<HTMLDivElement>(null);
  const over = useRef<HTMLDivElement>(null);
  const stat = useRef<HTMLCanvasElement>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const [overEl, setOverEl] = useState<HTMLElement | null>(null);
  const doc = usePage((s) => s.doc);
  const paper = usePage((s) => s.notebook?.paper ?? "ruled");
  const queries = usePage((s) => s.queries);
  const selection = usePage((s) => s.selection);
  const H = pageHeight(paper, doc.extraRows);
  const { row } = paperMetrics(paper);

  useEffect(() => {
    const surface = new Surface({ host: host.current!, staticCanvas: stat.current!, liveCanvas: live.current!, layers: [under.current!, over.current!] });
    currentSurface = surface;
    setOverEl(over.current);
    return () => {
      surface.destroy();
      if (currentSurface === surface) currentSurface = null;
    };
  }, []);

  useEffect(() => {
    currentSurface?.resize();
  }, [H]);

  const slotInk = new Set(doc.strokes.filter((s) => s.slotId).map((s) => s.slotId as string));

  return (
    <div className="surface" ref={host}>
      <div className="page-layer" ref={under} style={{ height: H }}>
        <Paper kind={paper} height={H} extraRows={doc.extraRows} />
        <svg className="page-svg multiply" height={H} aria-hidden>
          {doc.questions.flatMap((q) => q.bands.map((b, i) => <path key={q.id + i} className="svg-band" d={bandPath(b)} />))}
          {queries.flatMap((q) => (q.bands ?? []).map((b, i) => <path key={q.id + i} className="svg-band active" d={bandPath(b)} />))}
        </svg>
        <svg className="page-svg" height={H} aria-hidden>
          {doc.slots.map((s) => (
            <rect key={s.id} className="svg-slot" x={s.x - 6} y={s.y + 2} width={s.w + 12} height={s.rows * row - 4} rx={8} />
          ))}
        </svg>
        {doc.slots.map((s) =>
          slotInk.has(s.id) ? null : (
            <span key={s.id} className="slot-hint" style={{ left: s.x + 8, top: s.y + 2, lineHeight: `${row}px` }} /* tokens-ok: 종이 줄 간격 토큰(pu) */>
              이어서 궁금한 걸 여기에 써 보세요
            </span>
          ),
        )}
        {doc.answers.map((a) => (
          <AnswerText key={a.id} a={a} paper={paper} />
        ))}
      </div>
      <canvas ref={stat} />
      <canvas ref={live} />
      <div className="page-layer over" ref={over} style={{ height: H }}>
        <ThreadMarks doc={doc} paper={paper} />
        <svg className="page-svg" height={1} aria-hidden>
          {queries.flatMap((q) => (q.candidate ?? []).map((r, i) => <rect key={q.id + i} className="svg-candidate" x={r.x} y={r.y} width={r.w} height={r.h} rx={6} />))}
        </svg>
        {queries.map((q) => (
          <Handles key={q.id + "h"} q={q} layer={overEl} />
        ))}
        {doc.slots.map((s) => (
          <SlotChips key={s.id} s={s} hasInk={slotInk.has(s.id)} />
        ))}
        {doc.answers.map((a) => (
          <AnswerNotes key={a.id} a={a} paper={paper} />
        ))}
        {selection.length > 0 && <SelectionMenu ids={selection} doc={doc} />}
        {queries.map((q) => (
          <Tag key={q.id} q={q} />
        ))}
      </div>
    </div>
  );
}

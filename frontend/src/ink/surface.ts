// 쪽 화면의 입력과 그리기. 펜 경로는 React 상태를 거치지 않는다 (CLAUDE.md §9).
import { logEvent } from "../api/client";
import { PAGE, PX_PER_MM, pageHeight, paperMetrics } from "../design/tokens";
import { distToStroke, pointInPolygon, strokeGeom, STRIDE, translateStroke } from "../model/stroke";
import { newId, type InkTool, type PageData, type Stroke } from "../model/types";
import { askSelection, growSlotIfNeeded, openSlot, startQuery, submitSlot, deleteAnswer } from "../question/controller";
import { findWordAt } from "../question/candidate";
import { buildLayout } from "../question/geometry";
import { DoubleTapDetector, isTap, type DetectorEvent, type TapSample, type TapTarget } from "../question/gesture";
import { usePage } from "../store/page";
import { useSettings } from "../store/settings";
import { drawLive, drawStatic, type Camera, type LiveStroke } from "./renderer";

const GUTTER = 18;
const ERASER_R = 7;
const PALM_MS = 400;

interface Active {
  pointerId: number;
  type: string;
  tool: InkTool;
  stroke: LiveStroke;
  t0: number;
  startClient: [number, number];
  moved: number;
}

export interface SurfaceEls {
  host: HTMLElement;
  staticCanvas: HTMLCanvasElement;
  liveCanvas: HTMLCanvasElement;
  layers: HTMLElement[];
}

export class Surface {
  cam: Camera = { scale: 1, x: 0, y: 0 };
  private zoom = 1;
  private w = 0;
  private h = 0;
  private active: Active | null = null;
  private pendingTaps: (TapSample & { stroke: LiveStroke; t1: number })[] = [];
  private detector: DoubleTapDetector;
  private tickTimer: number | undefined;
  private raf = 0;
  private dirtyStatic = true;
  private erasing: { pointerId: number; ids: Set<string>; answers: Map<string, number>; last: [number, number] | null } | null = null;
  private lasso: { pointerId: number; pts: number[] } | null = null;
  private moving: { pointerId: number; ids: Set<string>; start: [number, number]; dx: number; dy: number } | null = null;
  private touches = new Map<number, { x: number; y: number; t: number; sx: number; sy: number }>();
  private pinch: { dist: number; zoom: number; cx: number; cy: number } | null = null;
  private penDown = false;
  private penQuietUntil = 0;
  private unsub: (() => void)[] = [];
  private ro: ResizeObserver;

  constructor(private els: SurfaceEls) {
    const s = useSettings.getState();
    this.detector = new DoubleTapDetector({ enabled: s.doubleTap, allowMouse: s.allowMouse, sensitivity: s.sensitivity });
    const host = els.host;
    host.addEventListener("pointerdown", this.onDown);
    host.addEventListener("pointermove", this.onMove);
    host.addEventListener("pointerup", this.onUp);
    host.addEventListener("pointercancel", this.onCancel);
    host.addEventListener("wheel", this.onWheel, { passive: false });
    host.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.unsub.push(
      usePage.subscribe((st, prev) => {
        if (st.doc !== prev.doc || st.selection !== prev.selection) this.invalidate(true);
        if (st.pageId !== prev.pageId) {
          this.flushTaps();
          this.zoom = 1;
          this.cam.y = GUTTER;
          this.resize();
        }
      }),
      useSettings.subscribe((st) => {
        this.detector.cfg = { enabled: st.doubleTap, allowMouse: st.allowMouse, sensitivity: st.sensitivity };
      }),
    );
    this.resize();
  }

  destroy() {
    const host = this.els.host;
    host.removeEventListener("pointerdown", this.onDown);
    host.removeEventListener("pointermove", this.onMove);
    host.removeEventListener("pointerup", this.onUp);
    host.removeEventListener("pointercancel", this.onCancel);
    host.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKey);
    this.ro.disconnect();
    this.unsub.forEach((u) => u());
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.tickTimer);
    this.flushTaps();
  }

  // ---------- 카메라 ----------

  private paper() {
    return usePage.getState().notebook?.paper ?? "ruled";
  }

  private pageH() {
    return pageHeight(this.paper(), usePage.getState().doc.extraRows);
  }

  resize() {
    const r = this.els.host.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    const fit = Math.min((this.w - GUTTER * 2) / PAGE.width, 1.6);
    const prevScale = this.cam.scale;
    this.cam.scale = Math.max(0.2, fit * this.zoom);
    // 확대 비율이 바뀌면 화면 위쪽 기준으로 같은 자리를 보이게 한다
    if (prevScale !== this.cam.scale && prevScale > 0) this.cam.y = this.cam.y * (this.cam.scale / prevScale);
    this.clamp();
    this.invalidate(true);
  }

  private clamp() {
    const pw = PAGE.width * this.cam.scale;
    const ph = this.pageH() * this.cam.scale;
    if (pw <= this.w - GUTTER * 2) this.cam.x = (this.w - pw) / 2;
    else this.cam.x = Math.min(GUTTER, Math.max(this.w - pw - GUTTER, this.cam.x));
    const minY = Math.min(GUTTER, this.h - ph - GUTTER * 4);
    this.cam.y = Math.min(GUTTER, Math.max(minY, this.cam.y));
  }

  private zoomAt(nextZoom: number, cx: number, cy: number) {
    const z = Math.max(0.6, Math.min(4, nextZoom));
    const fit = Math.min((this.w - GUTTER * 2) / PAGE.width, 1.6);
    const px = (cx - this.cam.x) / this.cam.scale, py = (cy - this.cam.y) / this.cam.scale;
    this.zoom = z;
    this.cam.scale = fit * z;
    this.cam.x = cx - px * this.cam.scale;
    this.cam.y = cy - py * this.cam.scale;
    this.clamp();
    this.invalidate(true);
  }

  private toPage(clientX: number, clientY: number): [number, number] {
    const r = this.els.host.getBoundingClientRect();
    return [(clientX - r.left - this.cam.x) / this.cam.scale, (clientY - r.top - this.cam.y) / this.cam.scale];
  }

  invalidate(statics = false) {
    if (statics) this.dirtyStatic = true;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const t = `translate(${this.cam.x}px, ${this.cam.y}px) scale(${this.cam.scale})`;
      for (const el of this.els.layers) el.style.transform = t;
      const { doc } = usePage.getState();
      if (this.dirtyStatic) {
        this.dirtyStatic = false;
        drawStatic(this.els.staticCanvas, this.w, this.h, this.cam, doc.strokes, {
          hidden: this.erasing?.ids,
          offset: this.moving ? { ids: this.moving.ids, dx: this.moving.dx, dy: this.moving.dy } : undefined,
        });
      }
      const live: LiveStroke[] = this.pendingTaps.map((p) => p.stroke);
      if (this.active) live.push(this.active.stroke);
      drawLive(this.els.liveCanvas, this.w, this.h, this.cam, live, this.lasso?.pts);
    });
  }

  // ---------- 입력 ----------

  private onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-ui]")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.pointerType === "touch") return this.touchDown(e);
    e.preventDefault();
    this.capture(e.pointerId);
    if (e.pointerType === "pen") {
      this.penDown = true;
      this.touches.clear();
      this.pinch = null;
    }
    const tool = useSettings.getState().tool;
    const [x, y] = this.toPage(e.clientX, e.clientY);
    if (tool === "eraser") {
      this.erasing = { pointerId: e.pointerId, ids: new Set(), answers: new Map(), last: null };
      this.eraseAt(x, y);
      return;
    }
    if (tool === "lasso") {
      const sel = usePage.getState().selection;
      if (sel.length && this.insideSelection(x, y)) {
        this.moving = { pointerId: e.pointerId, ids: new Set(sel), start: [x, y], dx: 0, dy: 0 };
      } else {
        usePage.getState().setSelection([]);
        this.lasso = { pointerId: e.pointerId, pts: [x, y] };
      }
      return;
    }
    const s = useSettings.getState();
    const color = tool === "highlighter" ? s.highlightColor : s.inkColor;
    this.active = {
      pointerId: e.pointerId,
      type: e.pointerType,
      tool,
      stroke: { tool, color, size: s.size, pts: [x, y, this.pressure(e), 0] },
      t0: performance.now(),
      startClient: [e.clientX, e.clientY],
      moved: 0,
    };
    this.invalidate();
  };

  /** 포인터 캡처가 실패해도(이미 끝난 포인터 등) 필기는 계속한다 */
  private capture(id: number) {
    try {
      this.els.host.setPointerCapture(id);
    } catch {
      /* 무시 */
    }
  }

  private pressure(e: PointerEvent) {
    if (e.pointerType !== "pen") return 0.5;
    return Math.max(0.05, Math.min(1, e.pressure || 0.5));
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return this.touchMove(e);
    const events = (e.getCoalescedEvents?.() ?? []).length ? e.getCoalescedEvents() : [e];
    if (this.active && this.active.pointerId === e.pointerId) {
      const a = this.active;
      for (const ev of events) {
        const [x, y] = this.toPage(ev.clientX, ev.clientY);
        a.stroke.pts.push(x, y, this.pressure(ev), Math.round(performance.now() - a.t0));
        a.moved = Math.max(a.moved, Math.hypot(ev.clientX - a.startClient[0], ev.clientY - a.startClient[1]));
      }
      this.invalidate();
    } else if (this.erasing && this.erasing.pointerId === e.pointerId) {
      for (const ev of events) this.eraseAt(...this.toPage(ev.clientX, ev.clientY));
    } else if (this.lasso && this.lasso.pointerId === e.pointerId) {
      const [x, y] = this.toPage(e.clientX, e.clientY);
      this.lasso.pts.push(x, y);
      this.invalidate();
    } else if (this.moving && this.moving.pointerId === e.pointerId) {
      const [x, y] = this.toPage(e.clientX, e.clientY);
      this.moving.dx = x - this.moving.start[0];
      this.moving.dy = y - this.moving.start[1];
      this.invalidate(true);
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerType === "touch") return this.touchUp(e);
    if (e.pointerType === "pen") {
      this.penDown = false;
      this.penQuietUntil = performance.now() + PALM_MS;
    }
    if (this.active && this.active.pointerId === e.pointerId) this.finishStroke(this.active);
    else if (this.erasing && this.erasing.pointerId === e.pointerId) this.finishErase();
    else if (this.lasso && this.lasso.pointerId === e.pointerId) this.finishLasso();
    else if (this.moving && this.moving.pointerId === e.pointerId) this.finishMove();
  };

  private onCancel = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      this.touches.delete(e.pointerId);
      this.pinch = null;
      return;
    }
    if (this.active?.pointerId === e.pointerId) this.active = null;
    this.erasing = null;
    this.lasso = null;
    this.moving = null;
    this.invalidate(true);
  };

  // ---------- 획 ----------

  private finishStroke(a: Active) {
    this.active = null;
    const now = performance.now();
    const duration = now - a.t0;
    const moveMm = a.moved / PX_PER_MM;
    const [x, y] = [a.stroke.pts[0], a.stroke.pts[1]];
    const r = this.els.host.getBoundingClientRect();
    if (isTap(duration, moveMm)) {
      const tap = {
        id: newId("tap"),
        x,
        y,
        mmX: (a.startClient[0] - r.left) / PX_PER_MM,
        mmY: (a.startClient[1] - r.top) / PX_PER_MM,
        tDown: a.t0,
        tUp: now,
        pointerType: a.type,
        tool: a.tool,
        target: this.hitTarget(x, y),
        stroke: { ...a.stroke, pts: a.stroke.pts.slice(0, STRIDE) },
        t1: Date.now(),
      };
      this.pendingTaps.push(tap);
      this.handle(this.detector.onTap(tap));
      this.scheduleTick();
      this.invalidate();
      return;
    }
    this.handle(this.detector.onInkStart());
    this.detector.onInkEnd(now);
    const stroke = this.toStroke(a.stroke, Date.now() - Math.round(duration), Date.now());
    this.commitStrokes([stroke]);
  }

  private toStroke(ls: LiveStroke, t0: number, t1: number): Stroke {
    const s: Stroke = { id: newId("s"), tool: ls.tool, color: ls.color, size: ls.size, pts: ls.pts.map((v) => Math.round(v * 10) / 10), t0, t1 };
    const { doc, notebook } = usePage.getState();
    const { row } = paperMetrics(notebook?.paper ?? "ruled");
    const [x, y] = [s.pts[0], s.pts[1]];
    const slot = doc.slots.find((sl) => x >= sl.x && x <= sl.x + sl.w && y >= sl.y && y <= sl.y + sl.rows * row);
    if (slot) s.slotId = slot.id;
    else {
      const ans = doc.answers.find((an) => x >= an.x && x <= an.x + an.w && y >= an.y && y <= an.y + an.rows * row);
      if (ans) s.answerId = ans.id;
    }
    return s;
  }

  private commitStrokes(strokes: Stroke[]) {
    if (!strokes.length) return;
    usePage.getState().commit((d: PageData) => ({ ...d, strokes: [...d.strokes, ...strokes] }));
    for (const s of strokes) if (s.slotId) growSlotIfNeeded(s.slotId, s);
  }

  // ---------- 두 번 톡 ----------

  private hitTarget(x: number, y: number): TapTarget {
    const { doc, notebook } = usePage.getState();
    const paper = notebook?.paper ?? "ruled";
    const { row } = paperMetrics(paper);
    const slot = doc.slots.find((sl) => x >= sl.x && x <= sl.x + sl.w && y >= sl.y && y <= sl.y + sl.rows * row);
    if (slot) {
      const onInk = doc.strokes.some((s) => s.slotId === slot.id && distToStroke(s, x, y) <= 8);
      return onInk ? { kind: "slot", id: slot.id } : { kind: "none" };
    }
    const ans = doc.answers.find((an) => x >= an.x && x <= an.x + an.w && y >= an.y && y <= an.y + an.rows * row);
    if (ans && ans.status !== "streaming") return { kind: "answer", id: ans.id };
    const layout = buildLayout(doc.strokes, paper);
    const word = findWordAt(layout, x, y);
    return word ? { kind: "word", id: word.id } : { kind: "none" };
  }

  private scheduleTick() {
    window.clearTimeout(this.tickTimer);
    const at = this.detector.nextDeadline();
    if (at === null) return;
    this.tickTimer = window.setTimeout(() => {
      this.handle(this.detector.onTick(performance.now()));
      this.scheduleTick();
    }, Math.max(0, at - performance.now()) + 5);
  }

  private handle(events: DetectorEvent[]) {
    for (const ev of events) {
      const ids = new Set((ev.type === "commit" ? ev.taps : [ev.first, ev.second]).map((t) => t.id));
      const taps = this.pendingTaps.filter((p) => ids.has(p.id));
      this.pendingTaps = this.pendingTaps.filter((p) => !ids.has(p.id));
      if (ev.type === "commit") {
        if (ev.reason && ev.reason !== "off" && ev.taps.length > 1) logEvent("gesture_rejected", { reason: ev.reason });
        this.commitStrokes(taps.map((t) => this.toStroke(t.stroke, t.t1 - 50, t.t1)));
      } else {
        logEvent("gesture", { target: ev.target.kind });
        const t = ev.target;
        if (t.kind === "answer") openSlot(t.id);
        else if (t.kind === "slot") void submitSlot(t.id);
        else if (t.kind === "word") void startQuery((ev.first.x + ev.second.x) / 2, (ev.first.y + ev.second.y) / 2);
      }
    }
    this.invalidate();
  }

  private flushTaps() {
    this.handle(this.detector.reset());
  }

  // ---------- 지우개 ----------

  private eraseAt(x: number, y: number) {
    const er = this.erasing;
    if (!er) return;
    const { doc, notebook } = usePage.getState();
    const { row } = paperMetrics(notebook?.paper ?? "ruled");
    const r = ERASER_R / Math.min(1, this.cam.scale);
    for (const s of doc.strokes) {
      if (er.ids.has(s.id)) continue;
      const g = strokeGeom(s);
      if (x < g.minX - r || x > g.maxX + r || y < g.minY - r || y > g.maxY + r) continue;
      if (distToStroke(s, x, y) <= r + 2) er.ids.add(s.id);
    }
    // 답 위를 문지르면 문지른 길이를 모은다
    for (const a of doc.answers) {
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.rows * row && er.last) {
        er.answers.set(a.id, (er.answers.get(a.id) ?? 0) + Math.hypot(x - er.last[0], y - er.last[1]));
      }
    }
    er.last = [x, y];
    this.invalidate(true);
  }

  private finishErase() {
    const er = this.erasing;
    this.erasing = null;
    if (!er) return;
    if (er.ids.size) usePage.getState().commit((d) => ({ ...d, strokes: d.strokes.filter((s) => !er.ids.has(s.id)) }));
    for (const [id, len] of er.answers) if (len > 120) deleteAnswer(id);
    this.invalidate(true);
  }

  // ---------- 올가미 ----------

  private finishLasso() {
    const l = this.lasso;
    this.lasso = null;
    if (!l || l.pts.length < 8) return this.invalidate();
    const { doc } = usePage.getState();
    const ids = doc.strokes
      .filter((s) => {
        let inside = 0, n = 0;
        for (let i = 0; i < s.pts.length; i += STRIDE) {
          n++;
          if (pointInPolygon(s.pts[i], s.pts[i + 1], l.pts)) inside++;
        }
        return n > 0 && inside / n >= 0.5;
      })
      .map((s) => s.id);
    usePage.getState().setSelection(ids);
    this.invalidate();
  }

  private insideSelection(x: number, y: number): boolean {
    const { doc, selection } = usePage.getState();
    const set = new Set(selection);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of doc.strokes) if (set.has(s.id)) {
      const g = strokeGeom(s);
      x0 = Math.min(x0, g.minX); y0 = Math.min(y0, g.minY); x1 = Math.max(x1, g.maxX); y1 = Math.max(y1, g.maxY);
    }
    return x >= x0 - 8 && x <= x1 + 8 && y >= y0 - 8 && y <= y1 + 8;
  }

  private finishMove() {
    const m = this.moving;
    this.moving = null;
    if (!m) return;
    if (Math.hypot(m.dx, m.dy) > 1) {
      usePage.getState().commit((d) => ({ ...d, strokes: d.strokes.map((s) => (m.ids.has(s.id) ? { ...translateStroke(s, m.dx, m.dy), answerId: undefined, slotId: undefined } : s)) }));
    }
    this.invalidate(true);
  }

  askSelection() {
    void askSelection(usePage.getState().selection);
  }

  deleteSelection() {
    const set = new Set(usePage.getState().selection);
    usePage.getState().commit((d) => ({ ...d, strokes: d.strokes.filter((s) => !set.has(s.id)) }));
    usePage.getState().setSelection([]);
  }

  // ---------- 손가락: 이동·확대·두 손가락 톡 ----------

  private touchDown(e: PointerEvent) {
    if (this.penDown || performance.now() < this.penQuietUntil || e.width > 44) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), sx: e.clientX, sy: e.clientY });
    this.capture(e.pointerId);
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
  }

  private touchMove(e: PointerEvent) {
    const t = this.touches.get(e.pointerId);
    if (!t || this.penDown) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;
    if (this.touches.size === 1) {
      this.cam.x += dx;
      this.cam.y += dy;
      this.clamp();
      this.invalidate(true);
    } else if (this.touches.size === 2 && this.pinch) {
      const [a, b] = [...this.touches.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const r = this.els.host.getBoundingClientRect();
      this.cam.x += cx - this.pinch.cx;
      this.cam.y += cy - this.pinch.cy;
      this.pinch.cx = cx;
      this.pinch.cy = cy;
      this.zoomAt(this.pinch.zoom * (dist / Math.max(1, this.pinch.dist)), cx - r.left, cy - r.top);
    }
  }

  private touchUp(e: PointerEvent) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    const all = [...this.touches.values()];
    if (this.touches.size === 2) {
      const quick = all.every((x) => performance.now() - x.t < 260 && Math.hypot(x.x - x.sx, x.y - x.sy) < 12);
      if (quick) usePage.getState().undo();
    }
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = this.els.host.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      this.zoomAt(this.zoom * Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      return;
    }
    this.cam.x -= e.shiftKey ? e.deltaY : e.deltaX;
    this.cam.y -= e.shiftKey ? 0 : e.deltaY;
    this.clamp();
    this.invalidate(true);
  };

  private onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) usePage.getState().redo();
      else usePage.getState().undo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      usePage.getState().redo();
    } else if (e.key === "Escape") usePage.getState().setSelection([]);
    else if ((e.key === "Delete" || e.key === "Backspace") && usePage.getState().selection.length) this.deleteSelection();
  };
}

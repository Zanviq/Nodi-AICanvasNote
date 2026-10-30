// 화면 크기 캔버스 두 장에 획을 그린다: 확정 획(static), 쓰는 중인 획(live).
import { getStroke } from "perfect-freehand";
import { penColor } from "../design/tokens";
import { strokeGeom } from "../model/stroke";
import type { InkTool, PenColor, Stroke } from "../model/types";
import { needsSimulation, outlinePath, strokeOptions, strokePath, toInput } from "./outline";

export interface Camera {
  /** 화면 px / pu */
  scale: number;
  /** 쪽 원점의 화면 위치 */
  x: number;
  y: number;
}

export interface LiveStroke {
  tool: InkTool;
  color: PenColor;
  size: 0 | 1 | 2;
  pts: number[];
}

function prepare(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pw, ph);
  return ctx;
}

function applyCamera(ctx: CanvasRenderingContext2D, cam: Camera) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  ctx.setTransform(dpr * cam.scale, 0, 0, dpr * cam.scale, dpr * cam.x, dpr * cam.y);
}

function paint(ctx: CanvasRenderingContext2D, s: { tool: InkTool; color: PenColor }, path: Path2D) {
  ctx.fillStyle = penColor(s.color);
  if (s.tool === "highlighter") {
    ctx.globalAlpha = 0.45;
    ctx.globalCompositeOperation = "multiply";
  } else if (s.tool === "pencil") {
    ctx.globalAlpha = 0.82;
    ctx.globalCompositeOperation = "source-over";
  } else {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.fill(path);
}

export interface StaticOptions {
  hidden?: Set<string>;
  /** 올가미로 옮기는 중인 획 */
  offset?: { ids: Set<string>; dx: number; dy: number };
  selected?: Set<string>;
}

export function drawStatic(canvas: HTMLCanvasElement, w: number, h: number, cam: Camera, strokes: Stroke[], opt: StaticOptions = {}) {
  const ctx = prepare(canvas, w, h);
  applyCamera(ctx, cam);
  const vx0 = -cam.x / cam.scale, vy0 = -cam.y / cam.scale;
  const vx1 = vx0 + w / cam.scale, vy1 = vy0 + h / cam.scale;
  const visible = (s: Stroke, dx = 0, dy = 0) => {
    const g = strokeGeom(s);
    return g.maxX + dx >= vx0 - 20 && g.minX + dx <= vx1 + 20 && g.maxY + dy >= vy0 - 20 && g.minY + dy <= vy1 + 20;
  };
  // 형광펜이 글씨 아래에 깔리도록 먼저 그린다
  for (const pass of ["highlighter", "ink"] as const) {
    for (const s of strokes) {
      if ((s.tool === "highlighter") !== (pass === "highlighter")) continue;
      if (opt.hidden?.has(s.id)) continue;
      const moving = opt.offset?.ids.has(s.id);
      const dx = moving ? opt.offset!.dx : 0, dy = moving ? opt.offset!.dy : 0;
      if (!visible(s, dx, dy)) continue;
      if (moving) {
        ctx.save();
        ctx.translate(dx, dy);
        paint(ctx, s, strokePath(s));
        ctx.restore();
      } else paint(ctx, s, strokePath(s));
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

export function drawLive(canvas: HTMLCanvasElement, w: number, h: number, cam: Camera, live: LiveStroke[], lasso?: number[]) {
  const ctx = prepare(canvas, w, h);
  applyCamera(ctx, cam);
  for (const s of live) {
    if (!s.pts.length) continue;
    const pts = toInput(s.pts);
    const path = pts.length < 2 ? dot(pts[0][0], pts[0][1], s) : outlinePath(getStroke(pts, strokeOptions(s.tool, s.size, needsSimulation(s.pts), false)));
    paint(ctx, s, path);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  if (lasso && lasso.length >= 4) {
    ctx.beginPath();
    ctx.moveTo(lasso[0], lasso[1]);
    for (let i = 2; i < lasso.length; i += 2) ctx.lineTo(lasso[i], lasso[i + 1]);
    ctx.lineWidth = 1.4 / cam.scale;
    ctx.setLineDash([6 / cam.scale, 5 / cam.scale]);
    ctx.strokeStyle = penColor("graphite");
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function dot(x: number, y: number, s: LiveStroke): Path2D {
  const p = new Path2D();
  const r = s.tool === "highlighter" ? 6 : 1.4 + s.size * 0.5;
  p.arc(x, y, r, 0, Math.PI * 2);
  return p;
}

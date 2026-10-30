// 줄 띠 이미지 만들기 (인식 설계 §3.7). 줄마다 띠를 세로로 쌓고 왼쪽에 줄 번호를 찍는다.
import { strokePath } from "../ink/outline";
import { cssVar } from "../design/tokens";
import type { Stroke } from "../model/types";

export interface RasterLine {
  strokes: Stroke[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const TARGET_H = 34;
const LABEL_W = 44;
const GAP = 18;
const PAD = 8;
const MAX_W = 1600;

export function rasterizeLines(lines: RasterLine[], h: number): string {
  let scale = Math.max(0.6, Math.min(3, TARGET_H / Math.max(1, h)));
  const widest = Math.max(...lines.map((l) => l.maxX - l.minX));
  if (widest * scale + LABEL_W + PAD * 2 > MAX_W) scale = (MAX_W - LABEL_W - PAD * 2) / widest;
  const heights = lines.map((l) => (l.maxY - l.minY) * scale + PAD * 2);
  const width = Math.ceil(widest * scale + LABEL_W + PAD * 2);
  const height = Math.ceil(heights.reduce((a, b) => a + b, 0) + GAP * (lines.length - 1));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  // 인식용 이미지: 흰 바탕에 검은 글씨 (화면 표시가 아니라 토큰 대신 고정 대비를 쓴다)
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  lines.forEach((l, i) => {
    ctx.save();
    ctx.fillStyle = "black";
    ctx.font = `600 ${Math.round(TARGET_H * 0.6)}px ${cssVar("--font-ui") || "sans-serif"}`;
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), 6, y + heights[i] / 2);
    ctx.translate(LABEL_W + PAD, y + PAD);
    ctx.scale(scale, scale);
    ctx.translate(-l.minX, -l.minY);
    for (const s of l.strokes) {
      if (s.tool === "highlighter") continue;
      ctx.fill(strokePath(s));
    }
    ctx.restore();
    y += heights[i] + GAP;
  });
  return canvas.toDataURL("image/png");
}

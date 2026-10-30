// 도구 그림. 색은 CSS 변수만 쓴다.
import type { CSSProperties } from "react";

const f = (v: string): CSSProperties => ({ fill: `var(${v})` });

export function FountainPen({ ink }: { ink: string }) {
  return (
    <svg viewBox="0 0 22 54" aria-hidden>
      <path d="M11 2 L6.5 15 H15.5 Z" style={f("--tool-nib")} />
      <path d="M11 6 V13" style={{ stroke: "var(--tool-nib-line)", strokeWidth: 0.8 }} />
      <rect x="6" y="15" width="10" height="39" rx="2.5" style={f(ink)} />
      <rect x="6" y="22" width="10" height="2" style={f("--tool-nib")} />
    </svg>
  );
}

export function Pencil() {
  return (
    <svg viewBox="0 0 22 54" aria-hidden>
      <path d="M11 3 L6.5 16 H15.5 Z" style={f("--tool-wood")} />
      <path d="M11 3 L9.4 7.6 H12.6 Z" style={f("--tool-lead")} />
      <rect x="6.5" y="16" width="9" height="38" style={f("--tool-pencil-body")} />
      <rect x="9.5" y="16" width="3" height="38" style={f("--tool-pencil-face")} />
    </svg>
  );
}

export function Highlighter({ ink }: { ink: string }) {
  return (
    <svg viewBox="0 0 22 54" aria-hidden>
      <path d="M8 6 L15 9 L16 18 H6 Z" style={f("--tool-hl-tip")} />
      <rect x="5" y="18" width="12" height="36" rx="3" style={f(ink)} />
      <rect x="5" y="18" width="12" height="5" style={f("--tool-hl-tip")} />
    </svg>
  );
}

export function Eraser() {
  return (
    <svg viewBox="0 0 22 54" aria-hidden>
      <rect x="5.5" y="6" width="11" height="22" rx="2" style={{ fill: "var(--tool-eraser)", stroke: "var(--tool-eraser-edge)" }} />
      <rect x="5" y="24" width="12" height="30" rx="1.5" style={f("--tool-eraser-sleeve")} />
    </svg>
  );
}

const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Icon = {
  back: () => (
    <svg className="icon" viewBox="0 0 24 24" style={line} aria-hidden>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  undo: () => (
    <svg className="icon" viewBox="0 0 24 24" style={line} aria-hidden>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  ),
  redo: () => (
    <svg className="icon" viewBox="0 0 24 24" style={line} aria-hidden>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </svg>
  ),
  lasso: () => (
    <svg className="icon" viewBox="0 0 24 24" style={{ ...line, strokeWidth: 1.6 }} aria-hidden>
      <ellipse cx="12" cy="10" rx="8" ry="6" strokeDasharray="3 2.6" />
      <path d="M8 15c-1 3 1 5 3 5" />
    </svg>
  ),
  more: () => (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden style={{ fill: "currentColor" }}>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  ),
  prev: () => (
    <svg className="icon" viewBox="0 0 24 24" style={line} aria-hidden>
      <path d="M14 6l-6 6 6 6" />
    </svg>
  ),
  next: () => (
    <svg className="icon" viewBox="0 0 24 24" style={line} aria-hidden>
      <path d="M10 6l6 6-6 6" />
    </svg>
  ),
  plus: () => (
    <svg className="icon" viewBox="0 0 24 24" style={line} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  trash: () => (
    <svg className="icon" viewBox="0 0 24 24" style={line} aria-hidden>
      <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
    </svg>
  ),
  gear: () => (
    <svg className="icon" viewBox="0 0 24 24" style={line} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </svg>
  ),
};

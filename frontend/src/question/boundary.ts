// 2단계: 문장 경계 점수 (인식 설계 §3.8). 순수 함수.

export const THETA_B = 0.9;
export const B_WEIGHTS = {
  punct: 1.2,
  ending: 0.8,
  connective: -1.0,
  linebreak: 0.8,
  marker: 1.2,
  pause: 0.5,
  hgap: 1.0,
  starter: 0.4,
} as const;

export type BoundaryFeature = keyof typeof B_WEIGHTS;

export interface BToken {
  text: string;
  line: number;
  minX: number;
  maxX: number;
  t0: number;
  t1: number;
}

export interface BoundaryInput {
  tokens: BToken[];
  /** 덩어리 안 이웃 줄 사이 이어짐 점수 C(u, d). continuations[l] = C(줄 l, 줄 l+1) */
  continuations: number[];
  /** 같은 줄 안 덩어리 간격 τs */
  tauS: number;
}

const TRAIL = /[)"'」』\]”’]+$/;
const LIST_TOKEN = /^(\d+|[가-하]|[ㄱ-ㅎ]|[A-Za-z])[.)]$/;
const MARKER = /^([•\-*·∙◦▪–—]|[①-⑳]|\d+[.)]|\(\d+\)|[가-하][.)]|[ㄱ-ㅎ][.)]|[QA][.:])/;
const STRONG_END = /(다|요|까|니|냐|죠)$/;
const NOMINAL_END = /(함|임|음|됨)$/;
const CONNECTIVE = /(고|며|는데|지만|면|서|거나)$/;
const STARTER = /^(그런데|근데|그래서|그러나|하지만|따라서|그럼|그러면|즉|왜|어떻게)/;

function strip(t: string): string {
  return t.replace(TRAIL, "");
}

export function punctValue(token: string): number {
  const t = strip(token);
  if (LIST_TOKEN.test(t)) return 0;
  if (/(\.\.\.|…)$/.test(t)) return 0.5;
  if (/[.?!。？！]$/.test(t)) {
    if (/^\d+\.\d+$/.test(t)) return 0;
    return 1;
  }
  return 0;
}

export function endingValue(token: string): number {
  const t = strip(token).replace(/[.?!。？！,，…~]+$/, "");
  if (STRONG_END.test(t)) return 1;
  if (NOMINAL_END.test(t)) return 0.6;
  return 0;
}

export function connectiveValue(token: string): number {
  const raw = strip(token);
  if (/[?？]$/.test(raw)) return 0;
  if (/[,，]$/.test(raw)) return 1;
  return CONNECTIVE.test(raw) ? 1 : 0;
}

const sigma = (x: number) => 1 / (1 + Math.exp(-x));

function medianPause(tokens: BToken[]): number {
  const v: number[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const d = tokens[i].t0 - tokens[i - 1].t1;
    if (d > 0 && Number.isFinite(d)) v.push(d);
  }
  if (!v.length) return 600;
  v.sort((a, b) => a - b);
  return Math.max(150, v[v.length >> 1]);
}

export function boundaryFeatures(input: BoundaryInput, i: number, m = medianPause(input.tokens)): Record<BoundaryFeature, number> {
  const a = input.tokens[i], b = input.tokens[i + 1];
  const lineBreak = a.line !== b.line;
  let linebreak = 0;
  if (lineBreak) {
    const c = input.continuations[Math.min(a.line, b.line)] ?? 0;
    linebreak = 1 - sigma(c);
  }
  const dt = b.t0 - a.t1;
  let pause = 0;
  if (Number.isFinite(dt)) pause = dt > 60000 ? 1 : Math.min(1, Math.max(0, (dt - m) / (4 * m)));
  return {
    punct: punctValue(a.text),
    ending: endingValue(a.text),
    connective: connectiveValue(a.text),
    linebreak,
    marker: MARKER.test(b.text) ? 1 : 0,
    pause,
    hgap: !lineBreak && b.minX - a.maxX > input.tauS ? 1 : 0,
    starter: STARTER.test(b.text) ? 1 : 0,
  };
}

/** scores[i] = 토큰 i와 i+1 사이 경계 점수 B(i) */
export function boundaryScores(input: BoundaryInput): number[] {
  const m = medianPause(input.tokens);
  const out: number[] = [];
  for (let i = 0; i < input.tokens.length - 1; i++) {
    const f = boundaryFeatures(input, i, m);
    let s = 0;
    for (const k of Object.keys(B_WEIGHTS) as BoundaryFeature[]) s += B_WEIGHTS[k] * f[k];
    out.push(s);
  }
  return out;
}

export interface Sentence {
  start: number;
  end: number;
  text: string;
  scores: number[];
}

/** 앵커 토큰에서 양쪽으로 첫 경계까지 */
export function selectSentence(input: BoundaryInput, anchor: number, theta = THETA_B): Sentence {
  const scores = boundaryScores(input);
  let start = anchor, end = anchor;
  while (start > 0 && scores[start - 1] < theta) start--;
  while (end < input.tokens.length - 1 && scores[end] < theta) end++;
  const text = input.tokens.slice(start, end + 1).map((t) => t.text).join(" ");
  return { start, end, text, scores };
}

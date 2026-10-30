// 답 글자 다듬기: 화학식의 숫자를 아래 첨자로 (CO2 → CO₂)
import type { ReactNode } from "react";

const FORMULA = /\b\d*(?:[A-Z][a-z]?\d*){2,}\b|\b\d*[A-Z][a-z]?\d+\b/g;

export function formatAnswer(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0, k = 0;
  for (const m of text.matchAll(FORMULA)) {
    const word = m[0];
    if (!/[A-Z][a-z]?\d/.test(word)) continue;
    out.push(text.slice(last, m.index));
    const parts = word.split(/(?<=[A-Za-z)])(\d+)/);
    out.push(
      <span key={k++}>
        {parts.map((p, i) => (i % 2 === 1 ? <sub key={i}>{p}</sub> : p))}
      </span>,
    );
    last = (m.index ?? 0) + word.length;
  }
  out.push(text.slice(last));
  return out;
}

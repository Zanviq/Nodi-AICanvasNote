// 화면 코드에 색 값·임의 크기를 직접 쓰지 않았는지 검사한다 (CLAUDE.md §8).
// 값은 src/styles/tokens.css 한 곳에만 둔다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const allow = new Set(["styles/tokens.css"]);
const colorRe = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;
const pxRe = /(?<![\w-])\d*\.?\d+px\b/g;

const problems = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const rel = relative(root, p).replaceAll("\\", "/");
    if (allow.has(rel) || rel.endsWith(".test.ts")) continue;
    if (!/\.(css|tsx?|)$/.test(name)) continue;
    const lines = readFileSync(p, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes("tokens-ok")) return;
      const code = line.replace(/\/\/.*$|\/\*.*?\*\//g, "");
      for (const m of code.matchAll(colorRe)) problems.push(`${rel}:${i + 1}  색 값 ${m[0]}`);
      if (name.endsWith(".css")) for (const m of code.matchAll(pxRe)) problems.push(`${rel}:${i + 1}  크기 값 ${m[0]}`);
    });
  }
};
walk(root);
if (problems.length) {
  console.error(`토큰 검사 실패 (${problems.length}건). tokens.css의 변수 이름을 쓴다.\n` + problems.join("\n"));
  process.exit(1);
}
console.log("토큰 검사 통과");

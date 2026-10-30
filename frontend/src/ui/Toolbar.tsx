import { HIGHLIGHT_PALETTE, INK_PALETTE, PEN_VARS } from "../design/tokens";
import type { Tool } from "../model/types";
import { usePage } from "../store/page";
import { useSettings } from "../store/settings";
import { useUi } from "../store/ui";
import { Eraser, FountainPen, Highlighter, Icon, Pencil } from "./icons";

const TOOL_NAME: Record<Tool, string> = { pen: "펜", pencil: "연필", highlighter: "형광펜", eraser: "지우개", lasso: "올가미" };
const SAVE_TEXT = { saved: "저장됨", dirty: "저장 대기", saving: "저장 중", error: "저장 실패, 다시 시도 중" } as const;

export function Toolbar() {
  const s = useSettings();
  const nb = usePage((x) => x.notebook);
  const pages = usePage((x) => x.pages);
  const pageIndex = usePage((x) => x.pageIndex);
  const canUndo = usePage((x) => x.undoStack.length > 0);
  const canRedo = usePage((x) => x.redoStack.length > 0);
  const saveState = usePage((x) => x.saveState);
  const { undo, redo, goTo, addPage, deletePage } = usePage.getState();

  const pick = (tool: Tool) => s.set({ tool });
  const isHl = s.tool === "highlighter";
  const palette = isHl ? HIGHLIGHT_PALETTE : INK_PALETTE;
  const color = isHl ? s.highlightColor : s.inkColor;
  const nav = (i: number) => {
    location.hash = `#/n/${nb?.id}/${i}`;
    void goTo(i);
  };

  const pen = (tool: Tool, art: JSX.Element) => (
    <button className={`pen${s.tool === tool ? " on" : ""}`} aria-pressed={s.tool === tool} aria-label={TOOL_NAME[tool]} title={TOOL_NAME[tool]} onClick={() => pick(tool)}>
      {art}
    </button>
  );

  return (
    <nav className="bar" aria-label="도구">
      <div className="left">
        <a className="icon-btn" href="#/" aria-label="서재로">
          <Icon.back />
        </a>
        <div className="title">
          <b>{nb?.title ?? ""}</b>
          <span>
            {pageIndex + 1} / {pages.length}쪽
          </span>
        </div>
      </div>

      <div className="tray">
        {pen("pen", <FountainPen ink={PEN_VARS[s.inkColor]} />)}
        {pen("pencil", <Pencil />)}
        {pen("highlighter", <Highlighter ink={PEN_VARS[s.highlightColor]} />)}
        {pen("eraser", <Eraser />)}
        <span className="sep" />
        <button className={`tool-icon${s.tool === "lasso" ? " on" : ""}`} aria-pressed={s.tool === "lasso"} aria-label="올가미" title="올가미" onClick={() => pick("lasso")}>
          <Icon.lasso />
        </button>
        <span className="sep" />
        <div className="inks" role="radiogroup" aria-label="색">
          {palette.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              className={`ink${color === c ? " on" : ""}`}
              onClick={() => s.set(isHl ? { highlightColor: c, tool: "highlighter" } : { inkColor: c, tool: s.tool === "pencil" ? "pencil" : "pen" })}
            >
              <i style={{ background: `var(${PEN_VARS[c]})` }} />
            </button>
          ))}
        </div>
        <span className="sep sizes-sep" />
        <div className="sizes" role="radiogroup" aria-label="굵기">
          {([0, 1, 2] as const).map((z) => (
            <button key={z} role="radio" aria-checked={s.size === z} aria-label={`굵기 ${z + 1}`} className={s.size === z ? "on" : ""} onClick={() => s.set({ size: z })}>
              <i style={{ width: `calc(var(--space-1) + ${z} * var(--space-1) * 0.75)`, height: `calc(var(--space-1) + ${z} * var(--space-1) * 0.75)` }} />
            </button>
          ))}
        </div>
      </div>

      <div className="right">
        <span className={`save${saveState === "error" ? " error" : ""}`} aria-live="polite">
          {SAVE_TEXT[saveState]}
        </span>
        <button className="icon-btn" aria-label="실행 취소" disabled={!canUndo} onClick={undo}>
          <Icon.undo />
        </button>
        <button className="icon-btn" aria-label="다시 실행" disabled={!canRedo} onClick={redo}>
          <Icon.redo />
        </button>
        <button className="toggle" role="switch" aria-checked={s.doubleTap} onClick={() => s.set({ doubleTap: !s.doubleTap })}>
          <span>두 번 톡 질문</span>
          <span className={`switch${s.doubleTap ? " on" : ""}`} />
        </button>
        <div className="pager">
          <button className="icon-btn" aria-label="이전 쪽" disabled={pageIndex <= 0} onClick={() => nav(pageIndex - 1)}>
            <Icon.prev />
          </button>
          <button className="icon-btn" aria-label="다음 쪽" disabled={pageIndex >= pages.length - 1} onClick={() => nav(pageIndex + 1)}>
            <Icon.next />
          </button>
          <button className="icon-btn" aria-label="쪽 추가" onClick={() => void addPage().then(() => (location.hash = `#/n/${nb?.id}/${usePage.getState().pageIndex}`))}>
            <Icon.plus />
          </button>
          <button
            className="icon-btn"
            aria-label="이 쪽 지우기"
            disabled={pages.length <= 1}
            onClick={() => window.confirm("이 쪽을 지울까요?") && void deletePage()}
          >
            <Icon.trash />
          </button>
        </div>
        <button className="icon-btn" aria-label="설정" onClick={() => useUi.getState().setSettingsOpen(true)}>
          <Icon.gear />
        </button>
      </div>
    </nav>
  );
}

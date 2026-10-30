import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Notebook, PaperKind } from "../model/types";
import { useUi } from "../store/ui";
import { Icon } from "./icons";

const PAPER_NAME: Record<PaperKind, string> = { ruled: "괘선", grid: "모눈", plain: "무지" };
const COVERS = ["--color-cover-1", "--color-cover-2", "--color-cover-3", "--color-cover-4"];

function coverVar(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COVERS[h % COVERS.length];
}

function PaperSwatch({ kind }: { kind: PaperKind }) {
  const cls = kind === "grid" ? "paper grid" : "paper";
  return (
    <span className="swatch" style={{ position: "relative", overflow: "hidden", display: "block" }}>
      <span className={cls} style={{ boxShadow: "none" }}>
        {kind === "ruled" && <span className="rules" style={{ top: "18%" }} />}
        {kind === "ruled" && <span className="margin-line" style={{ left: "16%" }} />}
        {kind === "grid" && <span className="grid-lines" />}
      </span>
    </span>
  );
}

function NewNotebook({ onDone }: { onDone: (nb: Notebook | null) => void }) {
  const [title, setTitle] = useState("");
  const [paper, setPaper] = useState<PaperKind>("ruled");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const create = async () => {
    setBusy(true);
    try {
      onDone(await api.createNotebook(title.trim() || "새 노트", paper));
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onDone(null)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-title">
        <h2 id="new-title">새 노트</h2>
        <label className="field">
          <span>이름</span>
          <input type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="생명과학 노트" onKeyDown={(e) => e.key === "Enter" && create()} />
        </label>
        <div className="field">
          <span>종이</span>
          <div className="papers" role="radiogroup" aria-label="종이">
            {(Object.keys(PAPER_NAME) as PaperKind[]).map((k) => (
              <button key={k} role="radio" aria-checked={paper === k} className={`paper-choice${paper === k ? " on" : ""}`} onClick={() => setPaper(k)}>
                <PaperSwatch kind={k} />
                <span>{PAPER_NAME[k]}</span>
              </button>
            ))}
          </div>
        </div>
        {err && <span className="status-line warn">{err}</span>}
        <div className="foot">
          <button className="chip" onClick={() => onDone(null)}>
            닫기
          </button>
          <button className="chip primary" disabled={busy} onClick={create}>
            만들기
          </button>
        </div>
      </div>
    </div>
  );
}

export function Library() {
  const [books, setBooks] = useState<Notebook[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");

  const reload = () =>
    api
      .listNotebooks()
      .then((b) => {
        setBooks(b);
        setError("");
      })
      .catch((e) => setError((e as Error).message));

  useEffect(() => {
    void reload();
  }, []);

  const rename = async (id: string) => {
    if (name.trim()) await api.renameNotebook(id, name.trim());
    setRenaming(null);
    void reload();
  };

  const remove = async (nb: Notebook) => {
    if (!window.confirm(`「${nb.title}」 노트를 지울까요? 모든 쪽이 함께 지워져요.`)) return;
    await api.deleteNotebook(nb.id);
    void reload();
  };

  return (
    <main className="library">
      <header className="library-head">
        <h1>내 노트</h1>
        <div className="actions">
          <button className="icon-btn" aria-label="설정" onClick={() => useUi.getState().setSettingsOpen(true)}>
            <Icon.gear />
          </button>
          <button className="chip primary" onClick={() => setCreating(true)}>
            새 노트
          </button>
        </div>
      </header>

      {error && (
        <p className="empty-note">
          {error}{" "}
          <button className="chip" onClick={() => useUi.getState().setSettingsOpen(true)}>
            설정 열기
          </button>
        </p>
      )}
      {!books && !error && <p className="empty-note">노트를 불러오는 중…</p>}

      {books && (
        <section className="shelf" aria-label="노트 목록">
          {books.map((nb) => (
            <article key={nb.id} className="cover">
              <a href={`#/n/${nb.id}`} className="cover-face" style={{ background: `var(${coverVar(nb.id)})`, display: "block" }} aria-label={`${nb.title} 열기`}>
                <span className="spine" />
                <span className="label">{nb.title}</span>
                <span className="kind">
                  {PAPER_NAME[nb.paper]} · {nb.pageCount}쪽
                </span>
              </a>
              <div className="cover-meta">
                {renaming === nb.id ? (
                  <input className="rename" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => rename(nb.id)} onKeyDown={(e) => e.key === "Enter" && rename(nb.id)} aria-label="노트 이름" />
                ) : (
                  <>
                    <span>{new Date(nb.updatedAt).toLocaleDateString("ko-KR")}</span>
                    <span className="menu">
                      <button className="chip quiet" onClick={() => { setName(nb.title); setRenaming(nb.id); }}>
                        이름 바꾸기
                      </button>
                      <button className="icon-btn" aria-label={`${nb.title} 지우기`} onClick={() => remove(nb)}>
                        <Icon.trash />
                      </button>
                    </span>
                  </>
                )}
              </div>
            </article>
          ))}
          <button className="cover-new" onClick={() => setCreating(true)}>
            새 노트 만들기
          </button>
        </section>
      )}
      {books && !books.length && <p className="empty-note">아직 노트가 없어요. 첫 노트를 만들어 필기를 시작해 보세요.</p>}

      {creating && (
        <NewNotebook
          onDone={(nb) => {
            setCreating(false);
            if (nb) location.hash = `#/n/${nb.id}`;
          }}
        />
      )}
    </main>
  );
}

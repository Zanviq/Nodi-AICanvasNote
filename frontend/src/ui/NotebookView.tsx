import { useEffect, useState } from "react";
import { api, flushEvents } from "../api/client";
import { usePage } from "../store/page";
import { PageSurface } from "./PageSurface";
import { Toolbar } from "./Toolbar";

export function NotebookView({ notebookId, pageIndex }: { notebookId: string; pageIndex: number }) {
  const [error, setError] = useState("");
  const notebook = usePage((s) => s.notebook);
  const loading = usePage((s) => s.loading);
  const pageError = usePage((s) => s.error);

  useEffect(() => {
    let alive = true;
    api
      .listNotebooks()
      .then((list) => {
        const nb = list.find((n) => n.id === notebookId);
        if (!alive) return;
        if (!nb) setError("노트를 찾을 수 없어요.");
        else void usePage.getState().open(nb, pageIndex);
      })
      .catch((e) => alive && setError((e as Error).message));
    const leave = () => {
      void usePage.getState().flush();
      flushEvents();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", leave);
    return () => {
      alive = false;
      leave();
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", leave);
    };
    // 쪽 번호는 처음 열 때만 쓴다. 이후 이동은 툴바가 맡는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId]);

  if (error || pageError)
    return (
      <div className="loading">
        <p>
          {error || pageError} <a href="#/">서재로</a>
        </p>
      </div>
    );
  if (!notebook) return <div className="loading">노트를 여는 중…</div>;

  return (
    <div className="notebook">
      <Toolbar />
      {loading ? <div className="loading">쪽을 여는 중…</div> : <PageSurface />}
    </div>
  );
}

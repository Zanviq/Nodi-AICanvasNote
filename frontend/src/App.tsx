import { useEffect, useState } from "react";
import { api } from "./api/client";
import { useSettings } from "./store/settings";
import { useUi } from "./store/ui";
import { Library } from "./ui/Library";
import { NotebookView } from "./ui/NotebookView";
import { Settings } from "./ui/Settings";

function parseHash(): { notebookId?: string; page?: number } {
  const m = location.hash.match(/^#\/n\/([^/]+)(?:\/(\d+))?/);
  return m ? { notebookId: m[1], page: m[2] ? Number(m[2]) : 0 } : {};
}

export function App() {
  const [route, setRoute] = useState(parseHash);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const setConfig = useUi((s) => s.setConfig);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const accessToken = useSettings((s) => s.accessToken);

  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    api
      .config()
      .then((c) => {
        setConfig(c);
        if (c.accessRequired && !useSettings.getState().accessToken) setSettingsOpen(true);
      })
      .catch(() => setConfig(null));
  }, [accessToken, setConfig, setSettingsOpen]);

  return (
    <>
      {route.notebookId ? <NotebookView key={route.notebookId} notebookId={route.notebookId} pageIndex={route.page ?? 0} /> : <Library />}
      {settingsOpen && <Settings />}
    </>
  );
}

// 백엔드 API 클라이언트 (작업 설계 §6.2). 키와 접근 코드는 헤더로만 보낸다 (D-019).
import type { Notebook, Page, PageData, PageMeta, PaperKind } from "../model/types";
import { useSettings } from "../store/settings";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function headers(json = true): Record<string, string> {
  const s = useSettings.getState();
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (s.geminiKey.trim()) h["X-Gemini-Key"] = s.geminiKey.trim();
  if (s.accessToken.trim()) h["X-Access-Token"] = s.accessToken.trim();
  return h;
}

async function toError(res: Response): Promise<ApiError> {
  let code = "http", message = `요청이 실패했어요 (${res.status}).`;
  try {
    const body = await res.json();
    const d = body?.detail;
    if (typeof d === "string") message = d;
    else if (d && typeof d === "object") {
      code = d.code ?? code;
      message = d.message ?? message;
    }
  } catch {
    /* 본문 없음 */
  }
  return new ApiError(res.status, code, message);
}

async function req<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers: headers(body !== undefined), body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "offline", "서버에 연결할 수 없어요.");
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface ServerConfig {
  serverKey: boolean;
  visionModel: string;
  answerModel: string;
  accessRequired?: boolean;
}

export interface ThreadPair {
  q: string;
  a: string;
}

export interface AnswerRequest {
  question: string;
  nearby?: string;
  title?: string;
  thread?: ThreadPair[];
}

export const api = {
  config: () => req<ServerConfig>("GET", "/config"),
  listNotebooks: () => req<Notebook[]>("GET", "/notebooks"),
  createNotebook: (title: string, paper: PaperKind) => req<Notebook>("POST", "/notebooks", { title, paper }),
  renameNotebook: (id: string, title: string) => req<Notebook>("PATCH", `/notebooks/${id}`, { title }),
  deleteNotebook: (id: string) => req<void>("DELETE", `/notebooks/${id}`),
  listPages: (notebookId: string) => req<PageMeta[]>("GET", `/notebooks/${notebookId}/pages`),
  addPage: (notebookId: string, after?: number) => req<Page>("POST", `/notebooks/${notebookId}/pages`, after === undefined ? {} : { after }),
  getPage: (id: string) => req<Page>("GET", `/pages/${id}`),
  savePage: (id: string, data: PageData) => req<{ id: string; updatedAt: string }>("PUT", `/pages/${id}`, { data }),
  deletePage: (id: string) => req<void>("DELETE", `/pages/${id}`),
  recognize: (image: string, lineCount: number, signal?: AbortSignal) =>
    req<{ lines: { index: number; text: string }[] }>("POST", "/recognize", { image, lineCount }, signal),

  /** 답을 SSE로 받는다. delta마다 onDelta를 부르고, 끝나면 전체 글을 돌려준다. */
  async answer(body: AnswerRequest, onDelta: (d: string) => void, signal?: AbortSignal): Promise<string> {
    let res: Response;
    try {
      res = await fetch("/api/answer", { method: "POST", headers: headers(), body: JSON.stringify(body), signal });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ApiError(0, "offline", "서버에 연결할 수 없어요.");
    }
    if (!res.ok || !res.body) throw await toError(res);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", full = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let cut: number;
      while ((cut = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const msg = JSON.parse(line.slice(5).trim());
          if (typeof msg.delta === "string") {
            full += msg.delta;
            onDelta(msg.delta);
          } else if (msg.error) throw new ApiError(502, "gemini_error", String(msg.error));
          else if (msg.done) return full;
        }
      }
    }
    return full;
  },
};

// 연구용 이벤트: 동의했을 때만 모아서 보낸다 (인식 설계 §3.15)
const queue: { type: string; at: string; data: Record<string, unknown> }[] = [];
let timer: number | undefined;

export function logEvent(type: string, data: Record<string, unknown> = {}): void {
  if (!useSettings.getState().research) return;
  queue.push({ type, at: new Date().toISOString(), data });
  if (timer === undefined) timer = window.setTimeout(flushEvents, 4000);
}

export function flushEvents(): void {
  timer = undefined;
  if (!queue.length) return;
  const events = queue.splice(0, queue.length);
  req("POST", "/events", { events }).catch(() => {
    /* 연구 기록 실패는 사용자 흐름을 막지 않는다 */
  });
}

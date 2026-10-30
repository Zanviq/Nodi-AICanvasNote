// 사용자 설정과 도구 상태. 이 기기 브라우저에만 저장한다.
import { create } from "zustand";
import type { Sensitivity } from "../question/gesture";
import type { PenColor, Tool } from "../model/types";

export interface SettingsState {
  geminiKey: string;
  accessToken: string;
  doubleTap: boolean;
  sensitivity: Sensitivity;
  allowMouse: boolean;
  leftHanded: boolean;
  research: boolean;
  tool: Tool;
  inkColor: PenColor;
  highlightColor: PenColor;
  size: 0 | 1 | 2;
  set: (patch: Partial<Omit<SettingsState, "set">>) => void;
}

const KEY = "canvas-note-settings";
const PERSIST: (keyof SettingsState)[] = [
  "geminiKey", "accessToken", "doubleTap", "sensitivity", "allowMouse", "leftHanded", "research", "tool", "inkColor", "highlightColor", "size",
];

function load(): Partial<SettingsState> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  geminiKey: "",
  accessToken: "",
  doubleTap: true,
  sensitivity: 1,
  allowMouse: true,
  leftHanded: false,
  research: false,
  tool: "pen",
  inkColor: "blueblack",
  highlightColor: "hlYellow",
  size: 1,
  ...load(),
  set: (patch) => {
    set(patch);
    try {
      const s = get();
      const out: Record<string, unknown> = {};
      for (const k of PERSIST) out[k] = s[k];
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch {
      /* 저장 공간을 못 쓰면 이번 세션에만 둔다 */
    }
  },
}));

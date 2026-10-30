// 화면 전체 상태: 설정 창, 서버 설정
import { create } from "zustand";
import type { ServerConfig } from "../api/client";

interface UiState {
  settingsOpen: boolean;
  config: ServerConfig | null;
  setSettingsOpen: (v: boolean) => void;
  setConfig: (c: ServerConfig | null) => void;
}

export const useUi = create<UiState>((set) => ({
  settingsOpen: false,
  config: null,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setConfig: (config) => set({ config }),
}));

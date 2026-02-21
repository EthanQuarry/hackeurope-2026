import { create } from "zustand"

export type ActiveView = "overview" | "proximity" | "signal" | "anomaly"

interface UIState {
  activeView: ActiveView
  leftPanelCollapsed: boolean
  rightPanelCollapsed: boolean
  terminalOpen: boolean
  leftActiveTab: "threats" | "comms"
  rightActiveTab: "fleet" | "responses"

  setActiveView: (view: ActiveView) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  toggleTerminal: () => void
  setLeftActiveTab: (tab: "threats" | "comms") => void
  setRightActiveTab: (tab: "fleet" | "responses") => void
}

export const useUIStore = create<UIState>((set) => ({
  activeView: "overview",
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  terminalOpen: false,
  leftActiveTab: "threats",
  rightActiveTab: "fleet",

  setActiveView: (view) => set({ activeView: view }),
  toggleLeftPanel: () => set((s) => ({ leftPanelCollapsed: !s.leftPanelCollapsed })),
  toggleRightPanel: () => set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  setLeftActiveTab: (tab) => set({ leftActiveTab: tab }),
  setRightActiveTab: (tab) => set({ rightActiveTab: tab }),
}))

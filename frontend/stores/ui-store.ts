import { create } from "zustand"

interface UIState {
  leftPanelCollapsed: boolean
  rightPanelCollapsed: boolean
  terminalOpen: boolean
  leftActiveTab: "threats" | "comms"
  rightActiveTab: "fleet" | "responses"

  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  toggleTerminal: () => void
  setLeftActiveTab: (tab: "threats" | "comms") => void
  setRightActiveTab: (tab: "fleet" | "responses") => void
}

export const useUIStore = create<UIState>((set) => ({
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  terminalOpen: false,
  leftActiveTab: "threats",
  rightActiveTab: "fleet",

  toggleLeftPanel: () => set((s) => ({ leftPanelCollapsed: !s.leftPanelCollapsed })),
  toggleRightPanel: () => set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  setLeftActiveTab: (tab) => set({ leftActiveTab: tab }),
  setRightActiveTab: (tab) => set({ rightActiveTab: tab }),
}))

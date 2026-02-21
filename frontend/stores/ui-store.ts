import { create } from "zustand"

export type ActiveView = "overview" | "proximity" | "signal" | "anomaly" | "comms" | "satellite-detail"
export type Planet = "earth" | "moon" | "mars"

interface UIState {
  activeView: ActiveView
  activePlanet: Planet
  leftPanelCollapsed: boolean
  rightPanelCollapsed: boolean
  terminalOpen: boolean
  leftActiveTab: "threats" | "comms"
  rightActiveTab: "fleet" | "responses"

  setActiveView: (view: ActiveView) => void
  setActivePlanet: (planet: Planet) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  toggleTerminal: () => void
  setLeftActiveTab: (tab: "threats" | "comms") => void
  setRightActiveTab: (tab: "fleet" | "responses") => void
}

export const useUIStore = create<UIState>((set) => ({
  activeView: "overview",
  activePlanet: "earth",
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  terminalOpen: false,
  leftActiveTab: "threats",
  rightActiveTab: "fleet",

  setActiveView: (view) => set({ activeView: view }),
  setActivePlanet: (planet) => set({ activePlanet: planet }),
  toggleLeftPanel: () => set((s) => ({ leftPanelCollapsed: !s.leftPanelCollapsed })),
  toggleRightPanel: () => set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  setLeftActiveTab: (tab) => set({ leftActiveTab: tab }),
  setRightActiveTab: (tab) => set({ rightActiveTab: tab }),
}))

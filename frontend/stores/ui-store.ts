import { create } from "zustand"

export type ActiveView = "overview" | "proximity" | "signal" | "anomaly" | "orbital" | "comms" | "satellite-detail" | "adversary-detail" | "fleet-risk" | "agent-ops"
export type Planet = "earth" | "moon" | "mars"

interface UIState {
  activeView: ActiveView
  activePlanet: Planet
  leftPanelCollapsed: boolean
  rightPanelCollapsed: boolean
  terminalOpen: boolean
  leftActiveTab: "threats" | "comms"
  rightActiveTab: "fleet" | "responses"
  selectedAdversaryId: string | null

  setActiveView: (view: ActiveView) => void
  setActivePlanet: (planet: Planet) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  toggleTerminal: () => void
  setLeftActiveTab: (tab: "threats" | "comms") => void
  setRightActiveTab: (tab: "fleet" | "responses") => void
  openAdversaryDetail: (satelliteId: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeView: "overview",
  activePlanet: "earth",
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  terminalOpen: false,
  leftActiveTab: "threats",
  rightActiveTab: "fleet",
  selectedAdversaryId: null,

  setActiveView: (view) => set({ activeView: view }),
  setActivePlanet: (planet) => set({ activePlanet: planet }),
  toggleLeftPanel: () => set((s) => ({ leftPanelCollapsed: !s.leftPanelCollapsed })),
  toggleRightPanel: () => set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  setLeftActiveTab: (tab) => set({ leftActiveTab: tab }),
  setRightActiveTab: (tab) => set({ rightActiveTab: tab }),
  openAdversaryDetail: (satelliteId) => set({ selectedAdversaryId: satelliteId, activeView: "adversary-detail" }),
}))

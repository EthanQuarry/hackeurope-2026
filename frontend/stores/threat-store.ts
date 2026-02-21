import { create } from "zustand"
import type { ThreatData, GlobalThreatLevel, DebrisData } from "@/types"

interface ThreatState {
  threats: ThreatData[]
  debris: DebrisData[]
  globalThreatLevel: GlobalThreatLevel
  selectedThreatId: string | null

  setThreats: (threats: ThreatData[]) => void
  setDebris: (debris: DebrisData[]) => void
  setGlobalThreatLevel: (level: GlobalThreatLevel) => void
  selectThreat: (id: string | null) => void
}

export const useThreatStore = create<ThreatState>((set) => ({
  threats: [],
  debris: [],
  globalThreatLevel: "NOMINAL",
  selectedThreatId: null,

  setThreats: (threats) => set({ threats }),
  setDebris: (debris) => set({ debris }),
  setGlobalThreatLevel: (level) => set({ globalThreatLevel: level }),
  selectThreat: (id) => set({ selectedThreatId: id }),
}))

import { create } from "zustand"
import type { ThreatData, GlobalThreatLevel, DebrisData } from "@/types"

interface FocusTarget {
  lat: number
  lon: number
  altKm: number
}

interface ThreatState {
  threats: ThreatData[]
  debris: DebrisData[]
  globalThreatLevel: GlobalThreatLevel
  selectedThreatId: string | null
  focusTarget: FocusTarget | null

  setThreats: (threats: ThreatData[]) => void
  setDebris: (debris: DebrisData[]) => void
  setGlobalThreatLevel: (level: GlobalThreatLevel) => void
  selectThreat: (id: string | null) => void
  setFocusTarget: (target: FocusTarget | null) => void
}

export const useThreatStore = create<ThreatState>((set) => ({
  threats: [],
  debris: [],
  globalThreatLevel: "NOMINAL",
  selectedThreatId: null,
  focusTarget: null,

  setThreats: (threats) => set({ threats }),
  setDebris: (debris) => set({ debris }),
  setGlobalThreatLevel: (level) => set({ globalThreatLevel: level }),
  selectThreat: (id) => set({ selectedThreatId: id }),
  setFocusTarget: (target) => set({ focusTarget: target }),
}))

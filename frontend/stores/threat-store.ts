import { create } from "zustand"
import type { ThreatData, GlobalThreatLevel, DebrisData, ProximityThreat, SignalThreat, AnomalyThreat } from "@/types"

interface FocusTarget {
  lat: number
  lon: number
  altKm: number
}

interface ThreatState {
  threats: ThreatData[]
  debris: DebrisData[]
  proximityThreats: ProximityThreat[]
  signalThreats: SignalThreat[]
  anomalyThreats: AnomalyThreat[]
  globalThreatLevel: GlobalThreatLevel
  selectedThreatId: string | null
  focusTarget: FocusTarget | null

  setThreats: (threats: ThreatData[]) => void
  setDebris: (debris: DebrisData[]) => void
  setProximityThreats: (threats: ProximityThreat[]) => void
  setSignalThreats: (threats: SignalThreat[]) => void
  setAnomalyThreats: (threats: AnomalyThreat[]) => void
  setGlobalThreatLevel: (level: GlobalThreatLevel) => void
  selectThreat: (id: string | null) => void
  setFocusTarget: (target: FocusTarget | null) => void
}

export const useThreatStore = create<ThreatState>((set) => ({
  threats: [],
  debris: [],
  proximityThreats: [],
  signalThreats: [],
  anomalyThreats: [],
  globalThreatLevel: "NOMINAL",
  selectedThreatId: null,
  focusTarget: null,

  setThreats: (threats) => set({ threats }),
  setDebris: (debris) => set({ debris }),
  setProximityThreats: (threats) => set({ proximityThreats: threats }),
  setSignalThreats: (threats) => set({ signalThreats: threats }),
  setAnomalyThreats: (threats) => set({ anomalyThreats: threats }),
  setGlobalThreatLevel: (level) => set({ globalThreatLevel: level }),
  selectThreat: (id) => set({ selectedThreatId: id }),
  setFocusTarget: (target) => set({ focusTarget: target }),
}))

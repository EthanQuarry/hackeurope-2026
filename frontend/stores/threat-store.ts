import { create } from "zustand"
import type { ThreatData, GlobalThreatLevel, DebrisData, ProximityThreat, SignalThreat, AnomalyThreat, OrbitalSimilarityThreat, GeoLoiterThreat } from "@/types"

interface FocusTarget {
  lat: number
  lon: number
  altKm: number
  /** If set, camera continuously tracks this satellite instead of staying at a fixed point */
  satelliteId?: string
}

interface ThreatState {
  threats: ThreatData[]
  debris: DebrisData[]
  proximityThreats: ProximityThreat[]
  signalThreats: SignalThreat[]
  anomalyThreats: AnomalyThreat[]
  orbitalSimilarityThreats: OrbitalSimilarityThreat[]
  geoUsLoiterThreats: GeoLoiterThreat[]
  globalThreatLevel: GlobalThreatLevel
  selectedThreatId: string | null
  focusTarget: FocusTarget | null

  setThreats: (threats: ThreatData[]) => void
  setDebris: (debris: DebrisData[]) => void
  setProximityThreats: (threats: ProximityThreat[]) => void
  setSignalThreats: (threats: SignalThreat[]) => void
  setAnomalyThreats: (threats: AnomalyThreat[]) => void
  setOrbitalSimilarityThreats: (threats: OrbitalSimilarityThreat[]) => void
  setGeoUsLoiterThreats: (threats: GeoLoiterThreat[]) => void
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
  orbitalSimilarityThreats: [],
  geoUsLoiterThreats: [],
  globalThreatLevel: "NOMINAL",
  selectedThreatId: null,
  focusTarget: null,

  setThreats: (threats) => set({ threats }),
  setDebris: (debris) => set({ debris }),
  setProximityThreats: (threats) => set({ proximityThreats: threats }),
  setSignalThreats: (threats) => set({ signalThreats: threats }),
  setAnomalyThreats: (threats) => set({ anomalyThreats: threats }),
  setOrbitalSimilarityThreats: (threats) => set({ orbitalSimilarityThreats: threats }),
  setGeoUsLoiterThreats: (threats) => set({ geoUsLoiterThreats: threats }),
  setGlobalThreatLevel: (level) => set({ globalThreatLevel: level }),
  selectThreat: (id) => set({ selectedThreatId: id }),
  setFocusTarget: (target) => set({ focusTarget: target }),
}))

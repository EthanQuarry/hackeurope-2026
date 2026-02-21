import { create } from "zustand"
import type { SatelliteData } from "@/types"

interface FleetState {
  satellites: SatelliteData[]
  selectedSatelliteId: string | null
  hoveredSatelliteId: string | null

  setSatellites: (sats: SatelliteData[]) => void
  selectSatellite: (id: string | null) => void
  hoverSatellite: (id: string | null) => void
}

export const useFleetStore = create<FleetState>((set) => ({
  satellites: [],
  selectedSatelliteId: null,
  hoveredSatelliteId: null,

  setSatellites: (sats) => set({ satellites: sats }),
  selectSatellite: (id) => set({ selectedSatelliteId: id }),
  hoverSatellite: (id) => set({ hoveredSatelliteId: id }),
}))

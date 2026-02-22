import { create } from "zustand"

interface GlobeState {
  simTime: number
  speed: number
  playing: boolean
  showLabels: boolean
  activeDemo: string | null
  cinematicActive: boolean

  setSimTime: (t: number) => void
  setSpeed: (speed: number) => void
  togglePlaying: () => void
  toggleLabels: () => void
  setActiveDemo: (id: string | null) => void
  setCinematicActive: (active: boolean) => void
}

export const useGlobeStore = create<GlobeState>((set) => ({
  simTime: 0,
  speed: 1,
  playing: true,
  showLabels: true,
  activeDemo: null,
  cinematicActive: false,

  setSimTime: (t) => set({ simTime: t }),
  setSpeed: (speed) => set({ speed }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  setActiveDemo: (id) => set({ activeDemo: id }),
  setCinematicActive: (active) => set({ cinematicActive: active }),
}))

import { create } from "zustand"

interface GlobeState {
  simTime: number
  speed: number
  playing: boolean
  showLabels: boolean
  activeDemo: string | null
  cinematicActive: boolean
  priorAdversarial: number

  setSimTime: (t: number) => void
  setSpeed: (speed: number) => void
  togglePlaying: () => void
  toggleLabels: () => void
  setActiveDemo: (id: string | null) => void
  setCinematicActive: (active: boolean) => void
  setPriorAdversarial: (v: number) => void
}

export const useGlobeStore = create<GlobeState>((set) => ({
  simTime: typeof window !== "undefined" ? Date.now() : 0,
  speed: 1,
  playing: true,
  showLabels: true,
  activeDemo: null,
  cinematicActive: false,
  priorAdversarial: 0.9,

  setSimTime: (t) => set({ simTime: t }),
  setSpeed: (speed) => set({ speed }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  setActiveDemo: (id) => set({ activeDemo: id }),
  setCinematicActive: (active) => set({ cinematicActive: active }),
  setPriorAdversarial: (v) => set({ priorAdversarial: v }),
}))

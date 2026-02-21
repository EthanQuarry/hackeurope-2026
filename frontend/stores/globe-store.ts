import { create } from "zustand"

interface GlobeState {
  simTime: number
  speed: number
  playing: boolean

  setSimTime: (t: number) => void
  setSpeed: (speed: number) => void
  togglePlaying: () => void
}

export const useGlobeStore = create<GlobeState>((set) => ({
  simTime: 0,
  speed: 1,
  playing: true,

  setSimTime: (t) => set({ simTime: t }),
  setSpeed: (speed) => set({ speed }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
}))

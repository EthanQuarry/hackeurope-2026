/** Simulation speed presets — real-world time compression */
export const SPEED_PRESETS = [
  { label: "Real Time",     multiplier: 1 },
  { label: "1 Day / 2hr",   multiplier: 10 },
  { label: "1 Day / 24min", multiplier: 60 },
  { label: "1 Day / 5min",  multiplier: 300 },
] as const

export type SpeedPreset = (typeof SPEED_PRESETS)[number]

/** Polling intervals (ms) */
export const DEBRIS_REFRESH_MS = 15_000
export const ORBIT_REFRESH_MS = 30_000
export const THREAT_REFRESH_MS = 5_000

/** Display limits */
export const DISPLAY_DEBRIS_LIMIT = 2500

/** Threat severity colors — tech/military palette */
export const THREAT_COLORS = {
  allied: { text: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/40", hex: "#4488ff" },
  nominal: { text: "text-cyan-400", bg: "bg-cyan-500/15", border: "border-cyan-500/40", hex: "#00e5ff" },
  watched: { text: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/40", hex: "#ff9100" },
  threatened: { text: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/40", hex: "#ff1744" },
  friendly: { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/40", hex: "#00e676" },
} as const

export type ThreatSeverity = keyof typeof THREAT_COLORS

/** Planet configurations */
export const PLANET_CONFIG = {
  earth: {
    label: "Earth",
    texture: "/textures/earth/blue-marble-day.jpg",
    fallbackColor: "#0d3b66",
    atmosphereColor: "#73a5ff",
    atmosphereOpacity: 0.1,
    graticuleOpacity: 0.25,
  },
  moon: {
    label: "Moon",
    texture: "/textures/moon/moon-surface.jpg",
    fallbackColor: "#3a3a3a",
    atmosphereColor: "#888888",
    atmosphereOpacity: 0.03,
    graticuleOpacity: 0.15,
  },
  mars: {
    label: "Mars",
    texture: "/textures/mars/mars-surface.jpg",
    fallbackColor: "#8b3a1a",
    atmosphereColor: "#d4845a",
    atmosphereOpacity: 0.08,
    graticuleOpacity: 0.2,
  },
} as const

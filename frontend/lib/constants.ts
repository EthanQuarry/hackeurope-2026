/** Simulation speed presets — real-world time compression */
export const SPEED_PRESETS = [
  { label: "Real-time", multiplier: 1 },
  { label: "1 day/min", multiplier: 1440 },
  { label: "1 wk/min", multiplier: 10080 },
  { label: "1 mo/min", multiplier: 43200 },
  { label: "1 yr/min", multiplier: 525600 },
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

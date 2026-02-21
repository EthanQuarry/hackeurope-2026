/** Simulation speed presets */
export const SPEED_PRESETS = [1, 5, 10, 25, 50, 100] as const

/** Polling intervals (ms) */
export const DEBRIS_REFRESH_MS = 15_000
export const ORBIT_REFRESH_MS = 30_000
export const THREAT_REFRESH_MS = 5_000

/** Display limits */
export const DISPLAY_DEBRIS_LIMIT = 2500

/** Threat severity colors */
export const THREAT_COLORS = {
  nominal: { text: "text-cyan-400", bg: "bg-cyan-500/15", border: "border-cyan-500/40", hex: "#22d3ee" },
  watched: { text: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/40", hex: "#f59e0b" },
  threatened: { text: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/40", hex: "#ef4444" },
  friendly: { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/40", hex: "#10b981" },
} as const

export type ThreatSeverity = keyof typeof THREAT_COLORS

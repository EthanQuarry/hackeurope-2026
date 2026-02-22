/**
 * Generate an intercept trajectory where an attacker satellite
 * smoothly transitions from its own orbit to converge on a target's orbit.
 */

import type { TrajectoryPoint } from "@/types"

/** Hermite smoothstep for natural-looking transitions */
function smoothstep(t: number): number {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}

/** Shortest angular distance between two angles in degrees */
function angleLerp(from: number, to: number, t: number): number {
  let diff = ((to - from + 540) % 360) - 180
  return from + diff * t
}

/**
 * Build an intercept trajectory for the "Malicious Manoeuvre" demo.
 *
 * Phase 1 (0–40%):  Normal orbit — attacker follows its own path
 * Phase 2 (40–75%): Transfer burn — smooth transition toward target's orbit
 * Phase 3 (75–100%): Co-orbital — follows target closely, closing distance
 */
export function generateInterceptTrajectory(
  attacker: TrajectoryPoint[],
  target: TrajectoryPoint[],
): TrajectoryPoint[] {
  const n = attacker.length
  if (n === 0 || target.length === 0) return attacker

  const PHASE1_END = 0.35  // normal flight
  const PHASE2_END = 0.70  // transfer burn
  // Phase 3: 0.70–1.0     // co-orbital closing

  const result: TrajectoryPoint[] = []

  for (let i = 0; i < n; i++) {
    const frac = i / (n - 1)
    const a = attacker[i]
    // Map to target orbit at same fractional position (handles different periods)
    const tIdx = Math.floor((i / n) * target.length) % target.length
    const b = target[tIdx]

    if (frac <= PHASE1_END) {
      // Phase 1: pure attacker orbit
      result.push({ ...a })
    } else if (frac <= PHASE2_END) {
      // Phase 2: transfer — smoothly interpolate from attacker to target orbit
      const t = smoothstep((frac - PHASE1_END) / (PHASE2_END - PHASE1_END))
      result.push({
        t: a.t,
        lat: a.lat + (b.lat - a.lat) * t,
        lon: angleLerp(a.lon, b.lon, t),
        alt_km: a.alt_km + (b.alt_km - a.alt_km) * t,
      })
    } else {
      // Phase 3: co-orbital — follow target with decreasing offset
      const t = smoothstep((frac - PHASE2_END) / (1 - PHASE2_END))
      // Start 5km behind, close to 0.2km
      const altOffset = 5 * (1 - t) + 0.2
      // Small angular lag that shrinks
      const lag = 0.3 * (1 - t)
      result.push({
        t: a.t,
        lat: b.lat + lag,
        lon: b.lon + lag,
        alt_km: b.alt_km + altOffset,
      })
    }
  }

  return result
}

/** Well-known satellite IDs for the demo */
export const DEMO_SJ26_ID = "sat-25"
export const DEMO_USA245_ID = "sat-6"

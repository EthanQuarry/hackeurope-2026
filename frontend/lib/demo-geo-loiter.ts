/**
 * GEO US Loiter Demo — redirects real Chinese/Russian (watched) satellites
 * from their live LEO orbits to station-keeping positions above US territory.
 *
 * Works by modifying the existing trajectory of each selected satellite in-place.
 * Altitude is kept constant (LEO) so trajectories and trails stay around Earth.
 *
 *   Phase 1 (0–35%):  Real orbit — trajectory points unchanged
 *   Phase 2 (35–65%): Reposition — smooth lat/lon interpolation toward US point
 *   Phase 3 (65–100%): Hold — fixed subsatellite point above target US location
 *
 * The SatelliteMarker must be rendered with loop={false} so the satellite stays
 * at the hold position. On demo stop, the original trajectories are restored.
 */

import type { TrajectoryPoint } from "@/types"

const PHASE1_END = 0.35
const PHASE2_END = 0.65
// Phase 3: 0.65–1.00

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/** Hermite smoothstep for natural-looking transitions */
function smoothstep(t: number): number {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}

/** Spherical linear interpolation along the great circle between two geodetic points.
 *  Keeps the path on the sphere surface so trajectory lines don't cut through Earth. */
function slerpGeodetic(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  t: number,
): { lat: number; lon: number } {
  const toCart = (lat: number, lon: number) => {
    const la = lat * DEG_TO_RAD
    const lo = lon * DEG_TO_RAD
    return {
      x: Math.cos(la) * Math.cos(lo),
      y: Math.sin(la),
      z: -Math.cos(la) * Math.sin(lo),
    }
  }
  const v1 = toCart(lat1, lon1)
  const v2 = toCart(lat2, lon2)
  const dot = Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y + v1.z * v2.z))
  const omega = Math.acos(dot)
  if (omega < 1e-6) return { lat: lat1, lon: lon1 }
  const k0 = Math.sin((1 - t) * omega) / Math.sin(omega)
  const k1 = Math.sin(t * omega) / Math.sin(omega)
  const vx = k0 * v1.x + k1 * v2.x
  const vy = k0 * v1.y + k1 * v2.y
  const vz = k0 * v1.z + k1 * v2.z
  const lat = Math.asin(Math.max(-1, Math.min(1, vy))) * RAD_TO_DEG
  const lon = Math.atan2(-vz, vx) * RAD_TO_DEG
  return { lat, lon }
}

/**
 * Target (lat, lon) positions above the continental US. Altitude remains at the
 * satellite's original LEO altitude. Assigned round-robin to watched satellites.
 */
export const GEO_US_TARGETS: readonly { lat: number; lon: number }[] = [
  { lat: 34, lon: -118 },  // Los Angeles
  { lat: 33, lon: -112 },  // Phoenix
  { lat: 32, lon: -97 },   // Dallas
  { lat: 41, lon: -87 },   // Chicago
  { lat: 38, lon: -77 },   // Washington DC
  { lat: 42, lon: -71 },   // Boston
]

/**
 * Modify an existing satellite trajectory so the satellite transitions from
 * its real orbit toward a fixed position above the given US point. Altitude
 * is held constant at the satellite's original LEO altitude throughout.
 */
export function generateGeoLoiterTrajectory(
  original: TrajectoryPoint[],
  targetLat: number,
  targetLon: number,
): TrajectoryPoint[] {
  const n = original.length
  if (n < 4) return original

  const transferStartIdx = Math.floor(PHASE1_END * (n - 1))
  const anchor = original[transferStartIdx]

  return original.map((p, i) => {
    const frac = i / (n - 1)

    if (frac <= PHASE1_END) {
      return { ...p }
    }

    if (frac <= PHASE2_END) {
      const s = smoothstep((frac - PHASE1_END) / (PHASE2_END - PHASE1_END))
      const { lat, lon } = slerpGeodetic(
        anchor.lat,
        anchor.lon,
        targetLat,
        targetLon,
        s,
      )
      return {
        t: p.t,
        lat,
        lon,
        alt_km: anchor.alt_km,
      }
    }

    return {
      t: p.t,
      lat: targetLat,
      lon: targetLon,
      alt_km: anchor.alt_km,
    }
  })
}

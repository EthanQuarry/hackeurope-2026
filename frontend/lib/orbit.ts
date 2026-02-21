/**
 * SGP4 orbit propagation helpers wrapping satellite.js.
 * Used for converting TLE data to trajectory points.
 */

import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLong,
  degreesLat,
} from "satellite.js"

import { EARTH_RADIUS_KM } from "@/lib/geo"
import type { TrajectoryPoint } from "@/types"

export interface TLE {
  line1: string
  line2: string
}

/**
 * Propagate a TLE over a time range, returning trajectory points.
 *
 * @param tle - Two-line element set
 * @param startDate - Start of propagation
 * @param durationMin - Duration in minutes
 * @param stepSec - Time step in seconds (default 60)
 */
export function propagateTLE(
  tle: TLE,
  startDate: Date,
  durationMin: number,
  stepSec: number = 60
): TrajectoryPoint[] {
  const satrec = twoline2satrec(tle.line1, tle.line2)
  const points: TrajectoryPoint[] = []
  const totalSteps = Math.floor((durationMin * 60) / stepSec)

  for (let i = 0; i <= totalSteps; i++) {
    const date = new Date(startDate.getTime() + i * stepSec * 1000)
    const positionAndVelocity = propagate(satrec, date)

    if (
      !positionAndVelocity ||
      typeof positionAndVelocity.position === "boolean" ||
      !positionAndVelocity.position
    ) {
      continue
    }

    const gmst = gstime(date)
    const geodetic = eciToGeodetic(positionAndVelocity.position, gmst)

    const lat = degreesLat(geodetic.latitude)
    const lon = degreesLong(geodetic.longitude)
    const alt_km = geodetic.height

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Number.isFinite(alt_km)
    ) {
      points.push({
        t: date.getTime() / 1000,
        lat,
        lon,
        alt_km,
      })
    }
  }

  return points
}

const DEG_TO_RAD = Math.PI / 180

export const EARTH_RADIUS_KM = 6378.137

export interface Cartesian3 {
  x: number
  y: number
  z: number
}

/**
 * Convert geodetic coordinates (lat/lon/alt) to a scene-space vector.
 * Earth radius = 1.0 in scene units.
 * Y-axis = north pole, Z-axis = negative towards lon=90.
 */
export function geodeticToSceneVec3(
  latDeg: number,
  lonDeg: number,
  altKm: number
): [number, number, number] {
  const lat = latDeg * DEG_TO_RAD
  const lon = lonDeg * DEG_TO_RAD
  const r = 1 + altKm / EARTH_RADIUS_KM
  return [
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.sin(lat),
    -r * Math.cos(lat) * Math.sin(lon),
  ]
}

/**
 * Same as geodeticToSceneVec3 but returns an object.
 */
export function geodeticToUnitVector(
  latDeg: number,
  lonDeg: number,
  altKm = 0
): Cartesian3 {
  const latRad = latDeg * DEG_TO_RAD
  const lonRad = lonDeg * DEG_TO_RAD
  const radiusScale = 1 + altKm / EARTH_RADIUS_KM

  return {
    x: radiusScale * Math.cos(latRad) * Math.cos(lonRad),
    y: radiusScale * Math.sin(latRad),
    z: -radiusScale * Math.cos(latRad) * Math.sin(lonRad),
  }
}

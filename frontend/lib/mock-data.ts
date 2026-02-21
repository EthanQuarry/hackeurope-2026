import type { SatelliteData, DebrisData, ThreatData, TrajectoryPoint } from "@/types"

/**
 * Generate a circular orbit trajectory with evenly-spaced points.
 * Returns ~180 points covering a full orbit.
 */
function generateOrbitTrajectory(
  inclinationDeg: number,
  altKm: number,
  raanDeg: number,
  startTimeSec: number
): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = []
  const periodSec = 2 * Math.PI * Math.sqrt(Math.pow(6378.137 + altKm, 3) / 398600.4418)
  const numPoints = 180
  const stepSec = periodSec / numPoints

  const incRad = (inclinationDeg * Math.PI) / 180
  const raanRad = (raanDeg * Math.PI) / 180

  for (let i = 0; i < numPoints; i++) {
    const t = startTimeSec + i * stepSec
    const trueAnomaly = ((2 * Math.PI) / periodSec) * (i * stepSec)

    // Convert orbital elements to geodetic approximation
    const xOrb = Math.cos(trueAnomaly)
    const yOrb = Math.sin(trueAnomaly)

    // Rotate by inclination and RAAN
    const xEci = xOrb * Math.cos(raanRad) - yOrb * Math.cos(incRad) * Math.sin(raanRad)
    const yEci = xOrb * Math.sin(raanRad) + yOrb * Math.cos(incRad) * Math.cos(raanRad)
    const zEci = yOrb * Math.sin(incRad)

    const lat = (Math.asin(zEci) * 180) / Math.PI
    const lon = (Math.atan2(yEci, xEci) * 180) / Math.PI

    points.push({ t, lat, lon, alt_km: altKm })
  }

  return points
}

const baseTime = Date.now() / 1000

export const MOCK_SATELLITES: SatelliteData[] = [
  {
    id: "sat-1",
    name: "SENTINEL-1",
    noradId: 25544,
    status: "friendly",
    altitude_km: 408,
    velocity_kms: 7.66,
    inclination_deg: 51.6,
    period_min: 92.9,
    trajectory: generateOrbitTrajectory(51.6, 408, 0, baseTime),
    health: { power: 92, comms: 98, propellant: 74 },
  },
  {
    id: "sat-2",
    name: "GUARDIAN-3",
    noradId: 48274,
    status: "nominal",
    altitude_km: 550,
    velocity_kms: 7.59,
    inclination_deg: 97.4,
    period_min: 95.7,
    trajectory: generateOrbitTrajectory(97.4, 550, 45, baseTime),
    health: { power: 88, comms: 95, propellant: 61 },
  },
  {
    id: "sat-3",
    name: "AEGIS-7",
    noradId: 51234,
    status: "nominal",
    altitude_km: 780,
    velocity_kms: 7.45,
    inclination_deg: 86.4,
    period_min: 100.4,
    trajectory: generateOrbitTrajectory(86.4, 780, 90, baseTime),
    health: { power: 96, comms: 91, propellant: 82 },
  },
  {
    id: "sat-4",
    name: "OVERWATCH-2",
    noradId: 52001,
    status: "watched",
    altitude_km: 420,
    velocity_kms: 7.65,
    inclination_deg: 42.0,
    period_min: 93.1,
    trajectory: generateOrbitTrajectory(42.0, 420, 135, baseTime),
    health: { power: 71, comms: 85, propellant: 43 },
  },
  {
    id: "sat-5",
    name: "VANGUARD-1",
    noradId: 53100,
    status: "friendly",
    altitude_km: 620,
    velocity_kms: 7.56,
    inclination_deg: 65.0,
    period_min: 97.2,
    trajectory: generateOrbitTrajectory(65.0, 620, 180, baseTime),
    health: { power: 94, comms: 97, propellant: 88 },
  },
  {
    id: "sat-6",
    name: "SPECTER-4",
    noradId: 54200,
    status: "threatened",
    altitude_km: 450,
    velocity_kms: 7.63,
    inclination_deg: 55.0,
    period_min: 93.8,
    trajectory: generateOrbitTrajectory(55.0, 450, 225, baseTime),
    health: { power: 65, comms: 78, propellant: 22 },
  },
  {
    id: "sat-7",
    name: "CENTURION-5",
    noradId: 55300,
    status: "nominal",
    altitude_km: 500,
    velocity_kms: 7.61,
    inclination_deg: 72.0,
    period_min: 94.6,
    trajectory: generateOrbitTrajectory(72.0, 500, 270, baseTime),
    health: { power: 90, comms: 93, propellant: 67 },
  },
  {
    id: "sat-8",
    name: "HORIZON-9",
    noradId: 56400,
    status: "nominal",
    altitude_km: 340,
    velocity_kms: 7.70,
    inclination_deg: 28.5,
    period_min: 91.3,
    trajectory: generateOrbitTrajectory(28.5, 340, 315, baseTime),
    health: { power: 85, comms: 99, propellant: 55 },
  },
]

/**
 * Generate 2500 random debris objects in LEO.
 */
export function generateMockDebris(count: number = 2500): DebrisData[] {
  const debris: DebrisData[] = []
  for (let i = 0; i < count; i++) {
    const lat = (Math.random() - 0.5) * 160 // -80 to 80
    const lon = (Math.random() - 0.5) * 360 // -180 to 180
    const altKm = 200 + Math.random() * 1800 // 200-2000 km LEO
    debris.push({
      noradId: 90000 + i,
      lat,
      lon,
      altKm,
    })
  }
  return debris
}

export const MOCK_THREATS: ThreatData[] = [
  {
    id: "threat-1",
    primaryId: "sat-6",
    secondaryId: "debris-1201",
    primaryName: "SPECTER-4",
    secondaryName: "COSMOS 2251 DEB",
    severity: "threatened",
    missDistanceKm: 0.8,
    tcaTime: Date.now() + 1200000,
    tcaInMinutes: 20,
    primaryPosition: { lat: 35.2, lon: -42.8, altKm: 450 },
    secondaryPosition: { lat: 35.5, lon: -42.3, altKm: 452 },
    intentClassification: "Uncontrolled debris",
    confidence: 0.95,
  },
  {
    id: "threat-2",
    primaryId: "sat-4",
    secondaryId: "unknown-1",
    primaryName: "OVERWATCH-2",
    secondaryName: "UNKNOWN OBJ 4718",
    severity: "watched",
    missDistanceKm: 12.4,
    tcaTime: Date.now() + 3600000,
    tcaInMinutes: 60,
    primaryPosition: { lat: -12.1, lon: 78.5, altKm: 420 },
    secondaryPosition: { lat: -11.8, lon: 79.2, altKm: 418 },
    intentClassification: "Maneuvering — intent unclear",
    confidence: 0.62,
  },
  {
    id: "threat-3",
    primaryId: "sat-1",
    secondaryId: "debris-0442",
    primaryName: "SENTINEL-1",
    secondaryName: "FENGYUN 1C DEB",
    severity: "nominal",
    missDistanceKm: 85.0,
    tcaTime: Date.now() + 7200000,
    tcaInMinutes: 120,
    primaryPosition: { lat: 48.7, lon: 12.3, altKm: 408 },
    secondaryPosition: { lat: 49.1, lon: 13.0, altKm: 415 },
    intentClassification: "Uncontrolled debris",
    confidence: 0.88,
  },
]

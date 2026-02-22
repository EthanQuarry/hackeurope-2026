import type { SatelliteData, DebrisData, ThreatData, TrajectoryPoint, ProximityThreat, SignalThreat, AnomalyThreat, OrbitalSimilarityThreat } from "@/types"

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
    country_code: "ESA",
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
    country_code: "USA",
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
    country_code: "USA",
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
    country_code: "RUS",
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
    country_code: "UK",
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
    country_code: "USA",
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
    country_code: "USA",
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
    country_code: "USA",
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

// ── Proximity Inspection & Attack Positioning ──

export const MOCK_PROXIMITY_THREATS: ProximityThreat[] = [
  {
    id: "prox-1",
    foreignSatId: "foreign-1",
    foreignSatName: "KOSMOS 2558",
    targetAssetId: "sat-6",
    targetAssetName: "SPECTER-4",
    severity: "threatened",
    missDistanceKm: 0.8,
    approachVelocityKms: 0.014,
    tcaTime: Date.now() + 1200000,
    tcaInMinutes: 20,
    primaryPosition: { lat: 35.2, lon: -42.8, altKm: 450 },
    secondaryPosition: { lat: 35.5, lon: -42.3, altKm: 452 },
    approachPattern: "co-orbital",
    sunHidingDetected: true,
    confidence: 0.93,
  },
  {
    id: "prox-2",
    foreignSatId: "foreign-2",
    foreignSatName: "SJ-21",
    targetAssetId: "sat-4",
    targetAssetName: "OVERWATCH-2",
    severity: "watched",
    missDistanceKm: 18.5,
    approachVelocityKms: 0.008,
    tcaTime: Date.now() + 5400000,
    tcaInMinutes: 90,
    primaryPosition: { lat: -12.1, lon: 78.5, altKm: 420 },
    secondaryPosition: { lat: -11.8, lon: 79.2, altKm: 418 },
    approachPattern: "drift",
    sunHidingDetected: false,
    confidence: 0.71,
  },
  {
    id: "prox-3",
    foreignSatId: "foreign-3",
    foreignSatName: "SHIJIAN-17",
    targetAssetId: "sat-3",
    targetAssetName: "AEGIS-7",
    severity: "nominal",
    missDistanceKm: 120.0,
    approachVelocityKms: 0.003,
    tcaTime: Date.now() + 14400000,
    tcaInMinutes: 240,
    primaryPosition: { lat: 52.3, lon: -95.7, altKm: 785 },
    secondaryPosition: { lat: 51.9, lon: -94.8, altKm: 780 },
    approachPattern: "direct",
    sunHidingDetected: false,
    confidence: 0.55,
  },
]

// ── Signal Interception ──

export const MOCK_SIGNAL_THREATS: SignalThreat[] = [
  {
    id: "sig-1",
    interceptorId: "foreign-4",
    interceptorName: "LUCH / OLYMP-K",
    targetLinkAssetId: "sat-1",
    targetLinkAssetName: "SENTINEL-1",
    groundStationName: "Buckley SFB",
    severity: "watched",
    interceptionProbability: 0.34,
    signalPathAngleDeg: 12.4,
    commWindowsAtRisk: 3,
    totalCommWindows: 14,
    tcaTime: Date.now() + 3600000,
    tcaInMinutes: 60,
    position: { lat: 39.7, lon: -104.8, altKm: 35786 },
    confidence: 0.68,
  },
  {
    id: "sig-2",
    interceptorId: "foreign-5",
    interceptorName: "TJS-3",
    targetLinkAssetId: "sat-5",
    targetLinkAssetName: "VANGUARD-1",
    groundStationName: "Schriever SFB",
    severity: "nominal",
    interceptionProbability: 0.12,
    signalPathAngleDeg: 28.9,
    commWindowsAtRisk: 1,
    totalCommWindows: 22,
    tcaTime: Date.now() + 7200000,
    tcaInMinutes: 120,
    position: { lat: 38.8, lon: -104.5, altKm: 35400 },
    confidence: 0.45,
  },
]

// ── Satellite Hijacking & Anomalous Behavior ──

export const MOCK_ANOMALY_THREATS: AnomalyThreat[] = [
  {
    id: "anom-1",
    satelliteId: "foreign-1",
    satelliteName: "KOSMOS 2558",
    severity: "threatened",
    anomalyType: "unexpected-maneuver",
    baselineDeviation: 0.87,
    description: "Executed 0.4 m/s prograde burn not consistent with station-keeping. New orbit reduces miss distance with SPECTER-4.",
    detectedAt: Date.now() - 600000,
    confidence: 0.91,
    position: { lat: 33.8, lon: -44.2, altKm: 448 },
  },
  {
    id: "anom-2",
    satelliteId: "foreign-6",
    satelliteName: "YAOGAN-30D",
    severity: "watched",
    anomalyType: "pointing-change",
    baselineDeviation: 0.52,
    description: "Antenna pattern redirected 15\u00b0 from nadir. Now aligned with GUARDIAN-3 orbital plane.",
    detectedAt: Date.now() - 1800000,
    confidence: 0.74,
    position: { lat: 8.2, lon: 112.5, altKm: 600 },
  },
  {
    id: "anom-3",
    satelliteId: "foreign-7",
    satelliteName: "COSMOS 2542",
    severity: "watched",
    anomalyType: "orbit-raise",
    baselineDeviation: 0.41,
    description: "Apogee raised 12 km over last 48 hrs. Trajectory converging with CENTURION-5 orbital shell.",
    detectedAt: Date.now() - 3600000,
    confidence: 0.63,
    position: { lat: -22.4, lon: 56.8, altKm: 512 },
  },
]

// ── Orbital Similarity ──

export const MOCK_ORBITAL_SIMILARITY_THREATS: OrbitalSimilarityThreat[] = [
  {
    id: "osim-1",
    foreignSatId: "foreign-1",
    foreignSatName: "KOSMOS 2558",
    targetAssetId: "sat-6",
    targetAssetName: "SPECTER-4",
    severity: "threatened",
    inclinationDiffDeg: 0.4,
    altitudeDiffKm: 3.2,
    divergenceScore: 0.007,
    pattern: "co-planar",
    confidence: 0.94,
    position: { lat: 35.2, lon: -42.8, altKm: 451 },
  },
  {
    id: "osim-2",
    foreignSatId: "foreign-2",
    foreignSatName: "SJ-21",
    targetAssetId: "sat-4",
    targetAssetName: "OVERWATCH-2",
    severity: "watched",
    inclinationDiffDeg: 3.1,
    altitudeDiffKm: 18.0,
    divergenceScore: 0.071,
    pattern: "co-inclination",
    confidence: 0.68,
    position: { lat: -12.1, lon: 78.5, altKm: 438 },
  },
  {
    id: "osim-3",
    foreignSatId: "foreign-3",
    foreignSatName: "SHIJIAN-17",
    targetAssetId: "sat-3",
    targetAssetName: "AEGIS-7",
    severity: "nominal",
    inclinationDiffDeg: 7.2,
    altitudeDiffKm: 65.0,
    divergenceScore: 0.21,
    pattern: "shadowing",
    confidence: 0.41,
    position: { lat: 52.3, lon: -95.7, altKm: 720 },
  },
]

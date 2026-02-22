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
  // --- Crewed / Space Station ---
  {
    id: "sat-1",
    name: "ISS (ZARYA)",
    noradId: 25544,
    status: "friendly",
    altitude_km: 408,
    velocity_kms: 7.66,
    inclination_deg: 51.6,
    period_min: 92.4,
    trajectory: generateOrbitTrajectory(51.6, 408, 0, baseTime),
    health: { power: 92, comms: 98, propellant: 74 },
  },
  // --- Earth Observation ---
  {
    id: "sat-2",
    name: "NOAA-20",
    noradId: 43013,
    status: "nominal",
    altitude_km: 824,
    velocity_kms: 7.44,
    inclination_deg: 98.7,
    period_min: 101.2,
    trajectory: generateOrbitTrajectory(98.7, 824, 45, baseTime),
    health: { power: 88, comms: 95, propellant: 61 },
  },
  {
    id: "sat-3",
    name: "AQUA",
    noradId: 27424,
    status: "nominal",
    altitude_km: 705,
    velocity_kms: 7.50,
    inclination_deg: 98.2,
    period_min: 98.8,
    trajectory: generateOrbitTrajectory(98.2, 705, 90, baseTime),
    health: { power: 82, comms: 91, propellant: 45 },
  },
  {
    id: "sat-4",
    name: "SENTINEL-2A",
    noradId: 41240,
    status: "friendly",
    altitude_km: 786,
    velocity_kms: 7.45,
    inclination_deg: 98.5,
    period_min: 100.4,
    trajectory: generateOrbitTrajectory(98.5, 786, 135, baseTime),
    health: { power: 94, comms: 97, propellant: 79 },
  },
  {
    id: "sat-5",
    name: "LANDSAT 8",
    noradId: 39084,
    status: "friendly",
    altitude_km: 705,
    velocity_kms: 7.50,
    inclination_deg: 98.2,
    period_min: 98.8,
    trajectory: generateOrbitTrajectory(98.2, 705, 180, baseTime),
    health: { power: 90, comms: 96, propellant: 68 },
  },
  // --- US Military / Reconnaissance ---
  {
    id: "sat-6",
    name: "USA-281",
    noradId: 43232,
    status: "threatened",
    altitude_km: 500,
    velocity_kms: 7.61,
    inclination_deg: 97.9,
    period_min: 94.6,
    trajectory: generateOrbitTrajectory(97.9, 500, 225, baseTime),
    health: { power: 65, comms: 78, propellant: 22 },
  },
  // --- Science ---
  {
    id: "sat-7",
    name: "HUBBLE SPACE TELESCOPE",
    noradId: 20580,
    status: "friendly",
    altitude_km: 547,
    velocity_kms: 7.59,
    inclination_deg: 28.5,
    period_min: 95.6,
    trajectory: generateOrbitTrajectory(28.5, 547, 270, baseTime),
    health: { power: 85, comms: 93, propellant: 55 },
  },
  // --- Weather (GEO) ---
  {
    id: "sat-8",
    name: "GOES-16",
    noradId: 41882,
    status: "friendly",
    altitude_km: 35786,
    velocity_kms: 3.07,
    inclination_deg: 0.1,
    period_min: 1436,
    trajectory: generateOrbitTrajectory(0.1, 35786, 315, baseTime),
    health: { power: 96, comms: 99, propellant: 82 },
  },
  // --- Russian Military ---
  {
    id: "sat-9",
    name: "COSMOS-2558",
    noradId: 48274,
    status: "watched",
    altitude_km: 550,
    velocity_kms: 7.59,
    inclination_deg: 97.3,
    period_min: 95.7,
    trajectory: generateOrbitTrajectory(97.3, 550, 20, baseTime),
    health: { power: 71, comms: 85, propellant: 43 },
  },
  // --- Chinese Military ---
  {
    id: "sat-10",
    name: "YAOGAN-34",
    noradId: 49492,
    status: "watched",
    altitude_km: 390,
    velocity_kms: 7.68,
    inclination_deg: 63.4,
    period_min: 92.1,
    trajectory: generateOrbitTrajectory(63.4, 390, 55, baseTime),
    health: { power: 68, comms: 81, propellant: 38 },
  },
  // --- Starlink (LEO Comms) ---
  {
    id: "sat-11",
    name: "STARLINK-1007",
    noradId: 44238,
    status: "nominal",
    altitude_km: 550,
    velocity_kms: 7.59,
    inclination_deg: 53.0,
    period_min: 95.7,
    trajectory: generateOrbitTrajectory(53.0, 550, 110, baseTime),
    health: { power: 91, comms: 94, propellant: 65 },
  },
  // --- Navigation (MEO) ---
  {
    id: "sat-12",
    name: "GPS IIR-M 3",
    noradId: 28474,
    status: "friendly",
    altitude_km: 20200,
    velocity_kms: 3.87,
    inclination_deg: 55.0,
    period_min: 755,
    trajectory: generateOrbitTrajectory(55.0, 20200, 150, baseTime),
    health: { power: 95, comms: 99, propellant: 86 },
  },
  {
    id: "sat-13",
    name: "GLONASS-M",
    noradId: 36585,
    status: "watched",
    altitude_km: 19100,
    velocity_kms: 3.95,
    inclination_deg: 64.8,
    period_min: 718,
    trajectory: generateOrbitTrajectory(64.8, 19100, 195, baseTime),
    health: { power: 74, comms: 83, propellant: 41 },
  },
  // --- US Military SATCOM (GEO) ---
  {
    id: "sat-14",
    name: "WGS-10",
    noradId: 43435,
    status: "threatened",
    altitude_km: 35786,
    velocity_kms: 3.07,
    inclination_deg: 0.1,
    period_min: 1436,
    trajectory: generateOrbitTrajectory(0.1, 35786, 240, baseTime),
    health: { power: 58, comms: 72, propellant: 19 },
  },
  {
    id: "sat-15",
    name: "MUOS-4",
    noradId: 40874,
    status: "friendly",
    altitude_km: 35786,
    velocity_kms: 3.07,
    inclination_deg: 5.0,
    period_min: 1436,
    trajectory: generateOrbitTrajectory(5.0, 35786, 285, baseTime),
    health: { power: 97, comms: 98, propellant: 91 },
  },
  // --- Russian ELINT ---
  {
    id: "sat-16",
    name: "COSMOS-2535",
    noradId: 44398,
    status: "watched",
    altitude_km: 580,
    velocity_kms: 7.58,
    inclination_deg: 97.6,
    period_min: 96.3,
    trajectory: generateOrbitTrajectory(97.6, 580, 330, baseTime),
    health: { power: 70, comms: 79, propellant: 33 },
  },
  // --- Chinese SAR ---
  {
    id: "sat-17",
    name: "YAOGAN-35C",
    noradId: 50258,
    status: "watched",
    altitude_km: 500,
    velocity_kms: 7.61,
    inclination_deg: 35.0,
    period_min: 94.6,
    trajectory: generateOrbitTrajectory(35.0, 500, 10, baseTime),
    health: { power: 86, comms: 91, propellant: 58 },
  },
  // --- Earth Observation ---
  {
    id: "sat-18",
    name: "TERRA",
    noradId: 25994,
    status: "nominal",
    altitude_km: 705,
    velocity_kms: 7.50,
    inclination_deg: 98.5,
    period_min: 98.8,
    trajectory: generateOrbitTrajectory(98.5, 705, 100, baseTime),
    health: { power: 80, comms: 88, propellant: 47 },
  },
  // --- Polar Science ---
  {
    id: "sat-19",
    name: "CRYOSAT-2",
    noradId: 36508,
    status: "nominal",
    altitude_km: 717,
    velocity_kms: 7.49,
    inclination_deg: 92.0,
    period_min: 99.1,
    trajectory: generateOrbitTrajectory(92.0, 717, 165, baseTime),
    health: { power: 82, comms: 90, propellant: 52 },
  },
  // --- Defunct / Debris Risk ---
  {
    id: "sat-20",
    name: "ENVISAT",
    noradId: 27386,
    status: "nominal",
    altitude_km: 767,
    velocity_kms: 7.46,
    inclination_deg: 98.5,
    period_min: 100.0,
    trajectory: generateOrbitTrajectory(98.5, 767, 210, baseTime),
    health: { power: 0, comms: 0, propellant: 0 },
  },
  // --- Russian Inspector ---
  {
    id: "sat-21",
    name: "COSMOS-2551",
    noradId: 47719,
    status: "watched",
    altitude_km: 460,
    velocity_kms: 7.63,
    inclination_deg: 97.6,
    period_min: 93.9,
    trajectory: generateOrbitTrajectory(97.6, 460, 260, baseTime),
    health: { power: 67, comms: 76, propellant: 35 },
  },
  // --- US Military SATCOM (GEO) ---
  {
    id: "sat-22",
    name: "WGS-6",
    noradId: 39533,
    status: "friendly",
    altitude_km: 35786,
    velocity_kms: 3.07,
    inclination_deg: 0.1,
    period_min: 1436,
    trajectory: generateOrbitTrajectory(0.1, 35786, 305, baseTime),
    health: { power: 93, comms: 97, propellant: 84 },
  },
  // --- US Protected SATCOM (GEO) ---
  {
    id: "sat-23",
    name: "AEHF-5",
    noradId: 44481,
    status: "friendly",
    altitude_km: 35786,
    velocity_kms: 3.07,
    inclination_deg: 5.0,
    period_min: 1436,
    trajectory: generateOrbitTrajectory(5.0, 35786, 350, baseTime),
    health: { power: 96, comms: 98, propellant: 89 },
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
    primaryName: "USA-281",
    secondaryName: "COSMOS 2251 DEB",
    severity: "threatened",
    missDistanceKm: 0.8,
    tcaTime: Date.now() + 1200000,
    tcaInMinutes: 20,
    primaryPosition: { lat: 35.2, lon: -42.8, altKm: 500 },
    secondaryPosition: { lat: 35.5, lon: -42.3, altKm: 502 },
    intentClassification: "Uncontrolled debris",
    confidence: 0.95,
  },
  {
    id: "threat-2",
    primaryId: "sat-14",
    secondaryId: "unknown-1",
    primaryName: "WGS-10",
    secondaryName: "UNKNOWN OBJ 4718",
    severity: "watched",
    missDistanceKm: 12.4,
    tcaTime: Date.now() + 3600000,
    tcaInMinutes: 60,
    primaryPosition: { lat: -0.1, lon: 78.5, altKm: 35786 },
    secondaryPosition: { lat: -0.2, lon: 79.2, altKm: 35790 },
    intentClassification: "Maneuvering — intent unclear",
    confidence: 0.62,
  },
  {
    id: "threat-3",
    primaryId: "sat-1",
    secondaryId: "debris-0442",
    primaryName: "ISS (ZARYA)",
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
    targetAssetName: "USA-281",
    severity: "threatened",
    missDistanceKm: 0.8,
    approachVelocityKms: 0.014,
    tcaTime: Date.now() + 1200000,
    tcaInMinutes: 20,
    primaryPosition: { lat: 35.2, lon: -42.8, altKm: 500 },
    secondaryPosition: { lat: 35.5, lon: -42.3, altKm: 502 },
    approachPattern: "co-orbital",
    sunHidingDetected: true,
    confidence: 0.93,
  },
  {
    id: "prox-2",
    foreignSatId: "foreign-2",
    foreignSatName: "SJ-21",
    targetAssetId: "sat-14",
    targetAssetName: "WGS-10",
    severity: "watched",
    missDistanceKm: 18.5,
    approachVelocityKms: 0.008,
    tcaTime: Date.now() + 5400000,
    tcaInMinutes: 90,
    primaryPosition: { lat: -0.1, lon: 78.5, altKm: 35790 },
    secondaryPosition: { lat: -0.2, lon: 79.2, altKm: 35786 },
    approachPattern: "drift",
    sunHidingDetected: false,
    confidence: 0.71,
  },
  {
    id: "prox-3",
    foreignSatId: "foreign-3",
    foreignSatName: "SHIJIAN-17",
    targetAssetId: "sat-4",
    targetAssetName: "SENTINEL-2A",
    severity: "nominal",
    missDistanceKm: 120.0,
    approachVelocityKms: 0.003,
    tcaTime: Date.now() + 14400000,
    tcaInMinutes: 240,
    primaryPosition: { lat: 52.3, lon: -95.7, altKm: 790 },
    secondaryPosition: { lat: 51.9, lon: -94.8, altKm: 786 },
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
    targetLinkAssetName: "ISS (ZARYA)",
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
    targetLinkAssetName: "LANDSAT 8",
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
  {
    id: "sig-3",
    interceptorId: "foreign-7",
    interceptorName: "COSMOS 2542",
    targetLinkAssetId: "sat-3",
    targetLinkAssetName: "AQUA",
    groundStationName: "Pine Gap, AUS",
    severity: "threatened",
    interceptionProbability: 0.61,
    signalPathAngleDeg: 5.8,
    commWindowsAtRisk: 5,
    totalCommWindows: 18,
    tcaTime: Date.now() + 1800000,
    tcaInMinutes: 30,
    position: { lat: -23.8, lon: 133.7, altKm: 450 },
    confidence: 0.88,
  },
  {
    id: "sig-4",
    interceptorId: "foreign-6",
    interceptorName: "YAOGAN-30D",
    targetLinkAssetId: "sat-7",
    targetLinkAssetName: "HUBBLE SPACE TELESCOPE",
    groundStationName: "RAF Menwith Hill",
    severity: "watched",
    interceptionProbability: 0.28,
    signalPathAngleDeg: 18.2,
    commWindowsAtRisk: 2,
    totalCommWindows: 16,
    tcaTime: Date.now() + 5400000,
    tcaInMinutes: 90,
    position: { lat: 54.0, lon: -1.7, altKm: 600 },
    confidence: 0.59,
  },
  {
    id: "sig-5",
    interceptorId: "foreign-2",
    interceptorName: "SJ-21",
    targetLinkAssetId: "sat-4",
    targetLinkAssetName: "SENTINEL-2A",
    groundStationName: "Kaena Point, HI",
    severity: "nominal",
    interceptionProbability: 0.09,
    signalPathAngleDeg: 34.7,
    commWindowsAtRisk: 1,
    totalCommWindows: 20,
    tcaTime: Date.now() + 10800000,
    tcaInMinutes: 180,
    position: { lat: 21.6, lon: -158.2, altKm: 35786 },
    confidence: 0.38,
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
    description: "Executed 0.4 m/s prograde burn not consistent with station-keeping. New orbit reduces miss distance with USA-281.",
    detectedAt: Date.now() - 600000,
    confidence: 0.91,
    position: { lat: 33.8, lon: -44.2, altKm: 498 },
  },
  {
    id: "anom-2",
    satelliteId: "foreign-6",
    satelliteName: "YAOGAN-30D",
    severity: "watched",
    anomalyType: "pointing-change",
    baselineDeviation: 0.52,
    description: "Antenna pattern redirected 15\u00b0 from nadir. Now aligned with NOAA-20 orbital plane.",
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
    description: "Apogee raised 12 km over last 48 hrs. Trajectory converging with HUBBLE SPACE TELESCOPE orbital shell.",
    detectedAt: Date.now() - 3600000,
    confidence: 0.63,
    position: { lat: -22.4, lon: 56.8, altKm: 545 },
  },
]

// ── Orbital Similarity ──

export const MOCK_ORBITAL_SIMILARITY_THREATS: OrbitalSimilarityThreat[] = [
  {
    id: "osim-1",
    foreignSatId: "foreign-1",
    foreignSatName: "KOSMOS 2558",
    targetAssetId: "sat-6",
    targetAssetName: "USA-281",
    severity: "threatened",
    inclinationDiffDeg: 0.4,
    altitudeDiffKm: 3.2,
    divergenceScore: 0.007,
    pattern: "co-planar",
    confidence: 0.94,
    position: { lat: 35.2, lon: -42.8, altKm: 501 },
  },
  {
    id: "osim-2",
    foreignSatId: "foreign-2",
    foreignSatName: "SJ-21",
    targetAssetId: "sat-14",
    targetAssetName: "WGS-10",
    severity: "watched",
    inclinationDiffDeg: 3.1,
    altitudeDiffKm: 18.0,
    divergenceScore: 0.071,
    pattern: "co-inclination",
    confidence: 0.68,
    position: { lat: -0.1, lon: 78.5, altKm: 35800 },
  },
  {
    id: "osim-3",
    foreignSatId: "foreign-3",
    foreignSatName: "SHIJIAN-17",
    targetAssetId: "sat-4",
    targetAssetName: "SENTINEL-2A",
    severity: "nominal",
    inclinationDiffDeg: 7.2,
    altitudeDiffKm: 65.0,
    divergenceScore: 0.21,
    pattern: "shadowing",
    confidence: 0.41,
    position: { lat: 52.3, lon: -95.7, altKm: 790 },
  },
]

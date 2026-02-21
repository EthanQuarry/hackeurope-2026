import type { ThreatSeverity } from "@/lib/constants"

/** Trajectory point for satellite orbit */
export interface TrajectoryPoint {
  t: number
  lat: number
  lon: number
  alt_km: number
}

/** Satellite data from backend */
export interface SatelliteData {
  id: string
  name: string
  noradId: number
  status: ThreatSeverity
  altitude_km: number
  velocity_kms: number
  inclination_deg: number
  period_min: number
  trajectory: TrajectoryPoint[]
  health: {
    power: number
    comms: number
    propellant: number
  }
}

/** Debris object data */
export interface DebrisData {
  noradId: number
  lat: number
  lon: number
  altKm: number
}

/** Threat / conjunction event */
export interface ThreatData {
  id: string
  primaryId: string
  secondaryId: string
  primaryName: string
  secondaryName: string
  severity: ThreatSeverity
  missDistanceKm: number
  tcaTime: number
  tcaInMinutes: number
  primaryPosition: { lat: number; lon: number; altKm: number }
  secondaryPosition: { lat: number; lon: number; altKm: number }
  intentClassification?: string
  confidence?: number
}

/** Global threat level */
export type GlobalThreatLevel = "NOMINAL" | "ELEVATED" | "HIGH" | "CRITICAL"

/** Proximity inspection / attack positioning threat */
export interface ProximityThreat {
  id: string
  foreignSatId: string
  foreignSatName: string
  targetAssetId: string
  targetAssetName: string
  severity: ThreatSeverity
  missDistanceKm: number
  approachVelocityKms: number
  tcaTime: number
  tcaInMinutes: number
  primaryPosition: { lat: number; lon: number; altKm: number }
  secondaryPosition: { lat: number; lon: number; altKm: number }
  approachPattern: "direct" | "co-orbital" | "sun-hiding" | "drift"
  sunHidingDetected: boolean
  confidence: number
}

/** Signal interception threat */
export interface SignalThreat {
  id: string
  interceptorId: string
  interceptorName: string
  targetLinkAssetId: string
  targetLinkAssetName: string
  groundStationName: string
  severity: ThreatSeverity
  interceptionProbability: number
  signalPathAngleDeg: number
  commWindowsAtRisk: number
  totalCommWindows: number
  tcaTime: number
  tcaInMinutes: number
  position: { lat: number; lon: number; altKm: number }
  confidence: number
}

/** Satellite hijacking / anomalous behavior threat */
export interface AnomalyThreat {
  id: string
  satelliteId: string
  satelliteName: string
  severity: ThreatSeverity
  anomalyType: "unexpected-maneuver" | "orientation-change" | "pointing-change" | "orbit-raise" | "orbit-lower" | "rf-emission"
  baselineDeviation: number
  description: string
  detectedAt: number
  confidence: number
  position: { lat: number; lon: number; altKm: number }
}

/** AI terminal log entry */
export interface TerminalLogEntry {
  id: number
  timestamp: string
  text: string
  color: string
  layer?: "scan" | "context" | "reasoning" | "tool" | "result" | "intent" | "error"
}

/** Response recommendation from AI */
export interface ResponseRecommendation {
  id: string
  threatId: string
  type: "maneuver" | "alert" | "monitor" | "escalate"
  description: string
  deltaV?: number
  confidence: number
  timestamp: number
}

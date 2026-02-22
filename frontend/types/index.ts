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
  /** Maneuver arc in scene-space [x,y,z] — only for scenario satellites */
  maneuverArc?: [number, number, number][]
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

/** Orbital similarity / co-orbital shadowing threat */
export interface OrbitalSimilarityThreat {
  id: string
  foreignSatId: string
  foreignSatName: string
  targetAssetId: string
  targetAssetName: string
  severity: ThreatSeverity
  inclinationDiffDeg: number
  altitudeDiffKm: number
  divergenceScore: number
  pattern: "co-planar" | "co-altitude" | "co-inclination" | "shadowing"
  confidence: number
  position: { lat: number; lon: number; altKm: number }
}

/** Geo-US loiter threat — Chinese/Russian satellites geostationary or hovering over US */
export interface GeoLoiterThreat {
  id: string
  satelliteId: string
  satelliteName: string
  noradId: number
  countryCode: string
  orbitType: "geostationary" | "geosynchronous" | "molniya" | "other"
  subsatelliteLonDeg: number
  subsatelliteLatDeg: number
  altitudeKm: number
  dwellFractionOverUs: number
  severity: ThreatSeverity
  threatScore: number
  description: string
  confidence: number
  position: { lat: number; lon: number; altKm: number }
  detectedAt: number
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

// --- Iridium SBD Communication Types ---

/** Iridium ground station gateway */
export interface IridiumGateway {
  name: string
  location: string
  lat: number
  lon: number
  region: string
  status: string
}

/** Parsed intent from natural language */
export interface ParsedIntent {
  command_type: string
  target_satellite_id: string
  target_satellite_name: string
  parameters: Record<string, unknown>
  urgency: "normal" | "urgent" | "emergency"
  summary: string
}

/** Single AT command */
export interface ATCommand {
  command: string
  description: string
  expected_response: string
}

/** AT command sequence */
export interface ATCommandSequence {
  commands: ATCommand[]
  total_commands: number
  estimated_duration_ms: number
}

/** Binary SBD payload structure */
export interface SBDPayload {
  protocol_revision: number
  overall_message_length: number
  mt_header_iei: string
  mt_header_length: number
  unique_client_message_id: string
  imei: string
  mt_disposition_flags: string
  mt_payload_iei: string
  mt_payload_length: number
  mt_payload_hex: string
  mt_payload_human_readable: string
  total_bytes: number
}

/** Gateway routing decision */
export interface GatewayRouting {
  selected_gateway: IridiumGateway
  routing_reason: string
  satellite_position: { lat: number; lon: number; altKm: number }
  signal_hops: number
  estimated_latency_ms: number
  alternative_gateways: IridiumGateway[]
}

/** Full communication transcription */
export interface CommsTranscription {
  transcription_id: string
  timestamp: number
  human_input: string
  parsed_intent: ParsedIntent
  at_commands: ATCommandSequence
  sbd_payload: SBDPayload
  gateway_routing: GatewayRouting
  agent_reasoning: string
  status: "processing" | "complete" | "error"
}

/** SSE stage names for comms streaming */
export type CommsStage =
  | "human_input"
  | "agent_reasoning"
  | "parsed_intent"
  | "at_commands"
  | "sbd_payload"
  | "gateway_routing"

/** Chat message in the comms conversation */
export interface CommsChatMessage {
  role: "user" | "assistant"
  content: string
}

/** Response from the /comms/chat endpoint */
export interface CommsChatResponse {
  reply: string
  command_ready: boolean
  parsed_command: string | null
  parsed_intent: ParsedIntent | null
}

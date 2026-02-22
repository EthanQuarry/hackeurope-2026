import type {
  SatelliteData,
  ProximityThreat,
  SignalThreat,
  AnomalyThreat,
  OrbitalSimilarityThreat,
  GeoLoiterThreat,
} from "@/types"

/**
 * Compute aggregate risk per satellite = max(confidence) across all threat
 * types where the satellite appears (as either the target or the threat actor).
 *
 * Returns Record<satId, riskValue 0-1>.
 */
export function computeFleetRisk(
  satellites: SatelliteData[],
  proximity: ProximityThreat[],
  signal: SignalThreat[],
  anomaly: AnomalyThreat[],
  orbital: OrbitalSimilarityThreat[],
  geoLoiter: GeoLoiterThreat[],
): Record<string, number> {
  const risk: Record<string, number> = {}
  for (const sat of satellites) {
    risk[sat.id] = 0
  }

  const updateMax = (id: string, value: number) => {
    if (id in risk) {
      risk[id] = Math.max(risk[id], value)
    } else {
      risk[id] = value
    }
  }

  for (const t of proximity) {
    updateMax(t.targetAssetId, t.confidence)
    updateMax(t.foreignSatId, t.confidence)
  }

  for (const t of signal) {
    updateMax(t.targetLinkAssetId, t.confidence)
    updateMax(t.interceptorId, t.confidence)
  }

  for (const t of anomaly) {
    updateMax(t.satelliteId, t.confidence)
  }

  for (const t of orbital) {
    updateMax(t.targetAssetId, t.confidence)
    updateMax(t.foreignSatId, t.confidence)
  }

  for (const t of geoLoiter) {
    updateMax(t.satelliteId, t.threatScore)
  }

  return risk
}

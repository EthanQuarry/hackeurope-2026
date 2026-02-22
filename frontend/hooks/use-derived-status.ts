"use client"

import { useMemo } from "react"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import type { SatelliteData } from "@/types"
import type { ThreatSeverity } from "@/lib/constants"
import type { ProximityThreat, SignalThreat, AnomalyThreat, OrbitalSimilarityThreat } from "@/types"

const THREAT_ACTOR_COUNTRIES = new Set(["PRC", "RUS", "CIS"])

function deriveStatus(
  sat: SatelliteData,
  proximity: ProximityThreat[],
  signal: SignalThreat[],
  anomaly: AnomalyThreat[],
  orbital: OrbitalSimilarityThreat[],
): ThreatSeverity {
  const isActor =
    proximity.some((t) => t.foreignSatId === sat.id) ||
    signal.some((t) => t.interceptorId === sat.id) ||
    anomaly.some((t) => t.satelliteId === sat.id) ||
    orbital.some((t) => t.foreignSatId === sat.id)
  const isTarget =
    proximity.some((t) => t.targetAssetId === sat.id) ||
    signal.some((t) => t.targetLinkAssetId === sat.id) ||
    orbital.some((t) => t.targetAssetId === sat.id)

  if (THREAT_ACTOR_COUNTRIES.has(sat.country_code ?? "") && isActor) return "threat"
  if (isTarget) return "threatened"
  return sat.status
}

/** Returns satellites with status derived from threat data: threat actors (PRC/RUS/CIS) get "threat", targets get "threatened". */
export function useSatellitesWithDerivedStatus(fallback: SatelliteData[] = []): SatelliteData[] {
  const satellites = useFleetStore((s) => s.satellites)
  const proximityThreats = useThreatStore((s) => s.proximityThreats)
  const signalThreats = useThreatStore((s) => s.signalThreats)
  const anomalyThreats = useThreatStore((s) => s.anomalyThreats)
  const orbitalSimilarityThreats = useThreatStore((s) => s.orbitalSimilarityThreats)

  const source = satellites.length > 0 ? satellites : fallback

  return useMemo(() => {
    return source.map((sat) => ({
      ...sat,
      status: deriveStatus(
        sat,
        proximityThreats,
        signalThreats,
        anomalyThreats,
        orbitalSimilarityThreats,
      ),
    }))
  }, [
    source,
    proximityThreats,
    signalThreats,
    anomalyThreats,
    orbitalSimilarityThreats,
  ])
}

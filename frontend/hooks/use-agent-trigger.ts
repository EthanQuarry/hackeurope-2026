"use client"

import { useEffect, useRef } from "react"
import { useFleetRiskStore } from "@/stores/fleet-risk-store"
import { useThreatStore } from "@/stores/threat-store"
import { useFleetStore } from "@/stores/fleet-store"
import { useAgentOpsStore } from "@/stores/agent-ops-store"
import { DEMO_USA245_ID } from "@/lib/demo-trajectories"
import type {
  ProximityThreat,
  SignalThreat,
  AnomalyThreat,
  OrbitalSimilarityThreat,
  GeoLoiterThreat,
} from "@/types"

/* ── Threat candidate produced by matching logic ────── */

interface ThreatCandidate {
  type: "proximity" | "signal" | "anomaly" | "orbital" | "geoLoiter"
  confidence: number
  threatSatelliteId: string
  threatSatelliteName: string
  reason: string
  raw: ProximityThreat | SignalThreat | AnomalyThreat | OrbitalSimilarityThreat | GeoLoiterThreat
}

/* ── Debounce interval (ms) ─────────────────────────── */

const CHECK_INTERVAL_MS = 3_000

/**
 * Side-effect-only hook that monitors fleet risk data and sets a pending
 * threat alert when any satellite's risk crosses the configurable threshold.
 *
 * Does NOT auto-open the agent panel — it only queues the alert so the
 * sidebar button can show a warning badge. The user clicks to engage.
 */
export function useAgentTrigger(): void {
  const timelines = useFleetRiskStore((s) => s.timelines)
  const satellites = useFleetStore((s) => s.satellites)

  const proximityThreats = useThreatStore((s) => s.proximityThreats)
  const signalThreats = useThreatStore((s) => s.signalThreats)
  const anomalyThreats = useThreatStore((s) => s.anomalyThreats)
  const orbitalThreats = useThreatStore((s) => s.orbitalSimilarityThreats)
  const geoLoiterThreats = useThreatStore((s) => s.geoUsLoiterThreats)

  const lastCheckRef = useRef(0)

  useEffect(() => {
    const now = Date.now()
    if (now - lastCheckRef.current < CHECK_INTERVAL_MS) return
    lastCheckRef.current = now

    const store = useAgentOpsStore.getState()
    const { threshold, hasTriggered, activeSession, pendingThreat } = store

    /* Don't queue if a session is already running or an alert is pending */
    if (activeSession || pendingThreat) return
    if (satellites.length === 0) return

    for (const sat of satellites) {
      // Only USA-245 can trigger the autonomous agent panel
      if (sat.id !== DEMO_USA245_ID) continue

      const timeline = timelines[sat.id]
      if (!timeline || timeline.snapshots.length === 0) continue

      const latestRisk = timeline.snapshots[timeline.snapshots.length - 1].risk
      if (latestRisk < threshold) continue
      if (hasTriggered(sat.id)) continue

      /* ── Find matching threat with highest confidence ── */
      const candidates: ThreatCandidate[] = []

      for (const t of proximityThreats) {
        if (t.targetAssetId === sat.id) {
          candidates.push({
            type: "proximity",
            confidence: t.confidence,
            threatSatelliteId: t.foreignSatId,
            threatSatelliteName: t.foreignSatName,
            reason: `Proximity approach — ${t.approachPattern} pattern at ${t.missDistanceKm.toFixed(1)}km`,
            raw: t,
          })
        }
      }

      for (const t of signalThreats) {
        if (t.targetLinkAssetId === sat.id) {
          candidates.push({
            type: "signal",
            confidence: t.confidence,
            threatSatelliteId: t.interceptorId,
            threatSatelliteName: t.interceptorName,
            reason: `Signal interception — ${(t.interceptionProbability * 100).toFixed(0)}% probability`,
            raw: t,
          })
        }
      }

      for (const t of orbitalThreats) {
        if (t.targetAssetId === sat.id) {
          candidates.push({
            type: "orbital",
            confidence: t.confidence,
            threatSatelliteId: t.foreignSatId,
            threatSatelliteName: t.foreignSatName,
            reason: `Orbital similarity — ${t.pattern} pattern`,
            raw: t,
          })
        }
      }

      for (const t of anomalyThreats) {
        if (t.satelliteId === sat.id) {
          candidates.push({
            type: "anomaly",
            confidence: t.confidence,
            threatSatelliteId: sat.id,
            threatSatelliteName: sat.name,
            reason: `Anomalous behavior — ${t.anomalyType}`,
            raw: t,
          })
        }
      }

      for (const t of geoLoiterThreats) {
        if (t.satelliteId === sat.id) {
          candidates.push({
            type: "geoLoiter",
            confidence: t.confidence,
            threatSatelliteId: sat.id,
            threatSatelliteName: sat.name,
            reason: "Geo-stationary loiter over US territory",
            raw: t,
          })
        }
      }

      if (candidates.length === 0) continue

      candidates.sort((a, b) => b.confidence - a.confidence)
      const best = candidates[0]

      /* Extract threat-data fields */
      const raw = best.raw as unknown as Record<string, unknown>
      /* Look up the THREAT satellite's country, not the target's */
      const threatSat = satellites.find((s) => s.id === best.threatSatelliteId)
      const threatData = {
        missDistanceKm: raw.missDistanceKm as number | undefined,
        approachPattern: raw.approachPattern as string | undefined,
        tcaMinutes: raw.tcaInMinutes as number | undefined,
        countryCode: (threatSat?.country_code ?? raw.countryCode) as string | undefined,
        anomalyType: raw.anomalyType as string | undefined,
      }

      /* Queue the pending threat — sidebar will show warning badge */
      store.setPendingThreat({
        satelliteId: sat.id,
        satelliteName: sat.name,
        threatSatelliteId: best.threatSatelliteId,
        threatSatelliteName: best.threatSatelliteName,
        triggerRisk: latestRisk,
        triggerReason: best.reason,
        threatData,
      })

      break
    }
  }, [
    timelines,
    satellites,
    proximityThreats,
    signalThreats,
    anomalyThreats,
    orbitalThreats,
    geoLoiterThreats,
  ])
}

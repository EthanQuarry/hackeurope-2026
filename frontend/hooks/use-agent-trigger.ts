"use client"

import { useEffect, useRef } from "react"
import { useFleetRiskStore } from "@/stores/fleet-risk-store"
import { useThreatStore } from "@/stores/threat-store"
import { useFleetStore } from "@/stores/fleet-store"
import { useAgentOpsStore } from "@/stores/agent-ops-store"
import { useUIStore } from "@/stores/ui-store"
import { useAgentSimulation } from "./use-agent-simulation"
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
 * Side-effect-only hook that monitors fleet risk data and auto-triggers
 * an agent session when any satellite's risk crosses the configurable
 * threshold.
 *
 * Must be mounted once at the app root (e.g. inside DashboardShell).
 */
export function useAgentTrigger(): void {
  /* ── Subscribe to stores ───────────────────────────── */

  const timelines = useFleetRiskStore((s) => s.timelines)
  const satellites = useFleetStore((s) => s.satellites)

  const proximityThreats = useThreatStore((s) => s.proximityThreats)
  const signalThreats = useThreatStore((s) => s.signalThreats)
  const anomalyThreats = useThreatStore((s) => s.anomalyThreats)
  const orbitalThreats = useThreatStore((s) => s.orbitalSimilarityThreats)
  const geoLoiterThreats = useThreatStore((s) => s.geoUsLoiterThreats)

  const { runSimulation } = useAgentSimulation()

  /* ── Refs for debounce ─────────────────────────────── */

  const lastCheckRef = useRef(0)

  /* ── Effect: check on every timeline change ────────── */

  useEffect(() => {
    const now = Date.now()
    if (now - lastCheckRef.current < CHECK_INTERVAL_MS) return
    lastCheckRef.current = now

    /* Read threshold & trigger guard from agent-ops store (non-reactive read) */
    const store = useAgentOpsStore.getState()
    const { threshold, hasTriggered, activeSession } = store

    /* Don't trigger if a session is already running */
    if (activeSession) return

    /* Need satellites loaded */
    if (satellites.length === 0) return

    /* Iterate satellites — find FIRST one over threshold that hasn't fired */
    for (const sat of satellites) {
      const timeline = timelines[sat.id]
      if (!timeline || timeline.snapshots.length === 0) continue

      /* Latest risk value */
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

      /* Be defensive — no threat data, no trigger */
      if (candidates.length === 0) continue

      /* Pick highest-confidence threat */
      candidates.sort((a, b) => b.confidence - a.confidence)
      const best = candidates[0]

      /* ── Fire session ──────────────────────────────── */

      store.startSession({
        satelliteId: sat.id,
        satelliteName: sat.name,
        threatSatelliteId: best.threatSatelliteId,
        threatSatelliteName: best.threatSatelliteName,
        triggerRisk: latestRisk,
        triggerReason: best.reason,
      })

      /* Switch UI to agent-ops view */
      useUIStore.getState().setActiveView("agent-ops")

      /* Extract threat-data fields for the simulation */
      const raw = best.raw as unknown as Record<string, unknown>
      const threatData = {
        missDistanceKm: raw.missDistanceKm as number | undefined,
        approachPattern: raw.approachPattern as string | undefined,
        tcaMinutes: raw.tcaInMinutes as number | undefined,
        countryCode: (raw.countryCode ?? sat.country_code) as string | undefined,
        anomalyType: raw.anomalyType as string | undefined,
      }

      /* Kick off the simulation with threat context */
      runSimulation({
        satelliteId: sat.id,
        satelliteName: sat.name,
        threatSatelliteId: best.threatSatelliteId,
        threatSatelliteName: best.threatSatelliteName,
        triggerRisk: latestRisk,
        triggerReason: best.reason,
        threatData,
      })

      /* Only trigger for the FIRST satellite that crosses threshold */
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
    runSimulation,
  ])
}

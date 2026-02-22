"use client"

import { useEffect, useRef } from "react"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import { useFleetRiskStore } from "@/stores/fleet-risk-store"
import { computeFleetRisk } from "@/lib/fleet-risk"

/**
 * Add sensor-noise variance so the sparklines show realistic fluctuation.
 * Each satellite gets a seeded random walk that drifts ±15% around the true
 * Bayesian posterior, clamped to [0, 1].
 */
const driftState: Record<string, number> = {}

function addVariance(satId: string, trueRisk: number): number {
  if (trueRisk === 0) return 0
  const prev = driftState[satId] ?? 0
  // Random walk step: ±0.08 max per tick
  const step = (Math.random() - 0.5) * 0.16
  // Mean-revert toward 0 so drift doesn't run away
  const drift = prev * 0.7 + step
  driftState[satId] = drift
  return Math.max(0, Math.min(1, trueRisk + drift * trueRisk))
}

export function useFleetRiskAccumulator() {
  const satellites = useFleetStore((s) => s.satellites)
  const proximity = useThreatStore((s) => s.proximityThreats)
  const signal = useThreatStore((s) => s.signalThreats)
  const anomaly = useThreatStore((s) => s.anomalyThreats)
  const orbital = useThreatStore((s) => s.orbitalSimilarityThreats)
  const geoLoiter = useThreatStore((s) => s.geoUsLoiterThreats)
  const pushSnapshots = useFleetRiskStore((s) => s.pushSnapshots)
  const lastPushRef = useRef(0)

  useEffect(() => {
    const now = Date.now()
    if (now - lastPushRef.current < 2000) return
    if (satellites.length === 0) return
    lastPushRef.current = now

    const raw = computeFleetRisk(satellites, proximity, signal, anomaly, orbital, geoLoiter)
    const batch: Record<string, number> = {}
    for (const [id, risk] of Object.entries(raw)) {
      batch[id] = addVariance(id, risk)
    }
    pushSnapshots(batch, now)
  }, [satellites, proximity, signal, anomaly, orbital, geoLoiter, pushSnapshots])
}

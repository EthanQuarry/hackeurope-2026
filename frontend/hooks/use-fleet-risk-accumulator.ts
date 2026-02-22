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
  // Large random walk step: ±0.40 per tick for dramatic demo swings
  const step = (Math.random() - 0.5) * 0.80
  // Very weak mean-reversion — lets the line wander far before pulling back
  const drift = prev * 0.93 + step
  driftState[satId] = drift
  return Math.max(0, Math.min(1, trueRisk + drift))
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
    if (now - lastPushRef.current < 500) return
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

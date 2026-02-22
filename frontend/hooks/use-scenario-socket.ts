"use client"

import { useEffect, useRef, useCallback } from "react"
import { useGlobeStore } from "@/stores/globe-store"
import { useThreatStore } from "@/stores/threat-store"
import type { ProximityThreat, SignalThreat, AnomalyThreat, ThreatData } from "@/types"

interface ScenarioTick {
  type: "scenario_tick"
  phase: number
  phaseProgress: number
  elapsed: number
  sj26: { status: string; altitudeKm: number; missDistanceKm: number }
  proximityThreats: ProximityThreat[]
  signalThreats: SignalThreat[]
  anomalyThreats: AnomalyThreat[]
  threats: ThreatData[]
}

const BACKEND_WS_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:8000/ws/scenario`
    : ""

/**
 * Connects to /ws/scenario. The server pushes COMPLETE threat arrays
 * (general + fresh SJ-26) every tick. This is the sole source for
 * threat data — no REST polling needed for threats.
 */
export function useScenarioSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const speedRef = useRef(useGlobeStore.getState().speed)
  const priorRef = useRef(useGlobeStore.getState().priorAdversarial)

  // Store setters (stable references)
  const setProximity = useThreatStore((s) => s.setProximityThreats)
  const setSignal = useThreatStore((s) => s.setSignalThreats)
  const setAnomaly = useThreatStore((s) => s.setAnomalyThreats)
  const setThreats = useThreatStore((s) => s.setThreats)

  const lastStoreUpdate = useRef(0)
  const pendingTick = useRef<ScenarioTick | null>(null)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickCount = useRef(0)

  // Flush pending tick to stores — called at max ~4Hz
  const flushToStores = useCallback(
    (tick: ScenarioTick) => {
      setProximity(tick.proximityThreats)
      setSignal(tick.signalThreats)
      setAnomaly(tick.anomalyThreats)
      setThreats(tick.threats)
      lastStoreUpdate.current = performance.now()
      pendingTick.current = null
    },
    [setProximity, setSignal, setAnomaly, setThreats],
  )

  const handleTick = useCallback(
    (tick: ScenarioTick) => {
      tickCount.current++
      pendingTick.current = tick

      // Throttle: push to React stores at max ~4Hz (250ms) to avoid
      // re-rendering 55 satellite markers on every WebSocket tick
      const now = performance.now()
      const elapsed = now - lastStoreUpdate.current
      if (elapsed >= 250) {
        // Enough time passed — flush immediately
        if (flushTimer.current) {
          clearTimeout(flushTimer.current)
          flushTimer.current = null
        }
        flushToStores(tick)
      } else if (!flushTimer.current) {
        // Schedule a flush for when the throttle window expires
        flushTimer.current = setTimeout(() => {
          flushTimer.current = null
          if (pendingTick.current) flushToStores(pendingTick.current)
        }, 250 - elapsed)
      }
    },
    [flushToStores],
  )

  const connect = useCallback(() => {
    if (!BACKEND_WS_URL || !mountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(BACKEND_WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ speed: speedRef.current }))
    }

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as ScenarioTick
        if (data.type === "scenario_tick") {
          handleTick(data)
        }
      } catch {
        // ignore malformed
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      if (mountedRef.current) {
        reconnectTimer.current = setTimeout(connect, 2000)
      }
    }

    ws.onerror = () => ws.close()
  }, [handleTick])

  // Connect on mount
  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (flushTimer.current) clearTimeout(flushTimer.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  // Send speed changes
  const speed = useGlobeStore((s) => s.speed)
  useEffect(() => {
    speedRef.current = speed
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ speed }))
    }
  }, [speed])

  // Send prior changes
  const priorAdversarial = useGlobeStore((s) => s.priorAdversarial)
  useEffect(() => {
    priorRef.current = priorAdversarial
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ prior_adversarial: priorAdversarial }))
    }
  }, [priorAdversarial])
}

"use client"

import { useCallback, useRef } from "react"
import { useResponseStore } from "@/stores/response-store"
import { useThreatStore } from "@/stores/threat-store"
import { useUIStore } from "@/stores/ui-store"
import { api } from "@/lib/api"

interface TriggerParams {
  satelliteId: string
  satelliteName: string
  threatSatelliteId: string
  threatSatelliteName: string
  threatScore: number
  missDistanceKm?: number
  approachPattern?: string
  tcaMinutes?: number
  focusPosition?: { lat: number; lon: number; altKm: number }
}

export function useResponseStream() {
  const abortRef = useRef<AbortController | null>(null)
  const store = useResponseStore()
  const setFocusTarget = useThreatStore((s) => s.setFocusTarget)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const triggerResponse = useCallback(
    async (params: TriggerParams) => {
      // De-dupe: don't trigger twice for the same satellite
      if (store.hasTriggered(params.satelliteId)) return
      store.markTriggered(params.satelliteId)

      // Focus camera on the target satellite
      if (params.focusPosition) {
        setFocusTarget({
          lat: params.focusPosition.lat,
          lon: params.focusPosition.lon,
          altKm: params.focusPosition.altKm,
          satelliteId: params.satelliteId,
        })
      }

      // Open the command center (comms view)
      setActiveView("comms")

      // Abort any existing stream
      abortRef.current?.abort()
      store.startResponse({
        satelliteId: params.satelliteId,
        satelliteName: params.satelliteName,
        threatSatelliteId: params.threatSatelliteId,
        threatSatelliteName: params.threatSatelliteName,
        threatScore: params.threatScore,
      })

      const ctrl = new AbortController()
      abortRef.current = ctrl

      const urlParams = new URLSearchParams({
        satellite_id: params.satelliteId,
        satellite_name: params.satelliteName,
        threat_satellite_id: params.threatSatelliteId,
        threat_satellite_name: params.threatSatelliteName,
        threat_score: String(params.threatScore),
        miss_distance_km: String(params.missDistanceKm ?? 0),
        approach_pattern: params.approachPattern ?? "unknown",
        tca_minutes: String(params.tcaMinutes ?? 0),
      })

      const url = `${api.responseStream}?${urlParams.toString()}`

      try {
        const res = await fetch(url, { signal: ctrl.signal })
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            try {
              const event = JSON.parse(line.slice(6))
              switch (event.type) {
                case "response_progress":
                  store.addReasoning(event.text)
                  break
                case "response_tool":
                  store.addToolCall(event.text)
                  store.addReasoning(event.text)
                  break
                case "response_complete":
                  store.setDecision(event.data)
                  break
                case "response_error":
                  store.setError(event.message)
                  break
              }
            } catch {
              /* skip malformed SSE lines */
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return
        console.warn("Response stream failed:", e)
        store.setError(String(e))
      }
    },
    [store, setFocusTarget, setActiveView],
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
    store.close()
  }, [store])

  return { triggerResponse, abort }
}

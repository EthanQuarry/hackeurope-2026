"use client"

import { useCallback, useRef } from "react"
import { useCommsStore } from "@/stores/comms-store"
import { getMockCommsTranscription } from "@/lib/mock-comms"
import { api } from "@/lib/api"

export function useCommsStream() {
  const abortRef = useRef<AbortController | null>(null)
  const store = useCommsStore()

  const sendCommand = useCallback(
    async (message: string, targetSatelliteId?: string) => {
      // Abort any existing stream
      abortRef.current?.abort()
      store.startComms(message)

      const ctrl = new AbortController()
      abortRef.current = ctrl

      let url = `${api.commsStream}?message=${encodeURIComponent(message)}`
      if (targetSatelliteId) {
        url += `&target_satellite_id=${encodeURIComponent(targetSatelliteId)}`
      }

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
                case "comms_stage":
                  switch (event.stage) {
                    case "parsed_intent":
                      store.setParsedIntent(event.data)
                      break
                    case "at_commands":
                      store.setATCommands(event.data)
                      break
                    case "sbd_payload":
                      store.setSBDPayload(event.data)
                      break
                    case "gateway_routing":
                      store.setGatewayRouting(event.data)
                      break
                    case "agent_reasoning":
                      store.addReasoningLog(event.data.text)
                      break
                  }
                  break
                case "comms_complete":
                  store.completeComms(event.data)
                  break
                case "comms_error":
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
        // Fallback to mock data when backend is unavailable
        console.warn("Comms stream failed, using mock data:", e)
        const mock = getMockCommsTranscription(message)
        // Simulate staged delivery
        await new Promise((r) => setTimeout(r, 400))
        store.setParsedIntent(mock.parsed_intent)
        await new Promise((r) => setTimeout(r, 400))
        store.setATCommands(mock.at_commands)
        await new Promise((r) => setTimeout(r, 400))
        store.setSBDPayload(mock.sbd_payload)
        await new Promise((r) => setTimeout(r, 400))
        store.setGatewayRouting(mock.gateway_routing)
        await new Promise((r) => setTimeout(r, 300))
        store.completeComms(mock)
      }
    },
    [store],
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
    store.reset()
  }, [store])

  return { sendCommand, abort }
}

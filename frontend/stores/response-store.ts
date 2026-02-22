import { create } from "zustand"
import type { ThreatResponseDecision } from "@/types"

interface ResponseState {
  isOpen: boolean
  isStreaming: boolean
  satelliteId: string | null
  satelliteName: string | null
  threatSatelliteId: string | null
  threatSatelliteName: string | null
  threatScore: number
  reasoningLog: string[]
  toolCalls: string[]
  decision: ThreatResponseDecision | null
  error: string | null
  triggeredSatelliteIds: Set<string>

  startResponse: (params: {
    satelliteId: string
    satelliteName: string
    threatSatelliteId: string
    threatSatelliteName: string
    threatScore: number
  }) => void
  addReasoning: (text: string) => void
  addToolCall: (text: string) => void
  setDecision: (decision: ThreatResponseDecision) => void
  setError: (error: string) => void
  close: () => void
  markTriggered: (satelliteId: string) => void
  hasTriggered: (satelliteId: string) => boolean
}

export const useResponseStore = create<ResponseState>((set, get) => ({
  isOpen: false,
  isStreaming: false,
  satelliteId: null,
  satelliteName: null,
  threatSatelliteId: null,
  threatSatelliteName: null,
  threatScore: 0,
  reasoningLog: [],
  toolCalls: [],
  decision: null,
  error: null,
  triggeredSatelliteIds: new Set(),

  startResponse: (params) =>
    set({
      isOpen: true,
      isStreaming: true,
      satelliteId: params.satelliteId,
      satelliteName: params.satelliteName,
      threatSatelliteId: params.threatSatelliteId,
      threatSatelliteName: params.threatSatelliteName,
      threatScore: params.threatScore,
      reasoningLog: [],
      toolCalls: [],
      decision: null,
      error: null,
    }),

  addReasoning: (text) =>
    set((s) => ({ reasoningLog: [...s.reasoningLog, text] })),

  addToolCall: (text) =>
    set((s) => ({ toolCalls: [...s.toolCalls, text] })),

  setDecision: (decision) =>
    set({ decision, isStreaming: false }),

  setError: (error) =>
    set({ error, isStreaming: false }),

  close: () =>
    set({
      isOpen: false,
      isStreaming: false,
      reasoningLog: [],
      toolCalls: [],
      decision: null,
      error: null,
    }),

  markTriggered: (satelliteId) =>
    set((s) => {
      const next = new Set(s.triggeredSatelliteIds)
      next.add(satelliteId)
      return { triggeredSatelliteIds: next }
    }),

  hasTriggered: (satelliteId) => get().triggeredSatelliteIds.has(satelliteId),
}))

import { create } from "zustand"
import type {
  AgentFlowStep,
  AgentFlowStepId,
  AgentSession,
  AgentResponseOption,
  AgentThinkingLine,
} from "@/types"

/* ── Default flowchart steps ─────────────────────────── */

function createDefaultSteps(): AgentFlowStep[] {
  return [
    { id: "threshold-breach", label: "Threshold Breach Detected", status: "pending", thinkingLines: [], summary: null, startedAt: null, completedAt: null },
    { id: "deep-research-target", label: "Deep Research — Target Asset", status: "pending", thinkingLines: [], summary: null, startedAt: null, completedAt: null },
    { id: "deep-research-threat", label: "Deep Research — Threat Actor", status: "pending", thinkingLines: [], summary: null, startedAt: null, completedAt: null },
    { id: "geopolitical-analysis", label: "Geopolitical Context Analysis", status: "pending", thinkingLines: [], summary: null, startedAt: null, completedAt: null },
    { id: "threat-assessment", label: "US Intelligence Threat Assessment", status: "pending", thinkingLines: [], summary: null, startedAt: null, completedAt: null },
    { id: "response-selection", label: "Response Protocol Selection", status: "pending", thinkingLines: [], summary: null, startedAt: null, completedAt: null },
  ]
}

/* ── Pending threat (queued by trigger, consumed on user click) ── */

export interface PendingThreat {
  satelliteId: string
  satelliteName: string
  threatSatelliteId: string
  threatSatelliteName: string
  triggerRisk: number
  triggerReason: string
  threatData: {
    missDistanceKm?: number
    approachPattern?: string
    tcaMinutes?: number
    countryCode?: string
    anomalyType?: string
  }
}

/* ── Store interface ─────────────────────────────────── */

interface AgentOpsState {
  /** Configurable risk threshold (0-1) that triggers the agent */
  threshold: number
  setThreshold: (value: number) => void

  /** Queued threat waiting for user to open the agent panel */
  pendingThreat: PendingThreat | null
  setPendingThreat: (threat: PendingThreat) => void
  clearPendingThreat: () => void

  /** Current active agent session (null = no agent running) */
  activeSession: AgentSession | null

  /** Historical completed sessions */
  history: AgentSession[]

  /** Set of satellite IDs already triggered (de-dupe) */
  triggeredIds: Set<string>

  /** Start a new agent session */
  startSession: (params: {
    satelliteId: string
    satelliteName: string
    threatSatelliteId: string
    threatSatelliteName: string
    triggerRisk: number
    triggerReason: string
  }) => void

  /** Activate a specific flowchart step */
  activateStep: (stepId: AgentFlowStepId) => void

  /** Add a thinking line to a step */
  addThinkingLine: (stepId: AgentFlowStepId, line: Omit<AgentThinkingLine, "id" | "timestamp">) => void

  /** Complete a step with an optional summary */
  completeStep: (stepId: AgentFlowStepId, summary?: string) => void

  /** Set the response options */
  setResponses: (responses: AgentResponseOption[]) => void

  /** Select a final response */
  selectResponse: (response: AgentResponseOption) => void

  /** Set the geopolitical context */
  setGeopoliticalContext: (context: string) => void

  /** Set the threat level */
  setThreatLevel: (level: AgentSession["threatLevel"]) => void

  /** Complete the entire session */
  completeSession: () => void

  /** Dismiss / close the active session */
  dismissSession: () => void

  /** Check if a satellite has already been triggered */
  hasTriggered: (satelliteId: string) => boolean

  /** Reset all triggered IDs */
  resetTriggers: () => void
}

let lineCounter = 0

export const useAgentOpsStore = create<AgentOpsState>((set, get) => ({
  threshold: 0.7,
  pendingThreat: null,
  activeSession: null,
  history: [],
  triggeredIds: new Set(),

  setThreshold: (value) => set({ threshold: value }),

  setPendingThreat: (threat) => {
    const next = new Set(get().triggeredIds)
    next.add(threat.satelliteId)
    set({ pendingThreat: threat, triggeredIds: next })
  },

  clearPendingThreat: () => set({ pendingThreat: null }),

  startSession: (params) => {
    const session: AgentSession = {
      id: `agent-${Date.now()}`,
      satelliteId: params.satelliteId,
      satelliteName: params.satelliteName,
      threatSatelliteId: params.threatSatelliteId,
      threatSatelliteName: params.threatSatelliteName,
      triggerRisk: params.triggerRisk,
      triggerReason: params.triggerReason,
      startedAt: Date.now(),
      completedAt: null,
      steps: createDefaultSteps(),
      selectedResponse: null,
      allResponses: [],
      threatLevel: "medium",
      geopoliticalContext: null,
    }
    const next = new Set(get().triggeredIds)
    next.add(params.satelliteId)
    set({ activeSession: session, triggeredIds: next })
  },

  activateStep: (stepId) =>
    set((s) => {
      if (!s.activeSession) return s
      return {
        activeSession: {
          ...s.activeSession,
          steps: s.activeSession.steps.map((step: AgentFlowStep) =>
            step.id === stepId
              ? { ...step, status: "active" as const, startedAt: Date.now() }
              : step,
          ),
        },
      }
    }),

  addThinkingLine: (stepId, line) =>
    set((s) => {
      if (!s.activeSession) return s
      lineCounter++
      const newLine: AgentThinkingLine = {
        id: lineCounter,
        text: line.text,
        type: line.type,
        timestamp: Date.now(),
      }
      return {
        activeSession: {
          ...s.activeSession,
          steps: s.activeSession.steps.map((step: AgentFlowStep) =>
            step.id === stepId
              ? { ...step, thinkingLines: [...step.thinkingLines, newLine] }
              : step,
          ),
        },
      }
    }),

  completeStep: (stepId, summary) =>
    set((s) => {
      if (!s.activeSession) return s
      return {
        activeSession: {
          ...s.activeSession,
          steps: s.activeSession.steps.map((step: AgentFlowStep) =>
            step.id === stepId
              ? { ...step, status: "complete" as const, completedAt: Date.now(), summary: summary ?? step.summary }
              : step,
          ),
        },
      }
    }),

  setResponses: (responses) =>
    set((s) => {
      if (!s.activeSession) return s
      return {
        activeSession: { ...s.activeSession, allResponses: responses },
      }
    }),

  selectResponse: (response) =>
    set((s) => {
      if (!s.activeSession) return s
      return {
        activeSession: { ...s.activeSession, selectedResponse: response },
      }
    }),

  setGeopoliticalContext: (context) =>
    set((s) => {
      if (!s.activeSession) return s
      return {
        activeSession: { ...s.activeSession, geopoliticalContext: context },
      }
    }),

  setThreatLevel: (level) =>
    set((s) => {
      if (!s.activeSession) return s
      return {
        activeSession: { ...s.activeSession, threatLevel: level },
      }
    }),

  completeSession: () =>
    set((s) => {
      if (!s.activeSession) return s
      const completed = { ...s.activeSession, completedAt: Date.now() }
      return {
        activeSession: completed,
        history: [...s.history, completed],
      }
    }),

  dismissSession: () => set({ activeSession: null }),

  hasTriggered: (satelliteId) => get().triggeredIds.has(satelliteId),

  resetTriggers: () => set({ triggeredIds: new Set() }),
}))

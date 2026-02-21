import { create } from "zustand"
import type {
  CommsTranscription,
  ParsedIntent,
  ATCommandSequence,
  SBDPayload,
  GatewayRouting,
  CommsStage,
} from "@/types"

interface CommsState {
  // Current transcription in progress
  isStreaming: boolean
  currentStage: CommsStage | null
  humanInput: string | null
  parsedIntent: ParsedIntent | null
  atCommands: ATCommandSequence | null
  sbdPayload: SBDPayload | null
  gatewayRouting: GatewayRouting | null
  agentReasoningLog: string[]
  error: string | null

  // History of completed transcriptions
  history: CommsTranscription[]

  // Actions
  startComms: (message: string) => void
  setParsedIntent: (intent: ParsedIntent) => void
  setATCommands: (commands: ATCommandSequence) => void
  setSBDPayload: (payload: SBDPayload) => void
  setGatewayRouting: (routing: GatewayRouting) => void
  addReasoningLog: (text: string) => void
  completeComms: (transcription: CommsTranscription) => void
  setError: (error: string) => void
  reset: () => void
}

export const useCommsStore = create<CommsState>((set) => ({
  isStreaming: false,
  currentStage: null,
  humanInput: null,
  parsedIntent: null,
  atCommands: null,
  sbdPayload: null,
  gatewayRouting: null,
  agentReasoningLog: [],
  error: null,
  history: [],

  startComms: (message) =>
    set({
      isStreaming: true,
      currentStage: "human_input",
      humanInput: message,
      parsedIntent: null,
      atCommands: null,
      sbdPayload: null,
      gatewayRouting: null,
      agentReasoningLog: [],
      error: null,
    }),

  setParsedIntent: (intent) =>
    set({ parsedIntent: intent, currentStage: "parsed_intent" }),

  setATCommands: (commands) =>
    set({ atCommands: commands, currentStage: "at_commands" }),

  setSBDPayload: (payload) =>
    set({ sbdPayload: payload, currentStage: "sbd_payload" }),

  setGatewayRouting: (routing) =>
    set({ gatewayRouting: routing, currentStage: "gateway_routing" }),

  addReasoningLog: (text) =>
    set((s) => ({
      agentReasoningLog: [...s.agentReasoningLog, text],
      currentStage: "agent_reasoning",
    })),

  completeComms: (transcription) =>
    set((s) => ({
      isStreaming: false,
      history: [transcription, ...s.history],
    })),

  setError: (error) => set({ isStreaming: false, error }),

  reset: () =>
    set({
      isStreaming: false,
      currentStage: null,
      humanInput: null,
      parsedIntent: null,
      atCommands: null,
      sbdPayload: null,
      gatewayRouting: null,
      agentReasoningLog: [],
      error: null,
    }),
}))

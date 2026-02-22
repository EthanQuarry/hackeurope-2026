import { create } from "zustand"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

/** Per-satellite research data that persists across navigation */
interface SatelliteResearch {
  report: string | null
  logs: string[]
  chatMessages: ChatMessage[]
}

interface AdversaryState {
  /** Map of satellite ID → research data */
  research: Record<string, SatelliteResearch>

  /** Get or create research entry for a satellite */
  getResearch: (satId: string) => SatelliteResearch

  /** Set the full report for a satellite (or append) */
  setReport: (satId: string, report: string) => void

  /** Append a section to an existing report */
  appendToReport: (satId: string, section: string) => void

  /** Set research logs */
  setLogs: (satId: string, logs: string[]) => void

  /** Append a single log entry */
  appendLog: (satId: string, log: string) => void

  /** Clear logs (e.g. when starting new research) */
  clearLogs: (satId: string) => void

  /** Set chat messages */
  setChatMessages: (satId: string, messages: ChatMessage[]) => void

  /** Append a chat message */
  appendChatMessage: (satId: string, message: ChatMessage) => void
}

const EMPTY_RESEARCH: SatelliteResearch = { report: null, logs: [], chatMessages: [] }

export const useAdversaryStore = create<AdversaryState>((set, get) => ({
  research: {},

  getResearch: (satId) => get().research[satId] ?? EMPTY_RESEARCH,

  setReport: (satId, report) =>
    set((s) => ({
      research: {
        ...s.research,
        [satId]: { ...(s.research[satId] ?? EMPTY_RESEARCH), report },
      },
    })),

  appendToReport: (satId, section) =>
    set((s) => {
      const existing = s.research[satId] ?? EMPTY_RESEARCH
      const newReport = existing.report
        ? existing.report + "\n\n" + section
        : section
      return {
        research: {
          ...s.research,
          [satId]: { ...existing, report: newReport },
        },
      }
    }),

  setLogs: (satId, logs) =>
    set((s) => ({
      research: {
        ...s.research,
        [satId]: { ...(s.research[satId] ?? EMPTY_RESEARCH), logs },
      },
    })),

  appendLog: (satId, log) =>
    set((s) => {
      const existing = s.research[satId] ?? EMPTY_RESEARCH
      return {
        research: {
          ...s.research,
          [satId]: { ...existing, logs: [...existing.logs, log] },
        },
      }
    }),

  clearLogs: (satId) =>
    set((s) => ({
      research: {
        ...s.research,
        [satId]: { ...(s.research[satId] ?? EMPTY_RESEARCH), logs: [] },
      },
    })),

  setChatMessages: (satId, messages) =>
    set((s) => ({
      research: {
        ...s.research,
        [satId]: { ...(s.research[satId] ?? EMPTY_RESEARCH), chatMessages: messages },
      },
    })),

  appendChatMessage: (satId, message) =>
    set((s) => {
      const existing = s.research[satId] ?? EMPTY_RESEARCH
      return {
        research: {
          ...s.research,
          [satId]: { ...existing, chatMessages: [...existing.chatMessages, message] },
        },
      }
    }),
}))

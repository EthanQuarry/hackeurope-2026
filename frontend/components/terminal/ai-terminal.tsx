"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { ChevronUp, Play, Square, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { TerminalEntry } from "@/components/terminal/terminal-entry"
import { useAdversaryStore } from "@/stores/adversary-store"
import type { TerminalLogEntry } from "@/types"

export interface AITerminalHandle {
  triggerWithPrompt(prompt: string): void
}

interface AITerminalProps {
  isOpen: boolean
  onToggle: () => void
  className?: string
}

function formatTime(): string {
  const d = new Date()
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/** Map SSE event type to a color-coded terminal entry */
function eventToLog(event: Record<string, unknown>, id: number): TerminalLogEntry {
  const ts = formatTime()
  const agent = (event.agent as string) ?? "system"
  const type = event.type as string

  switch (type) {
    case "scan":
      return { id, timestamp: ts, text: `[L1 SCAN] ${event.text ?? "scanning orbital environment..."}`, color: "text-gray-400", layer: "scan" }
    case "context":
      return { id, timestamp: ts, text: `[L2 CTX] ${agent}: ${event.text ?? "building context..."}`, color: "text-blue-400", layer: "context" }
    case "reasoning":
      return { id, timestamp: ts, text: `[L3 RSN] ${agent}: ${event.text ?? "reasoning..."}`, color: "text-purple-400", layer: "reasoning" }
    case "tool_call":
      return { id, timestamp: ts, text: `[TOOL] ${agent} -> ${(event.tools as string[])?.join(", ") ?? event.tool ?? ""}`, color: "text-yellow-300", layer: "tool" }
    case "tool_result":
      return { id, timestamp: ts, text: `[RESULT] ${agent}.${event.tool}: ${(event.summary as string)?.slice(0, 120) ?? "done"}`, color: "text-emerald-300", layer: "result" }
    case "intent":
      return { id, timestamp: ts, text: `[INTENT] ${event.classification ?? "unknown"} — confidence ${((event.confidence as number) * 100).toFixed(0)}%`, color: "text-cyan-400", layer: "intent" }
    case "error":
      return { id, timestamp: ts, text: `[ERROR] ${event.message ?? event.text ?? "unknown error"}`, color: "text-red-400", layer: "error" }
    case "complete":
      return { id, timestamp: ts, text: "analysis pipeline complete", color: "text-green-400 font-bold" }
    default:
      return { id, timestamp: ts, text: `${agent}: ${JSON.stringify(event).slice(0, 120)}`, color: "text-gray-400" }
  }
}

/** Mock SSE stream for development — generates realistic analysis events */
function* mockAnalysisStream(): Generator<Record<string, unknown>> {
  yield { type: "scan", text: "initiating orbital scan — 2,487 tracked objects in LEO" }
  yield { type: "scan", text: "cross-referencing conjunction database... 3 active events" }
  yield { type: "context", agent: "orbital-analyst", text: "evaluating SPECTER-4 conjunction — miss distance 0.8 km, TCA T+20 min" }
  yield { type: "context", agent: "orbital-analyst", text: "secondary object COSMOS 2251 DEB — uncontrolled, tumbling, no maneuver capability" }
  yield { type: "reasoning", agent: "threat-assessor", text: "debris on predicted COLA trajectory — computing collision probability" }
  yield { type: "tool_call", agent: "threat-assessor", tools: ["compute_pc", "propagate_orbit"] }
  yield { type: "tool_result", agent: "threat-assessor", tool: "compute_pc", summary: "Pc = 1.2e-3 (threshold 1e-4) — HIGH RISK" }
  yield { type: "intent", classification: "Uncontrolled debris — no hostile intent", confidence: 0.95 }
  yield { type: "reasoning", agent: "response-planner", text: "Pc exceeds threshold — evaluating avoidance maneuver options" }
  yield { type: "tool_call", agent: "response-planner", tools: ["plan_maneuver", "check_constraints"] }
  yield { type: "tool_result", agent: "response-planner", tool: "plan_maneuver", summary: "optimal burn: along-track +0.12 m/s at T-15 min, miss distance improves to 42 km" }
  yield { type: "context", agent: "orbital-analyst", text: "evaluating OVERWATCH-2 conjunction — miss distance 12.4 km, TCA T+60 min" }
  yield { type: "reasoning", agent: "threat-assessor", text: "secondary object exhibiting anomalous maneuvering — 3 burns in 48h" }
  yield { type: "intent", classification: "Maneuvering — intent unclear", confidence: 0.62 }
  yield { type: "reasoning", agent: "threat-assessor", text: "low confidence on intent — recommend continued monitoring, escalate if miss distance decreases" }
  yield { type: "complete" }
}

export const AITerminal = forwardRef<AITerminalHandle, AITerminalProps>(
  function AITerminal({ isOpen, onToggle, className }, ref) {
    const adversaryResearch = useAdversaryStore((s) => s.research)

    const [logs, setLogs] = useState<TerminalLogEntry[]>([
      {
        id: 0,
        timestamp: "--:--:--",
        text: "orbital shield analysis terminal ready",
        color: "text-gray-500",
      },
    ])

    // Fix hydration: set real timestamp after mount
    useEffect(() => {
      setLogs((prev) => prev.map((l) => l.id === 0 ? { ...l, timestamp: formatTime() } : l))
    }, [])
    const [running, setRunning] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const abortRef = useRef(false)
    const idRef = useRef(1)

    // Auto-scroll to bottom
    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }, [logs])

    const startPipeline = useCallback(
      async (prompt?: string) => {
        if (running) return
        setRunning(true)
        abortRef.current = false

        const initMsg = prompt
          ? "auto-triggered — connecting to analysis pipeline..."
          : "connecting to analysis pipeline..."
        setLogs([{ id: 0, timestamp: formatTime(), text: initMsg, color: "text-cyan-400" }])
        idRef.current = 1

        // Try real SSE endpoint first, fall back to mock
        try {
          // Build prompt with adversary intelligence context
          let enrichedPrompt = prompt ?? ""
          const dossierSummaries = Object.entries(adversaryResearch)
            .filter(([, r]) => r.report)
            .map(([id, r]) => `[${id}] ${r.report!.slice(0, 500)}`)
            .join("\n\n")

          if (dossierSummaries) {
            enrichedPrompt = (enrichedPrompt ? enrichedPrompt + "\n\n" : "") +
              "Adversary intelligence context:\n" + dossierSummaries
          }

          let url = "/api/backend/analysis/stream"
          if (enrichedPrompt) url += `?prompt=${encodeURIComponent(enrichedPrompt)}`

          const ctrl = new AbortController()
          const res = await fetch(url, { signal: ctrl.signal }).catch(() => null)

          if (res?.ok && res.body) {
            // Real SSE stream
            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""

            while (!abortRef.current) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split("\n")
              buffer = lines.pop() ?? ""

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue
                try {
                  const event = JSON.parse(line.slice(6))
                  const log = eventToLog(event, idRef.current++)
                  setLogs((prev) => [...prev, log])
                } catch {
                  // skip malformed
                }
              }
            }
          } else {
            // Mock stream for development
            const gen = mockAnalysisStream()
            for (const event of gen) {
              if (abortRef.current) break
              await new Promise((r) => setTimeout(r, 600 + Math.random() * 800))
              const log = eventToLog(event, idRef.current++)
              setLogs((prev) => [...prev, log])
            }
          }
        } catch (e) {
          if (!abortRef.current) {
            setLogs((prev) => [
              ...prev,
              { id: idRef.current++, timestamp: formatTime(), text: `error: ${e}`, color: "text-red-400" },
            ])
          }
        } finally {
          setRunning(false)
        }
      },
      [running, adversaryResearch]
    )

    const stopPipeline = useCallback(() => {
      abortRef.current = true
      setLogs((prev) => [
        ...prev,
        { id: idRef.current++, timestamp: formatTime(), text: "pipeline aborted by operator", color: "text-orange-400" },
      ])
      setRunning(false)
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        triggerWithPrompt(prompt: string) {
          void startPipeline(prompt)
        },
      }),
      [startPipeline]
    )

    return (
      <div className={cn("pointer-events-auto w-full", className)}>
        <div
          className={cn(
            "overflow-hidden rounded-t-xl border border-border/60 bg-black/85 shadow-2xl transition-[max-height] duration-500 ease-in-out backdrop-blur-lg",
            isOpen ? "max-h-72" : "max-h-11"
          )}
        >
          {/* Toggle bar */}
          <button
            type="button"
            onClick={onToggle}
            className="flex h-11 w-full items-center justify-between px-4 text-xs font-semibold uppercase tracking-wide text-gray-300 hover:bg-white/5"
          >
            <span className="flex items-center gap-2">
              Analysis Terminal
              {running && <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />}
            </span>
            <div className="flex items-center gap-2">
              {!running ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    startPipeline()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation()
                      startPipeline()
                    }
                  }}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-emerald-400 hover:bg-emerald-400/10"
                >
                  <Play className="h-3 w-3" /> Run
                </span>
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    stopPipeline()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation()
                      stopPipeline()
                    }
                  }}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-red-400 hover:bg-red-400/10"
                >
                  <Square className="h-3 w-3" /> Stop
                </span>
              )}
              <ChevronUp
                className={cn(
                  "h-4 w-4 transition-transform duration-300",
                  isOpen && "rotate-180"
                )}
              />
            </div>
          </button>

          {/* Log content */}
          <div className="h-60 border-t border-border/40 px-4 py-3">
            <div
              ref={scrollRef}
              className="h-full overflow-auto rounded-md bg-black/50 p-3 font-mono text-xs scrollbar-hidden"
            >
              {logs.map((entry) => (
                <TerminalEntry key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
)

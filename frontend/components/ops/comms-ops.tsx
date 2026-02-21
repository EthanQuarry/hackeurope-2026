"use client"

import { useState, useCallback } from "react"
import { Send, Loader2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useCommsStore } from "@/stores/comms-store"
import { useFleetStore } from "@/stores/fleet-store"
import { useCommsStream } from "@/hooks/use-comms-stream"
import { CommsTranscriptionView } from "@/components/ops/comms-transcription-view"

const EXAMPLE_COMMANDS = [
  "Redirect USA-245 to avoid SJ-26 collision",
  "Request telemetry status from COSMOS-2558",
  "Activate emergency safe mode on ISS",
  "Adjust SENTINEL-2A attitude for optimal imaging",
]

export function CommsOps() {
  const { sendCommand } = useCommsStream()
  const isStreaming = useCommsStore((s) => s.isStreaming)
  const history = useCommsStore((s) => s.history)
  const selectedSatelliteId = useFleetStore((s) => s.selectedSatelliteId)
  const satellites = useFleetStore((s) => s.satellites)

  const [input, setInput] = useState("")

  const selectedSat = satellites.find((s) => s.id === selectedSatelliteId)

  const handleSubmit = useCallback(() => {
    const msg = input.trim()
    if (!msg || isStreaming) return
    sendCommand(msg, selectedSatelliteId ?? undefined)
    setInput("")
  }, [input, isStreaming, sendCommand, selectedSatelliteId])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const handleExample = useCallback(
    (cmd: string) => {
      if (isStreaming) return
      sendCommand(cmd, selectedSatelliteId ?? undefined)
    },
    [isStreaming, sendCommand, selectedSatelliteId],
  )

  return (
    <div className="mx-auto grid h-full w-full max-w-[1600px] grid-cols-[22rem_minmax(0,1fr)_22rem] gap-4">
      {/* ─── Left panel: Command input + history ─── */}
      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-l-sm rounded-r-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
        {/* Header */}
        <div className="border-b border-border/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", isStreaming ? "bg-cyan-400 animate-pulse" : "bg-emerald-400")} />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
              Iridium Comms
            </h2>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Natural language → SBD protocol translation
          </p>
        </div>

        {/* Target satellite indicator */}
        {selectedSat && (
          <div className="border-b border-border/40 px-5 py-2">
            <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
              Target Satellite
            </div>
            <div className="mt-0.5 font-mono text-[11px] font-semibold text-foreground">
              {selectedSat.name}
            </div>
          </div>
        )}

        {/* Command input */}
        <div className="border-b border-border/40 p-4">
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command in plain English..."
              disabled={isStreaming}
              rows={3}
              className={cn(
                "w-full resize-none rounded-md border border-border/60 bg-secondary/30 px-3 py-2 pr-10",
                "font-mono text-[11px] text-foreground placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-1 focus:ring-primary/50",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!input.trim() || isStreaming}
              className={cn(
                "absolute right-2 bottom-2 flex h-6 w-6 items-center justify-center rounded",
                "transition-colors",
                input.trim() && !isStreaming
                  ? "bg-primary/20 text-primary hover:bg-primary/30"
                  : "text-muted-foreground/30 cursor-not-allowed",
              )}
            >
              {isStreaming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Example commands */}
        {history.length === 0 && !isStreaming && (
          <div className="border-b border-border/40 p-4">
            <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-2">
              Example Commands
            </div>
            <div className="space-y-1.5">
              {EXAMPLE_COMMANDS.map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => handleExample(cmd)}
                  className="w-full rounded-md border border-border/30 px-3 py-2 text-left font-mono text-[10px] text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <>
            <div className="border-b border-border/40 px-5 py-2">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Command History
              </span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-1 p-2">
                {history.map((tx) => (
                  <div
                    key={tx.transcription_id}
                    className="rounded-md border border-border/30 px-3 py-2"
                  >
                    <div className="font-mono text-[10px] font-medium text-foreground truncate">
                      {tx.human_input}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-[9px] text-muted-foreground">
                        → {tx.parsed_intent.target_satellite_name}
                      </span>
                      <span className="rounded bg-secondary/50 px-1 py-0.5 font-mono text-[8px] uppercase text-muted-foreground">
                        {tx.parsed_intent.command_type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[8px] text-muted-foreground/60">
                      via {tx.gateway_routing.selected_gateway.name} · {tx.sbd_payload.total_bytes}B · {tx.gateway_routing.estimated_latency_ms}ms
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      {/* ─── Center: Globe shows through ─── */}
      <div />

      {/* ─── Right panel: Transcription stages ─── */}
      <CommsTranscriptionView />
    </div>
  )
}

"use client"

import { useEffect, useRef } from "react"
import { X, ShieldAlert, Cpu, Crosshair, Zap, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useResponseStore } from "@/stores/response-store"

function formatTime() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function ThreatResponseOverlay() {
  const {
    isOpen, isStreaming, satelliteName, threatSatelliteName,
    threatScore, reasoningLog, toolCalls, decision, error, close,
  } = useResponseStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll reasoning log
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [reasoningLog, toolCalls])

  if (!isOpen) return null

  return (
    <div className="pointer-events-auto fixed bottom-6 right-6 z-50 w-[420px]">
      <div className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-black/90 shadow-[0_0_80px_rgba(255,0,0,0.15)] backdrop-blur-xl">

        {/* Scanning line animation */}
        {isStreaming && (
          <div className="absolute inset-x-0 top-0 h-[2px] overflow-hidden">
            <div className="h-full w-1/3 animate-[scan_2s_linear_infinite] bg-gradient-to-r from-transparent via-red-500 to-transparent" />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/5 px-5 py-3">
          <div className={cn("h-2.5 w-2.5 rounded-full", isStreaming ? "bg-red-500 animate-pulse" : decision ? "bg-emerald-400" : "bg-red-500")}>
            <div className={cn("h-full w-full rounded-full", isStreaming && "animate-ping bg-red-500/50")} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-red-400">
                Threat Response Agent
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-gray-500">
              {isStreaming ? "ANALYSING THREAT VECTOR..." : decision ? "ANALYSIS COMPLETE" : "INITIALISING..."}
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] text-gray-500">{formatTime()}</div>
            <div className="font-mono text-lg font-bold tabular-nums text-red-400">{threatScore}%</div>
          </div>
          <button onClick={close} className="ml-2 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Target info strip */}
        <div className="flex items-center gap-4 border-b border-white/5 bg-white/[0.02] px-5 py-2">
          <div className="flex items-center gap-1.5">
            <Crosshair className="h-3 w-3 text-blue-400" />
            <span className="font-mono text-[10px] text-gray-400">TARGET</span>
            <span className="font-mono text-[11px] font-semibold text-blue-400">{satelliteName ?? "..."}</span>
          </div>
          <div className="h-3 w-px bg-white/10" />
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-red-400" />
            <span className="font-mono text-[10px] text-gray-400">THREAT</span>
            <span className="font-mono text-[11px] font-semibold text-red-400">{threatSatelliteName ?? "..."}</span>
          </div>
        </div>

        {/* Reasoning stream */}
        <div ref={scrollRef} className="max-h-[200px] min-h-[120px] overflow-y-auto px-5 py-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
          {reasoningLog.length === 0 && isStreaming && (
            <div className="flex items-center gap-2 py-8">
              <Cpu className="h-4 w-4 animate-spin text-cyan-400" />
              <span className="font-mono text-xs text-cyan-400/70 animate-pulse">Connecting to agent pipeline...</span>
            </div>
          )}

          {reasoningLog.map((line, i) => {
            const isTool = toolCalls.includes(line)
            return (
              <div
                key={i}
                className={cn(
                  "mb-1 font-mono text-[11px] leading-relaxed",
                  isTool ? "text-amber-400/80" : "text-gray-400",
                  i === reasoningLog.length - 1 && isStreaming && "animate-pulse"
                )}
              >
                <span className="mr-2 text-gray-600 select-none">{String(i + 1).padStart(2, "0")}</span>
                {isTool && <span className="mr-1 text-amber-500">[TOOL]</span>}
                {line}
              </div>
            )
          })}
        </div>

        {/* Decision card */}
        {decision && (
          <div className="border-t border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-emerald-400">
                Recommended Action
              </span>
              <span className={cn(
                "ml-auto rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase",
                decision.risk_level === "CRITICAL" ? "bg-red-500/20 text-red-400" :
                decision.risk_level === "HIGH" ? "bg-amber-500/20 text-amber-400" :
                "bg-blue-500/20 text-blue-400"
              )}>
                {decision.risk_level}
              </span>
            </div>
            <p className="font-mono text-sm font-semibold text-emerald-300">{decision.recommended_action}</p>
            <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-gray-400">{decision.reasoning}</p>

            {decision.options_evaluated.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {decision.options_evaluated.map((opt, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2",
                      i === decision.recommended_action_index
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-white/5 bg-white/[0.02]"
                    )}
                  >
                    <div className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-bold",
                      i === decision.recommended_action_index
                        ? "bg-emerald-500/30 text-emerald-400"
                        : "bg-white/5 text-gray-500"
                    )}>
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <span className="font-mono text-[10px] font-semibold text-foreground">{opt.action}</span>
                      <span className="ml-2 font-mono text-[9px] text-gray-500">{opt.description.slice(0, 60)}</span>
                    </div>
                    <span className="font-mono text-[9px] tabular-nums text-gray-500">{(opt.confidence * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="border-t border-red-500/20 bg-red-500/5 px-5 py-3">
            <p className="font-mono text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/5 bg-white/[0.01] px-5 py-2">
          <span className="font-mono text-[9px] text-gray-600">
            {isStreaming ? `${reasoningLog.length} steps processed` : decision ? "Analysis complete" : "Waiting..."}
          </span>
          {isStreaming && (
            <div className="flex items-center gap-1">
              <div className="h-1 w-1 rounded-full bg-red-400 animate-pulse" />
              <div className="h-1 w-1 rounded-full bg-red-400 animate-pulse [animation-delay:200ms]" />
              <div className="h-1 w-1 rounded-full bg-red-400 animate-pulse [animation-delay:400ms]" />
            </div>
          )}
        </div>

        {/* CSS for scanning line */}
        <style jsx>{`
          @keyframes scan {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
      </div>
    </div>
  )
}

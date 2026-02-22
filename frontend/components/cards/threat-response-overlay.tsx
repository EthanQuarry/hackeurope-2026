"use client"

import { useEffect, useRef } from "react"
import { X, Shield, AlertTriangle, Zap, Eye, Radio, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { useResponseStore } from "@/stores/response-store"
import { useThreatStore } from "@/stores/threat-store"
import type { ThreatResponseOption } from "@/types"

const RISK_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-500/20 border-red-500/40",
  high: "text-orange-400 bg-orange-500/20 border-orange-500/40",
  medium: "text-yellow-400 bg-yellow-500/20 border-yellow-500/40",
  low: "text-emerald-400 bg-emerald-500/20 border-emerald-500/40",
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  "Evasive Maneuver": <Zap className="h-4 w-4" />,
  "Defensive Posture": <Shield className="h-4 w-4" />,
  "Diplomatic Escalation": <AlertTriangle className="h-4 w-4" />,
  "Emergency Safe Mode": <Radio className="h-4 w-4" />,
  "Monitor Only": <Eye className="h-4 w-4" />,
}

function getActionIcon(action: string) {
  for (const [key, icon] of Object.entries(ACTION_ICONS)) {
    if (action.toLowerCase().includes(key.toLowerCase())) return icon
  }
  return <Shield className="h-4 w-4" />
}

function RiskBadge({ level }: { level: string }) {
  const colors = RISK_COLORS[level] ?? RISK_COLORS.medium
  return (
    <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", colors)}>
      {level}
    </span>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-400 transition-all duration-500"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-cyan-300">{Math.round(value * 100)}%</span>
    </div>
  )
}

function OptionCard({
  option,
  index,
  isRecommended,
}: {
  option: ThreatResponseOption
  index: number
  isRecommended: boolean
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-2 rounded-xl border p-4 backdrop-blur-sm transition-all",
        isRecommended
          ? "border-cyan-400/60 bg-cyan-500/10 shadow-lg shadow-cyan-500/10"
          : "border-white/10 bg-white/5 hover:border-white/20",
      )}
    >
      {isRecommended && (
        <div className="absolute -top-2.5 left-3 flex items-center gap-1 rounded-full bg-cyan-500 px-2 py-0.5 text-[10px] font-bold text-black">
          <Star className="h-3 w-3" /> RECOMMENDED
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className={cn("rounded-lg p-1.5", isRecommended ? "bg-cyan-500/20 text-cyan-400" : "bg-white/10 text-gray-400")}>
          {getActionIcon(option.action)}
        </div>
        <span className="text-sm font-semibold text-gray-100">{option.action}</span>
      </div>
      <p className="text-xs leading-relaxed text-gray-400">{option.description}</p>
      <div className="flex items-center gap-2">
        <RiskBadge level={option.risk_level} />
        {option.delta_v_ms > 0 && (
          <span className="text-[10px] text-gray-500">{option.delta_v_ms} m/s</span>
        )}
        {option.time_to_execute_min > 0 && (
          <span className="text-[10px] text-gray-500">{option.time_to_execute_min} min</span>
        )}
      </div>
      <ConfidenceBar value={option.confidence} />
      {(option.pros.length > 0 || option.cons.length > 0) && (
        <div className="mt-1 grid grid-cols-2 gap-2 text-[10px]">
          <div>
            {option.pros.map((p, i) => (
              <div key={i} className="text-emerald-400">+ {p}</div>
            ))}
          </div>
          <div>
            {option.cons.map((c, i) => (
              <div key={i} className="text-red-400">- {c}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ThreatResponseOverlay() {
  const isOpen = useResponseStore((s) => s.isOpen)
  const isStreaming = useResponseStore((s) => s.isStreaming)
  const satelliteName = useResponseStore((s) => s.satelliteName)
  const threatSatelliteName = useResponseStore((s) => s.threatSatelliteName)
  const threatScore = useResponseStore((s) => s.threatScore)
  const reasoningLog = useResponseStore((s) => s.reasoningLog)
  const toolCalls = useResponseStore((s) => s.toolCalls)
  const decision = useResponseStore((s) => s.decision)
  const error = useResponseStore((s) => s.error)
  const close = useResponseStore((s) => s.close)
  const setFocusTarget = useThreatStore((s) => s.setFocusTarget)

  const logEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll reasoning log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [reasoningLog])

  if (!isOpen) return null

  const handleDismiss = () => {
    setFocusTarget(null)
    close()
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-card/95 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-red-400">
                THREAT RESPONSE AGENT
              </span>
            </div>
            <div className="h-4 w-px bg-white/20" />
            <span className="text-sm text-gray-300">
              <span className="text-red-400">{threatSatelliteName}</span>
              {" "}→{" "}
              <span className="text-cyan-400">{satelliteName}</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            {/* Threat score bar */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">Threat</span>
              <div className="h-2 w-24 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 transition-all duration-1000"
                  style={{ width: `${Math.min(100, threatScore)}%` }}
                />
              </div>
              <span className="text-sm font-bold text-red-400">{Math.round(threatScore)}%</span>
            </div>
            <button
              onClick={handleDismiss}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Agent Reasoning — live stream */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
              <Eye className="h-3.5 w-3.5" />
              Agent Reasoning
              {isStreaming && (
                <span className="ml-2 h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </h3>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-white/5 bg-black/40 p-3 font-mono text-xs leading-relaxed">
              {reasoningLog.length === 0 && isStreaming && (
                <div className="text-gray-500 animate-pulse">Initializing agent...</div>
              )}
              {reasoningLog.map((line, i) => {
                const isTool = line.startsWith("[Tool:")
                return (
                  <div key={i} className={cn("mb-1", isTool ? "text-amber-400" : "text-gray-300")}>
                    {isTool ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-400">
                        <Zap className="h-3 w-3" /> {line}
                      </span>
                    ) : (
                      line
                    )}
                  </div>
                )
              })}
              {isStreaming && (
                <span className="inline-block h-4 w-1.5 animate-pulse bg-cyan-400" />
              )}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* Intelligence Summary — appears after agent completes */}
          {decision?.intelligence_summary && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                <Radio className="h-3.5 w-3.5" />
                Intelligence Summary
              </h3>
              <div className="rounded-lg border border-white/5 bg-black/30 p-3 text-xs leading-relaxed text-gray-300">
                {decision.intelligence_summary}
              </div>
            </div>
          )}

          {/* Threat Summary */}
          {decision?.threat_summary && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Threat Summary
              </h3>
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs leading-relaxed text-gray-300">
                {decision.threat_summary}
              </div>
            </div>
          )}

          {/* Response Options */}
          {decision && decision.options_evaluated.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                <Shield className="h-3.5 w-3.5" />
                Response Options
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {decision.options_evaluated.map((option, i) => (
                  <OptionCard
                    key={i}
                    option={option}
                    index={i}
                    isRecommended={i === decision.recommended_action_index}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recommended Action — detailed */}
          {decision && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-400">
                <Star className="h-3.5 w-3.5" />
                Recommended Action: {decision.recommended_action}
              </h3>
              <p className="mb-3 text-xs leading-relaxed text-gray-300">{decision.reasoning}</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <RiskBadge level={decision.risk_level} />
                  <span className={cn(
                    "rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    decision.escalation_required
                      ? "border-red-500/40 bg-red-500/20 text-red-400"
                      : "border-emerald-500/40 bg-emerald-500/20 text-emerald-400",
                  )}>
                    {decision.escalation_required ? "ESCALATION REQUIRED" : "NO ESCALATION"}
                  </span>
                  <span className={cn(
                    "rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    decision.time_sensitivity === "immediate"
                      ? "border-red-500/40 bg-red-500/20 text-red-400"
                      : decision.time_sensitivity === "urgent"
                        ? "border-orange-500/40 bg-orange-500/20 text-orange-400"
                        : "border-yellow-500/40 bg-yellow-500/20 text-yellow-400",
                  )}>
                    {decision.time_sensitivity}
                  </span>
                </div>
                <div className="flex-1" />
                <button
                  onClick={handleDismiss}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-300 transition-colors hover:bg-white/10"
                >
                  DISMISS
                </button>
                <button
                  onClick={handleDismiss}
                  className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-cyan-400"
                >
                  EXECUTE
                </button>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
              Error: {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

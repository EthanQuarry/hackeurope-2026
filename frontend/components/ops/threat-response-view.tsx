"use client"

import { useEffect, useRef } from "react"
import {
  Shield,
  AlertTriangle,
  Zap,
  Eye,
  Radio,
  Star,
  Crosshair,
  Skull,
  Activity,
  ChevronRight,
  X,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useResponseStore } from "@/stores/response-store"
import { useThreatStore } from "@/stores/threat-store"
import { useUIStore } from "@/stores/ui-store"
import type { ThreatResponseOption } from "@/types"

/* ── Risk styling ─────────────────────────────────────── */

const RISK_COLORS: Record<string, { text: string; bg: string; border: string; glow: string }> = {
  critical: { text: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/40", glow: "shadow-red-500/20" },
  high: { text: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/40", glow: "shadow-orange-500/20" },
  medium: { text: "text-yellow-400", bg: "bg-yellow-500/15", border: "border-yellow-500/40", glow: "shadow-yellow-500/20" },
  low: { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/40", glow: "shadow-emerald-500/20" },
}

function riskStyle(level: string) {
  return RISK_COLORS[level] ?? RISK_COLORS.medium
}

/* ── Animated scan line overlay ──────────────────────── */

function ScanLines() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.03]">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
        }}
      />
    </div>
  )
}

/* ── Threat score HUD ────────────────────────────────── */

function ThreatScoreHUD({ score }: { score: number }) {
  const pct = Math.min(100, Math.round(score))
  const circumference = 2 * Math.PI * 38
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="relative flex items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96" className="drop-shadow-lg">
        {/* Background ring */}
        <circle cx="48" cy="48" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        {/* Animated score ring */}
        <circle
          cx="48" cy="48" r="38" fill="none"
          stroke="url(#threatGradient)" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
          transform="rotate(-90 48 48)"
        />
        {/* Tick marks */}
        {Array.from({ length: 36 }).map((_, i) => {
          const angle = (i * 10 - 90) * (Math.PI / 180)
          const r1 = 44
          const r2 = 46
          return (
            <line
              key={i}
              x1={48 + r1 * Math.cos(angle)} y1={48 + r1 * Math.sin(angle)}
              x2={48 + r2 * Math.cos(angle)} y2={48 + r2 * Math.sin(angle)}
              stroke="rgba(255,255,255,0.08)" strokeWidth="1"
            />
          )
        })}
        <defs>
          <linearGradient id="threatGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-black tabular-nums text-red-400 drop-shadow-lg">
          {pct}
        </span>
        <span className="font-mono text-[7px] uppercase tracking-[0.2em] text-red-400/60">THREAT</span>
      </div>
    </div>
  )
}

/* ── Confidence bar ──────────────────────────────────── */

function ConfidenceBar({ value, color = "cyan" }: { value: number; color?: string }) {
  const colors = color === "cyan" ? "from-cyan-500 to-cyan-400" : "from-emerald-500 to-emerald-400"
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", colors)}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="font-mono text-[9px] tabular-nums text-gray-400">{Math.round(value * 100)}%</span>
    </div>
  )
}

/* ── Option card ─────────────────────────────────────── */

function OptionCard({ option, isRecommended }: { option: ThreatResponseOption; isRecommended: boolean }) {
  const rs = riskStyle(option.risk_level)

  return (
    <div
      className={cn(
        "relative rounded-lg border p-3 transition-all",
        isRecommended
          ? "border-cyan-500/50 bg-cyan-500/5 shadow-lg shadow-cyan-500/10"
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]",
      )}
    >
      {isRecommended && (
        <div className="absolute -top-2 right-3 flex items-center gap-1 rounded bg-cyan-500 px-1.5 py-0.5">
          <Star className="h-2.5 w-2.5 text-black" />
          <span className="font-mono text-[7px] font-black uppercase tracking-wider text-black">REC</span>
        </div>
      )}

      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn("font-mono text-[11px] font-bold", isRecommended ? "text-cyan-300" : "text-gray-200")}>
          {option.action}
        </span>
      </div>

      <p className="font-mono text-[9px] leading-relaxed text-gray-500 mb-2">{option.description}</p>

      {/* Stats row */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn("rounded px-1.5 py-0.5 font-mono text-[7px] font-bold uppercase tracking-wider", rs.text, rs.bg, rs.border, "border")}>
          {option.risk_level}
        </span>
        {option.delta_v_ms > 0 && (
          <span className="font-mono text-[8px] text-gray-500">{option.delta_v_ms} m/s</span>
        )}
        {option.time_to_execute_min > 0 && (
          <span className="font-mono text-[8px] text-gray-500">{option.time_to_execute_min}m</span>
        )}
      </div>

      <ConfidenceBar value={option.confidence} color={isRecommended ? "cyan" : "cyan"} />

      {/* Pros/Cons */}
      {(option.pros.length > 0 || option.cons.length > 0) && (
        <div className="mt-2 space-y-0.5">
          {option.pros.map((p, i) => (
            <div key={`p${i}`} className="flex items-start gap-1">
              <ChevronRight className="h-2.5 w-2.5 shrink-0 text-emerald-500 mt-px" />
              <span className="font-mono text-[8px] text-emerald-400/80">{p}</span>
            </div>
          ))}
          {option.cons.map((c, i) => (
            <div key={`c${i}`} className="flex items-start gap-1">
              <X className="h-2.5 w-2.5 shrink-0 text-red-500 mt-px" />
              <span className="font-mono text-[8px] text-red-400/80">{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   Main Component — futuristic threat response panel
   ══════════════════════════════════════════════════════ */

export function ThreatResponseView() {
  const isOpen = useResponseStore((s) => s.isOpen)
  const isStreaming = useResponseStore((s) => s.isStreaming)
  const satelliteName = useResponseStore((s) => s.satelliteName)
  const threatSatelliteName = useResponseStore((s) => s.threatSatelliteName)
  const threatScore = useResponseStore((s) => s.threatScore)
  const reasoningLog = useResponseStore((s) => s.reasoningLog)
  const decision = useResponseStore((s) => s.decision)
  const error = useResponseStore((s) => s.error)
  const close = useResponseStore((s) => s.close)
  const setFocusTarget = useThreatStore((s) => s.setFocusTarget)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const logEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll reasoning log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [reasoningLog])

  const handleDismiss = () => {
    setFocusTarget(null)
    close()
    setActiveView("overview")
  }

  if (!isOpen) return null

  return (
    <div
      data-ops-panel
      className="pointer-events-auto relative flex flex-col overflow-hidden rounded-r-sm rounded-l-xl border border-red-500/20 bg-card/90 shadow-lg shadow-red-500/5 backdrop-blur-xl"
    >
      <ScanLines />

      {/* ── Header ── */}
      <div className="relative z-10 border-b border-red-500/20 bg-red-500/[0.03] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-red-500 animate-ping opacity-30" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-red-400">
                THREAT RESPONSE
              </span>
              {isStreaming && (
                <span className="font-mono text-[8px] uppercase tracking-wider text-cyan-400 animate-pulse">ACTIVE</span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] text-gray-400">
              <Skull className="h-3 w-3 text-red-400/60" />
              <span className="text-red-300 truncate">{threatSatelliteName}</span>
              <span className="text-gray-600">→</span>
              <Crosshair className="h-3 w-3 text-cyan-400/60" />
              <span className="text-cyan-300 truncate">{satelliteName}</span>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <ScrollArea className="relative z-10 min-h-0 flex-1">
        <div className="space-y-3 p-3">

          {/* Threat Score HUD + Situation */}
          <div className="flex items-center gap-4 rounded-lg border border-white/[0.04] bg-black/30 p-3">
            <ThreatScoreHUD score={threatScore} />
            <div className="flex-1 space-y-2">
              <div>
                <div className="font-mono text-[7px] uppercase tracking-[0.2em] text-gray-500">Attacker</div>
                <div className="font-mono text-[11px] font-bold text-red-300">{threatSatelliteName}</div>
              </div>
              <div>
                <div className="font-mono text-[7px] uppercase tracking-[0.2em] text-gray-500">Target Asset</div>
                <div className="font-mono text-[11px] font-bold text-cyan-300">{satelliteName}</div>
              </div>
              {decision && (
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[7px] font-bold uppercase tracking-wider border",
                    riskStyle(decision.risk_level).text,
                    riskStyle(decision.risk_level).bg,
                    riskStyle(decision.risk_level).border,
                  )}>
                    {decision.risk_level}
                  </span>
                  <span className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[7px] font-bold uppercase tracking-wider border",
                    decision.time_sensitivity === "immediate" ? "text-red-400 bg-red-500/15 border-red-500/40"
                      : decision.time_sensitivity === "urgent" ? "text-orange-400 bg-orange-500/15 border-orange-500/40"
                      : "text-yellow-400 bg-yellow-500/15 border-yellow-500/40",
                  )}>
                    {decision.time_sensitivity}
                  </span>
                  {decision.escalation_required && (
                    <span className="rounded px-1.5 py-0.5 font-mono text-[7px] font-bold uppercase tracking-wider text-red-400 bg-red-500/15 border border-red-500/40">
                      ESCALATE
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Agent Reasoning — live stream */}
          <div className="rounded-lg border border-white/[0.04] bg-black/30 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-1.5">
              <Activity className="h-3 w-3 text-cyan-400/60" />
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-gray-400">
                Agent Reasoning
              </span>
              {isStreaming && (
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="font-mono text-[7px] uppercase tracking-wider text-cyan-400/60">STREAMING</span>
                </div>
              )}
            </div>
            <div className="max-h-36 overflow-y-auto p-2 font-mono text-[9px] leading-[1.6]">
              {reasoningLog.length === 0 && isStreaming && (
                <div className="text-gray-600 animate-pulse">Initializing threat response agent...</div>
              )}
              {reasoningLog.map((line, i) => {
                const isTool = line.startsWith("[Tool:")
                return (
                  <div key={i} className={cn("mb-0.5", isTool ? "text-amber-400/90" : "text-gray-400")}>
                    {isTool ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1 py-px">
                        <Zap className="h-2.5 w-2.5" /> {line}
                      </span>
                    ) : (
                      <span>{line}</span>
                    )}
                  </div>
                )
              })}
              {isStreaming && <span className="inline-block h-3 w-1 animate-pulse bg-cyan-400 ml-0.5" />}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* Intelligence Summary */}
          {decision?.intelligence_summary && (
            <div className="rounded-lg border border-white/[0.04] bg-black/30 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-1.5">
                <Radio className="h-3 w-3 text-purple-400/60" />
                <span className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-gray-400">
                  Intelligence
                </span>
              </div>
              <div className="p-2 font-mono text-[9px] leading-relaxed text-gray-400">
                {decision.intelligence_summary}
              </div>
            </div>
          )}

          {/* Threat Summary */}
          {decision?.threat_summary && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.03] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-red-500/20 px-3 py-1.5">
                <AlertTriangle className="h-3 w-3 text-red-400/60" />
                <span className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-red-400/80">
                  Threat Assessment
                </span>
              </div>
              <div className="p-2 font-mono text-[9px] leading-relaxed text-gray-300">
                {decision.threat_summary}
              </div>
            </div>
          )}

          {/* Response Options */}
          {decision && decision.options_evaluated.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-1 mb-2">
                <Shield className="h-3 w-3 text-cyan-400/60" />
                <span className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-gray-400">
                  Response Options
                </span>
              </div>
              <div className="space-y-2">
                {decision.options_evaluated.map((option, i) => (
                  <OptionCard
                    key={i}
                    option={option}
                    isRecommended={i === decision.recommended_action_index}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recommended Action */}
          {decision && (
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/[0.03] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Star className="h-3.5 w-3.5 text-cyan-400" />
                <span className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-cyan-300">
                  {decision.recommended_action}
                </span>
              </div>
              <p className="font-mono text-[9px] leading-relaxed text-gray-400 mb-3">
                {decision.reasoning}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDismiss}
                  className="rounded border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[8px] font-bold uppercase tracking-wider text-gray-400 transition-all hover:bg-white/[0.06] hover:text-gray-200"
                >
                  DISMISS
                </button>
                <button
                  onClick={handleDismiss}
                  className="rounded bg-cyan-500 px-3 py-1.5 font-mono text-[8px] font-black uppercase tracking-wider text-black transition-all hover:bg-cyan-400 shadow-lg shadow-cyan-500/20"
                >
                  EXECUTE
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 font-mono text-[9px] text-red-400">
              {error}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

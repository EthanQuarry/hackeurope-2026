"use client"

import { useEffect, useRef, useState, useMemo, useCallback, memo } from "react"
import {
  Brain,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Database,
  Shield,
  Eye,
  Radio,
  Skull,
  Activity,
  Settings,
  X,
  ChevronDown,
  Target,
  Crosshair,
  Star,
  Move,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useAgentOpsStore } from "@/stores/agent-ops-store"
import { useAgentSimulation } from "@/hooks/use-agent-simulation"
import type {
  AgentFlowStep,
  AgentFlowStepId,
  AgentStepStatus,
  AgentThinkingLine,
  AgentResponseOption,
  AgentResponseTier,
  AgentSession,
} from "@/types"

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
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
        }}
      />
    </div>
  )
}

/* ── Threat score HUD ────────────────────────────────── */

function ThreatScoreHUD({ score }: { score: number }) {
  const pct = Math.min(100, Math.round(score * 100))
  const circumference = 2 * Math.PI * 38
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="relative flex items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96" className="drop-shadow-lg">
        <circle cx="48" cy="48" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        <circle
          cx="48" cy="48" r="38" fill="none"
          stroke="url(#agentThreatGradient)" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
          transform="rotate(-90 48 48)"
        />
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
          <linearGradient id="agentThreatGradient" x1="0" y1="0" x2="1" y2="1">
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
  const colorMap: Record<string, string> = {
    cyan: "from-cyan-500 to-cyan-400",
    amber: "from-amber-500 to-amber-400",
    orange: "from-orange-500 to-orange-400",
    red: "from-red-500 to-red-400",
    emerald: "from-emerald-500 to-emerald-400",
  }
  const gradient = colorMap[color] ?? colorMap.cyan

  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", gradient)}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="font-mono text-[9px] tabular-nums text-gray-400">{Math.round(value * 100)}%</span>
    </div>
  )
}

/* ── Step status icon ────────────────────────────────── */

function StepStatusIcon({ status }: { status: AgentStepStatus }) {
  switch (status) {
    case "pending":
      return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-600/50 bg-gray-800/50">
          <div className="h-1.5 w-1.5 rounded-full bg-gray-600" />
        </div>
      )
    case "active":
      return (
        <div className="relative flex h-5 w-5 items-center justify-center rounded-full border border-cyan-500/60 bg-cyan-500/10">
          <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-ping" />
        </div>
      )
    case "complete":
      return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-500/60 bg-emerald-500/10">
          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
        </div>
      )
    case "error":
      return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full border border-red-500/60 bg-red-500/10">
          <X className="h-3 w-3 text-red-400" />
        </div>
      )
  }
}

/* ── Thinking line icon by type ──────────────────────── */

function ThinkingLineIcon({ type }: { type: AgentThinkingLine["type"] }) {
  const iconClass = "h-3 w-3 shrink-0"
  switch (type) {
    case "reasoning":
      return <Brain className={cn(iconClass, "text-gray-400")} />
    case "tool":
      return <Zap className={cn(iconClass, "text-amber-400")} />
    case "result":
      return <CheckCircle2 className={cn(iconClass, "text-emerald-400")} />
    case "warning":
      return <AlertTriangle className={cn(iconClass, "text-red-400")} />
    case "data":
    default:
      return <Database className={cn(iconClass, "text-cyan-400")} />
  }
}

/* ── Thinking line text color ────────────────────────── */

function thinkingLineColor(type: AgentThinkingLine["type"]): string {
  switch (type) {
    case "reasoning": return "text-gray-400"
    case "tool": return "text-amber-400"
    case "result": return "text-emerald-400"
    case "warning": return "text-red-400"
    case "data":
    default: return "text-cyan-400"
  }
}

/* ── Elapsed time formatter ──────────────────────────── */

function formatElapsed(startedAt: number | null, completedAt: number | null): string {
  if (!startedAt) return "--"
  const end = completedAt ?? Date.now()
  const seconds = Math.floor((end - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

/* ── Response option theme config ────────────────────── */

interface ResponseTheme {
  label: string
  icon: React.ReactNode
  border: string
  bg: string
  text: string
  glow: string
  barColor: string
}

function getResponseTheme(tier: AgentResponseTier): ResponseTheme {
  const iconSize = "h-5 w-5"
  switch (tier) {
    case "manoeuvre":
      return {
        label: "MANOEUVRE",
        icon: <Move className={cn(iconSize, "text-cyan-400")} />,
        border: "border-cyan-500/40",
        bg: "bg-cyan-500/5",
        text: "text-cyan-300",
        glow: "shadow-cyan-500/20",
        barColor: "cyan",
      }
    case "sarcastic-manoeuvre":
      return {
        label: "SARCASTIC MANOEUVRE",
        icon: <Eye className={cn(iconSize, "text-amber-400")} />,
        border: "border-amber-500/40",
        bg: "bg-amber-500/5",
        text: "text-amber-300",
        glow: "shadow-amber-500/20",
        barColor: "amber",
      }
    case "decoy":
      return {
        label: "DECOY",
        icon: <Radio className={cn(iconSize, "text-orange-400")} />,
        border: "border-orange-500/40",
        bg: "bg-orange-500/5",
        text: "text-orange-300",
        glow: "shadow-orange-500/20",
        barColor: "orange",
      }
    case "destroy":
    default:
      return {
        label: "DESTROY",
        icon: <Skull className={cn(iconSize, "text-red-400")} />,
        border: "border-red-500/50",
        bg: "bg-red-500/8",
        text: "text-red-300",
        glow: "shadow-red-500/30",
        barColor: "red",
      }
  }
}

/* ── Flowchart step card ─────────────────────────────── */

const FlowchartStep = memo(function FlowchartStep({
  step,
  isLast,
  isSelected,
  onSelect,
}: {
  step: AgentFlowStep
  isLast: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <div className="flex flex-col items-center">
      {/* Step card */}
      <button
        onClick={onSelect}
        className={cn(
          "group relative w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-200",
          step.status === "active" && "border-cyan-500/50 bg-cyan-500/[0.06] shadow-lg shadow-cyan-500/10",
          step.status === "complete" && "border-emerald-500/20 bg-emerald-500/[0.03]",
          step.status === "error" && "border-red-500/30 bg-red-500/[0.05]",
          step.status === "pending" && "border-white/[0.06] bg-white/[0.015]",
          isSelected && step.status !== "active" && "ring-1 ring-cyan-500/30",
          "hover:bg-white/[0.04]",
        )}
      >
        {/* Left accent bar */}
        <div
          className={cn(
            "absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-all",
            step.status === "active" && "bg-cyan-400",
            step.status === "complete" && "bg-emerald-400",
            step.status === "error" && "bg-red-400",
            step.status === "pending" && "bg-gray-700",
          )}
        />

        <div className="flex items-center gap-2.5 pl-2">
          <StepStatusIcon status={step.status} />
          <div className="flex-1 min-w-0">
            <span
              className={cn(
                "font-mono text-[10px] font-semibold uppercase tracking-wide leading-tight block truncate",
                step.status === "active" && "text-cyan-300",
                step.status === "complete" && "text-emerald-300/90",
                step.status === "error" && "text-red-300",
                step.status === "pending" && "text-gray-500",
              )}
            >
              {step.label}
            </span>
            {step.summary && (
              <span className="font-mono text-[8px] text-gray-500 block mt-0.5 truncate">
                {step.summary}
              </span>
            )}
          </div>
          {step.startedAt && (
            <span className="font-mono text-[8px] tabular-nums text-gray-600 shrink-0">
              {formatElapsed(step.startedAt, step.completedAt)}
            </span>
          )}
        </div>
      </button>

      {/* Connecting line */}
      {!isLast && (
        <div className="flex flex-col items-center py-1">
          <div
            className={cn(
              "w-px h-5",
              step.status === "complete" || step.status === "active"
                ? "bg-gradient-to-b from-cyan-500/40 to-cyan-500/10"
                : "border-l border-dashed border-gray-700",
            )}
          />
          <ChevronDown
            className={cn(
              "h-2.5 w-2.5 -mt-0.5",
              step.status === "complete" || step.status === "active"
                ? "text-cyan-500/40"
                : "text-gray-700",
            )}
          />
        </div>
      )}
    </div>
  )
})

/* ── Step detail panel ───────────────────────────────── */

const StepDetail = memo(function StepDetail({
  step,
  isSessionActive,
}: {
  step: AgentFlowStep
  isSessionActive: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [step.thinkingLines])

  const isStepActive = step.status === "active"

  return (
    <div className="flex h-full flex-col rounded-lg border border-white/[0.04] bg-black/30 overflow-hidden">
      {/* Detail header */}
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2 shrink-0">
        <Activity className="h-3 w-3 text-cyan-400/60" />
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-gray-400 flex-1 truncate">
          {step.label}
        </span>
        {step.startedAt && (
          <span className="font-mono text-[8px] tabular-nums text-gray-600">
            {formatElapsed(step.startedAt, step.completedAt)}
          </span>
        )}
        {isStepActive && (
          <div className="flex items-center gap-1.5">
            <div className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-mono text-[7px] uppercase tracking-wider text-cyan-400/60">ACTIVE</span>
          </div>
        )}
      </div>

      {/* Thinking lines */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto p-2 font-mono text-[9px] leading-[1.7] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
      >
        {step.thinkingLines.length === 0 && step.status === "pending" && (
          <div className="flex items-center justify-center h-full text-gray-600">
            <span className="font-mono text-[9px]">Waiting for activation...</span>
          </div>
        )}
        {step.thinkingLines.length === 0 && isStepActive && (
          <div className="text-gray-600 animate-pulse">Initializing step...</div>
        )}
        {step.thinkingLines.map((line) => (
          <div key={line.id} className="mb-0.5 flex items-start gap-1.5">
            <span className="select-none text-gray-700 tabular-nums w-5 text-right shrink-0">
              {String(line.id).padStart(2, "0")}
            </span>
            <ThinkingLineIcon type={line.type} />
            <span className={cn("break-words", thinkingLineColor(line.type))}>
              {line.text}
            </span>
          </div>
        ))}
        {isStepActive && isSessionActive && (
          <span className="inline-block h-3 w-1 animate-pulse bg-cyan-400 ml-7 mt-0.5" />
        )}
      </div>
    </div>
  )
})

/* ── Response option card ────────────────────────────── */

const ResponseCard = memo(function ResponseCard({
  option,
  index,
}: {
  option: AgentResponseOption
  index: number
}) {
  const theme = getResponseTheme(option.tier)

  return (
    <div
      className={cn(
        "relative rounded-lg border p-3 transition-all duration-300",
        option.recommended
          ? cn(theme.border, theme.bg, "shadow-lg", theme.glow, "ring-1 ring-cyan-500/20")
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]",
        option.tier === "destroy" && "hover:shadow-red-500/10",
      )}
      style={{
        animationDelay: `${index * 100}ms`,
        animation: "slideUp 0.4s ease-out both",
      }}
    >
      {/* Recommended badge */}
      {option.recommended && (
        <div className="absolute -top-2 right-3 flex items-center gap-1 rounded bg-cyan-500 px-1.5 py-0.5">
          <Star className="h-2.5 w-2.5 text-black" />
          <span className="font-mono text-[7px] font-black uppercase tracking-wider text-black">RECOMMENDED</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        {theme.icon}
        <span className={cn("font-mono text-[11px] font-bold", option.recommended ? theme.text : "text-gray-200")}>
          {theme.label}
        </span>
        {option.tier === "destroy" && (
          <span className="ml-auto font-mono text-[8px] font-bold text-red-500 animate-pulse">DANGER</span>
        )}
      </div>

      {/* Description */}
      <p className="font-mono text-[9px] leading-relaxed text-gray-500 mb-2">{option.description}</p>

      {/* Stats row */}
      <div className="flex items-center gap-2 mb-2">
        <span className={cn(
          "rounded px-1.5 py-0.5 font-mono text-[7px] font-bold uppercase tracking-wider border",
          `text-gray-300 bg-white/5 border-white/10`,
        )}>
          SEV-{option.severity}
        </span>
        {option.deltaVMs > 0 && (
          <span className="font-mono text-[8px] text-gray-500">{option.deltaVMs} m/s</span>
        )}
        {option.estimatedTimeMin > 0 && (
          <span className="font-mono text-[8px] text-gray-500">{option.estimatedTimeMin}m</span>
        )}
      </div>

      {/* Confidence bar */}
      <ConfidenceBar value={option.confidence} color={theme.barColor} />

      {/* Risks and Benefits */}
      {(option.benefits.length > 0 || option.risks.length > 0) && (
        <div className="mt-2 space-y-0.5">
          {option.benefits.map((b, i) => (
            <div key={`b${i}`} className="flex items-start gap-1">
              <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-500 mt-px" />
              <span className="font-mono text-[8px] text-emerald-400/80">{b}</span>
            </div>
          ))}
          {option.risks.map((r, i) => (
            <div key={`r${i}`} className="flex items-start gap-1">
              <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-red-500 mt-px" />
              <span className="font-mono text-[8px] text-red-400/80">{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

/* ── Threshold settings dropdown ─────────────────────── */

function ThresholdSettings({
  threshold,
  onThresholdChange,
}: {
  threshold: number
  onThresholdChange: (value: number) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-white/10 bg-gray-900/95 p-3 shadow-xl backdrop-blur-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-gray-400">
              Trigger Threshold
            </span>
            <span className="font-mono text-[10px] tabular-nums font-bold text-cyan-400">
              {Math.round(threshold * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(threshold * 100)}
            onChange={(e) => onThresholdChange(Number(e.target.value) / 100)}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer
              bg-white/10
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:w-3
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-cyan-400
              [&::-webkit-slider-thumb]:shadow-lg
              [&::-webkit-slider-thumb]:shadow-cyan-400/30
              [&::-webkit-slider-thumb]:border-none
              [&::-moz-range-thumb]:h-3
              [&::-moz-range-thumb]:w-3
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-cyan-400
              [&::-moz-range-thumb]:border-none"
          />
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[7px] text-gray-600">0%</span>
            <span className="font-mono text-[7px] text-gray-600">100%</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Standby state ───────────────────────────────────── */

function AgentStandby({
  threshold,
  onThresholdChange,
}: {
  threshold: number
  onThresholdChange: (value: number) => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 relative">
      <ScanLines />

      {/* Scanning line effect */}
      <div className="absolute inset-x-0 top-0 h-full overflow-hidden pointer-events-none">
        <div
          className="absolute inset-x-0 h-px opacity-10"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(0,255,255,0.6), transparent)",
            animation: "scanVertical 4s linear infinite",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="relative">
          <Brain className="h-16 w-16 text-cyan-500/20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 rounded-full border border-cyan-500/20 animate-ping opacity-20" />
          </div>
        </div>

        <div className="text-center">
          <h3 className="font-mono text-sm font-black uppercase tracking-[0.25em] text-gray-400">
            AGENT STANDBY
          </h3>
          <p className="mt-2 font-mono text-[10px] text-gray-600 max-w-xs leading-relaxed">
            Monitoring fleet risk — autonomous agent will engage when threat
            exceeds {Math.round(threshold * 100)}% threshold
          </p>
        </div>

        {/* Threshold slider */}
        <div className="w-64 mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-gray-500">
              Activation Threshold
            </span>
            <span className="font-mono text-[11px] tabular-nums font-bold text-cyan-400">
              {Math.round(threshold * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(threshold * 100)}
            onChange={(e) => onThresholdChange(Number(e.target.value) / 100)}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer
              bg-white/10
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:h-3.5
              [&::-webkit-slider-thumb]:w-3.5
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-cyan-400
              [&::-webkit-slider-thumb]:shadow-lg
              [&::-webkit-slider-thumb]:shadow-cyan-400/30
              [&::-webkit-slider-thumb]:border-none
              [&::-moz-range-thumb]:h-3.5
              [&::-moz-range-thumb]:w-3.5
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-cyan-400
              [&::-moz-range-thumb]:border-none"
          />
          <div className="flex justify-between mt-1.5">
            <span className="font-mono text-[7px] text-gray-600">LOW</span>
            <span className="font-mono text-[7px] text-gray-600">HIGH</span>
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-cyan-400/40 animate-pulse" />
            <span className="font-mono text-[8px] text-gray-600">SENSORS ONLINE</span>
          </div>
          <div className="h-3 w-px bg-white/5" />
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/40 animate-pulse [animation-delay:500ms]" />
            <span className="font-mono text-[8px] text-gray-600">AGENT READY</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   Main Component — AgentOps
   ══════════════════════════════════════════════════════ */

export function AgentOps() {
  const threshold = useAgentOpsStore((s) => s.threshold)
  const setThreshold = useAgentOpsStore((s) => s.setThreshold)
  const activeSession = useAgentOpsStore((s) => s.activeSession)
  const pendingThreat = useAgentOpsStore((s) => s.pendingThreat)
  const clearPendingThreat = useAgentOpsStore((s) => s.clearPendingThreat)
  const startSession = useAgentOpsStore((s) => s.startSession)
  const { runSimulation } = useAgentSimulation()

  /* When this panel opens with a pending threat, consume it and start */
  const consumedRef = useRef(false)
  useEffect(() => {
    if (pendingThreat && !activeSession && !consumedRef.current) {
      consumedRef.current = true
      startSession({
        satelliteId: pendingThreat.satelliteId,
        satelliteName: pendingThreat.satelliteName,
        threatSatelliteId: pendingThreat.threatSatelliteId,
        threatSatelliteName: pendingThreat.threatSatelliteName,
        triggerRisk: pendingThreat.triggerRisk,
        triggerReason: pendingThreat.triggerReason,
      })
      runSimulation({
        satelliteId: pendingThreat.satelliteId,
        satelliteName: pendingThreat.satelliteName,
        threatSatelliteId: pendingThreat.threatSatelliteId,
        threatSatelliteName: pendingThreat.threatSatelliteName,
        triggerRisk: pendingThreat.triggerRisk,
        triggerReason: pendingThreat.triggerReason,
        threatData: pendingThreat.threatData,
      })
      clearPendingThreat()
    }
    if (!pendingThreat) {
      consumedRef.current = false
    }
  }, [pendingThreat, activeSession, startSession, runSimulation, clearPendingThreat])

  const [selectedStepId, setSelectedStepId] = useState<AgentFlowStepId | null>(null)

  /* Auto-select the active step whenever it changes */
  const activeStepId = useMemo(() => {
    if (!activeSession) return null
    const active = activeSession.steps.find((s) => s.status === "active")
    return active?.id ?? null
  }, [activeSession])

  useEffect(() => {
    if (activeStepId) {
      setSelectedStepId(activeStepId)
    }
  }, [activeStepId])

  /* Determine which step to show detail for */
  const detailStep = useMemo(() => {
    if (!activeSession) return null
    if (selectedStepId) {
      return activeSession.steps.find((s) => s.id === selectedStepId) ?? null
    }
    // Fallback: show the active step, or the last completed step
    const active = activeSession.steps.find((s) => s.status === "active")
    if (active) return active
    const completed = [...activeSession.steps].reverse().find((s) => s.status === "complete")
    return completed ?? activeSession.steps[0]
  }, [activeSession, selectedStepId])

  /* Is the session still running? */
  const isSessionActive = useMemo(() => {
    if (!activeSession) return false
    return activeSession.completedAt === null
  }, [activeSession])

  /* Are response options available? */
  const showResponses = useMemo(() => {
    if (!activeSession) return false
    const lastStep = activeSession.steps[activeSession.steps.length - 1]
    return (
      (lastStep.status === "active" || lastStep.status === "complete") &&
      activeSession.allResponses.length > 0
    )
  }, [activeSession])

  const handleSelectStep = useCallback((stepId: AgentFlowStepId) => {
    setSelectedStepId(stepId)
  }, [])

  const handleThresholdChange = useCallback((value: number) => {
    setThreshold(value)
  }, [setThreshold])

  /* ── No active session ── */
  if (!activeSession) {
    return (
      <div className="mx-auto h-full w-full max-w-[1600px]">
        <div
          data-ops-panel
          className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg"
        >
          <AgentStandby threshold={threshold} onThresholdChange={handleThresholdChange} />

          {/* CSS keyframes */}
          <style jsx>{`
            @keyframes scanVertical {
              0% { top: -2px; }
              100% { top: 100%; }
            }
          `}</style>
        </div>
      </div>
    )
  }

  /* ── Active session ── */
  const rs = riskStyle(activeSession.threatLevel)

  return (
    <div className="mx-auto h-full w-full max-w-[1600px]">
      <div
        data-ops-panel
        className="pointer-events-auto relative flex h-full flex-col overflow-hidden rounded-xl border border-red-500/20 bg-card/90 shadow-lg shadow-red-500/5 backdrop-blur-xl"
      >
        <ScanLines />

        {/* ── Header ── */}
        <div className="relative z-10 border-b border-red-500/20 bg-red-500/[0.03] px-4 py-3 shrink-0">
          <div className="flex items-center gap-3">
            {/* Pulse dot */}
            <div className="relative">
              <div className={cn(
                "h-2.5 w-2.5 rounded-full",
                isSessionActive ? "bg-red-500 animate-pulse" : "bg-emerald-400",
              )} />
              {isSessionActive && (
                <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-red-500 animate-ping opacity-30" />
              )}
            </div>

            {/* Title */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-red-400">
                  AUTONOMOUS AGENT RESPONSE
                </span>
                {isSessionActive ? (
                  <span className="font-mono text-[8px] uppercase tracking-wider text-cyan-400 animate-pulse">ACTIVE</span>
                ) : (
                  <span className="font-mono text-[8px] uppercase tracking-wider text-emerald-400">COMPLETE</span>
                )}
              </div>
              {/* Threat info strip */}
              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] text-gray-400">
                <span className={cn(
                  "rounded px-1 py-px font-mono text-[7px] font-bold uppercase tracking-wider border",
                  rs.text, rs.bg, rs.border,
                )}>
                  {activeSession.threatLevel}
                </span>
                <span className="text-gray-600">|</span>
                <Skull className="h-3 w-3 text-red-400/60" />
                <span className="text-red-300 truncate">{activeSession.threatSatelliteName}</span>
                <span className="text-gray-600">→</span>
                <Crosshair className="h-3 w-3 text-cyan-400/60" />
                <span className="text-cyan-300 truncate">{activeSession.satelliteName}</span>
              </div>
            </div>

            {/* Right: threat score + settings */}
            <div className="flex items-center gap-2">
              <ThreatScoreHUD score={activeSession.triggerRisk} />
              <ThresholdSettings
                threshold={threshold}
                onThresholdChange={handleThresholdChange}
              />
            </div>
          </div>
        </div>

        {/* ── Content: Two-column layout ── */}
        <div className="relative z-10 flex min-h-0 flex-1">
          {/* LEFT: Flowchart (45%) */}
          <div className="w-[45%] border-r border-white/[0.04] flex flex-col">
            <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-1.5 shrink-0">
              <Target className="h-3 w-3 text-cyan-400/60" />
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-gray-400">
                Decision Pipeline
              </span>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-3 space-y-0">
                {activeSession.steps.map((step, i) => (
                  <FlowchartStep
                    key={step.id}
                    step={step}
                    isLast={i === activeSession.steps.length - 1}
                    isSelected={selectedStepId === step.id}
                    onSelect={() => handleSelectStep(step.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* RIGHT: Step Detail (55%) */}
          <div className="w-[55%] flex flex-col">
            <div className="flex-1 min-h-0 p-2">
              {detailStep ? (
                <StepDetail step={detailStep} isSessionActive={isSessionActive} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="font-mono text-[9px] text-gray-600">Select a step to view details</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Response Options (bottom) ── */}
        {showResponses && (
          <div className="relative z-10 border-t border-white/[0.06] bg-black/20 shrink-0">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04]">
              <Shield className="h-3 w-3 text-cyan-400/60" />
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-gray-400">
                Response Protocols
              </span>
              <span className="font-mono text-[7px] text-gray-600 ml-auto">
                {activeSession.allResponses.length} options evaluated
              </span>
            </div>
            <div className="p-3 grid grid-cols-4 gap-2">
              {activeSession.allResponses.map((option, i) => (
                <ResponseCard key={option.tier} option={option} index={i} />
              ))}
            </div>

            {/* Selected response summary */}
            {activeSession.selectedResponse && (
              <div className="mx-3 mb-3 rounded-lg border border-cyan-500/30 bg-cyan-500/[0.03] p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-cyan-300">
                    Selected: {activeSession.selectedResponse.label}
                  </span>
                </div>
                <p className="font-mono text-[9px] leading-relaxed text-gray-400">
                  {activeSession.selectedResponse.justification}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Geopolitical context strip (if available) */}
        {activeSession.geopoliticalContext && (
          <div className="relative z-10 border-t border-white/[0.04] bg-purple-500/[0.02] px-4 py-2 shrink-0">
            <div className="flex items-start gap-2">
              <Radio className="h-3 w-3 text-purple-400/60 mt-0.5 shrink-0" />
              <p className="font-mono text-[8px] leading-relaxed text-gray-500">
                {activeSession.geopoliticalContext}
              </p>
            </div>
          </div>
        )}

        {/* CSS keyframes */}
        <style jsx>{`
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(12px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    </div>
  )
}

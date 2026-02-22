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
  Search,
  Globe,
  Gauge,
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

/* ── Phase descriptions — clear one-sentence title per step ── */

const STEP_DESCRIPTIONS: Record<AgentFlowStepId, { title: string; subtitle: string; icon: typeof AlertTriangle }> = {
  "threshold-breach": {
    title: "Threat Threshold Breached",
    subtitle: "A satellite has crossed the risk threshold — identifying the threat source.",
    icon: AlertTriangle,
  },
  "deep-research-target": {
    title: "Researching Our Asset",
    subtitle: "Querying orbital status, health, and manoeuvre capability of the target satellite.",
    icon: Search,
  },
  "deep-research-threat": {
    title: "Researching the Threat",
    subtitle: "Investigating the foreign satellite's origin, behaviour, and capabilities.",
    icon: Target,
  },
  "geopolitical-analysis": {
    title: "Geopolitical Context",
    subtitle: "Assessing diplomatic relations, military activity, and regional intelligence.",
    icon: Globe,
  },
  "threat-assessment": {
    title: "Threat to US Intelligence",
    subtitle: "Computing the probability and severity of harm to national security assets.",
    icon: Gauge,
  },
  "response-selection": {
    title: "Selecting a Response",
    subtitle: "Evaluating four response protocols and recommending the safest effective action.",
    icon: Shield,
  },
}

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

/* ── Scan lines ───────────────────────────────────────── */

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

/* ── Threat score HUD (larger for demo) ───────────────── */

function ThreatScoreHUD({ score }: { score: number }) {
  const pct = Math.min(100, Math.round(score * 100))
  const circumference = 2 * Math.PI * 52
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="relative flex items-center justify-center">
      <svg width="128" height="128" viewBox="0 0 128 128" className="drop-shadow-lg">
        <circle cx="64" cy="64" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle
          cx="64" cy="64" r="52" fill="none"
          stroke="url(#agentThreatGradient)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
          transform="rotate(-90 64 64)"
        />
        <defs>
          <linearGradient id="agentThreatGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-4xl font-black tabular-nums text-red-400 drop-shadow-lg">
          {pct}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-400/60">THREAT %</span>
      </div>
    </div>
  )
}

/* ── Confidence bar (larger) ──────────────────────────── */

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
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", gradient)}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="font-mono text-sm tabular-nums font-bold text-gray-300">{Math.round(value * 100)}%</span>
    </div>
  )
}

/* ── Step status icon (larger) ────────────────────────── */

function StepStatusIcon({ status }: { status: AgentStepStatus }) {
  switch (status) {
    case "pending":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-gray-600/50 bg-gray-800/50">
          <div className="h-2 w-2 rounded-full bg-gray-600" />
        </div>
      )
    case "active":
      return (
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-cyan-500/60 bg-cyan-500/10">
          <div className="h-3 w-3 rounded-full bg-cyan-400 animate-pulse" />
          <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-ping" />
        </div>
      )
    case "complete":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-emerald-500/60 bg-emerald-500/10">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        </div>
      )
    case "error":
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-500/60 bg-red-500/10">
          <X className="h-4 w-4 text-red-400" />
        </div>
      )
  }
}

/* ── Thinking line icon ───────────────────────────────── */

function ThinkingLineIcon({ type }: { type: AgentThinkingLine["type"] }) {
  const iconClass = "h-4 w-4 shrink-0"
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

function thinkingLineColor(type: AgentThinkingLine["type"]): string {
  switch (type) {
    case "reasoning": return "text-gray-300"
    case "tool": return "text-amber-300"
    case "result": return "text-emerald-300"
    case "warning": return "text-red-300"
    case "data":
    default: return "text-cyan-300"
  }
}

/* ── Elapsed time ─────────────────────────────────────── */

function formatElapsed(startedAt: number | null, completedAt: number | null): string {
  if (!startedAt) return "--"
  const end = completedAt ?? Date.now()
  const seconds = Math.floor((end - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

/* ── Response theme ───────────────────────────────────── */

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
  const iconSize = "h-6 w-6"
  switch (tier) {
    case "manoeuvre":
      return { label: "MANOEUVRE", icon: <Move className={cn(iconSize, "text-cyan-400")} />, border: "border-cyan-500/40", bg: "bg-cyan-500/5", text: "text-cyan-300", glow: "shadow-cyan-500/20", barColor: "cyan" }
    case "sarcastic-manoeuvre":
      return { label: "SARCASTIC MANOEUVRE", icon: <Eye className={cn(iconSize, "text-amber-400")} />, border: "border-amber-500/40", bg: "bg-amber-500/5", text: "text-amber-300", glow: "shadow-amber-500/20", barColor: "amber" }
    case "decoy":
      return { label: "DECOY", icon: <Radio className={cn(iconSize, "text-orange-400")} />, border: "border-orange-500/40", bg: "bg-orange-500/5", text: "text-orange-300", glow: "shadow-orange-500/20", barColor: "orange" }
    case "destroy":
    default:
      return { label: "DESTROY", icon: <Skull className={cn(iconSize, "text-red-400")} />, border: "border-red-500/50", bg: "bg-red-500/8", text: "text-red-300", glow: "shadow-red-500/30", barColor: "red" }
  }
}

/* ── Flowchart step card (larger, with subtitle) ──────── */

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
  const desc = STEP_DESCRIPTIONS[step.id]
  const StepIcon = desc.icon

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={onSelect}
        className={cn(
          "group relative w-full rounded-xl border px-4 py-3.5 text-left transition-all duration-200",
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
            "absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-all",
            step.status === "active" && "bg-cyan-400",
            step.status === "complete" && "bg-emerald-400",
            step.status === "error" && "bg-red-400",
            step.status === "pending" && "bg-gray-700",
          )}
        />

        <div className="flex items-start gap-3 pl-2">
          <div className="mt-0.5">
            <StepStatusIcon status={step.status} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <StepIcon className={cn(
                "h-4 w-4 shrink-0",
                step.status === "active" ? "text-cyan-400" :
                step.status === "complete" ? "text-emerald-400" :
                "text-gray-500",
              )} />
              <span
                className={cn(
                  "font-mono text-sm font-bold uppercase tracking-wide leading-tight",
                  step.status === "active" && "text-cyan-200",
                  step.status === "complete" && "text-emerald-200",
                  step.status === "error" && "text-red-300",
                  step.status === "pending" && "text-gray-500",
                )}
              >
                {desc.title}
              </span>
            </div>
            <p className={cn(
              "font-mono text-xs mt-1 leading-relaxed",
              step.status === "active" ? "text-cyan-400/70" :
              step.status === "complete" ? "text-gray-400" :
              "text-gray-600",
            )}>
              {desc.subtitle}
            </p>
          </div>
          {step.startedAt && (
            <span className="font-mono text-xs tabular-nums text-gray-500 shrink-0 mt-1">
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
              "w-px h-6",
              step.status === "complete" || step.status === "active"
                ? "bg-gradient-to-b from-cyan-500/40 to-cyan-500/10"
                : "border-l border-dashed border-gray-700",
            )}
          />
          <ChevronDown
            className={cn(
              "h-3 w-3 -mt-0.5",
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

/* ── Step detail panel (larger text) ──────────────────── */

const StepDetail = memo(function StepDetail({
  step,
  isSessionActive,
}: {
  step: AgentFlowStep
  isSessionActive: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const desc = STEP_DESCRIPTIONS[step.id]

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [step.thinkingLines])

  const isStepActive = step.status === "active"

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/[0.06] bg-black/30 overflow-hidden">
      {/* Detail header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3 shrink-0">
        <Activity className="h-5 w-5 text-cyan-400/60" />
        <div className="flex-1 min-w-0">
          <span className="font-mono text-sm font-bold uppercase tracking-wide text-gray-200">
            {desc.title}
          </span>
        </div>
        {step.startedAt && (
          <span className="font-mono text-sm tabular-nums text-gray-500">
            {formatElapsed(step.startedAt, step.completedAt)}
          </span>
        )}
        {isStepActive && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-wider text-cyan-400">PROCESSING</span>
          </div>
        )}
      </div>

      {/* Thinking lines */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-5 py-3 font-mono text-sm leading-[1.8] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
      >
        {step.thinkingLines.length === 0 && step.status === "pending" && (
          <div className="flex items-center justify-center h-full text-gray-600">
            <span className="font-mono text-base">Waiting for activation...</span>
          </div>
        )}
        {step.thinkingLines.length === 0 && isStepActive && (
          <div className="text-gray-500 animate-pulse text-base">Initializing...</div>
        )}
        {step.thinkingLines.map((line) => (
          <div key={line.id} className="mb-1 flex items-start gap-2.5">
            <span className="select-none text-gray-700 tabular-nums w-6 text-right shrink-0 text-xs mt-0.5">
              {String(line.id).padStart(2, "0")}
            </span>
            <ThinkingLineIcon type={line.type} />
            <span className={cn("break-words", thinkingLineColor(line.type))}>
              {line.text}
            </span>
          </div>
        ))}
        {isStepActive && isSessionActive && (
          <span className="inline-block h-4 w-1.5 animate-pulse bg-cyan-400 ml-9 mt-1" />
        )}
      </div>
    </div>
  )
})

/* ── Response option card (larger) ────────────────────── */

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
        "relative rounded-xl border p-4 transition-all duration-300",
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
      {option.recommended && (
        <div className="absolute -top-2.5 right-3 flex items-center gap-1 rounded-md bg-cyan-500 px-2 py-0.5">
          <Star className="h-3 w-3 text-black" />
          <span className="font-mono text-[9px] font-black uppercase tracking-wider text-black">RECOMMENDED</span>
        </div>
      )}

      <div className="flex items-center gap-2.5 mb-2">
        {theme.icon}
        <span className={cn("font-mono text-base font-bold", option.recommended ? theme.text : "text-gray-200")}>
          {theme.label}
        </span>
        {option.tier === "destroy" && (
          <span className="ml-auto font-mono text-xs font-bold text-red-500 animate-pulse">DANGER</span>
        )}
      </div>

      <p className="font-mono text-xs leading-relaxed text-gray-400 mb-3">{option.description}</p>

      <div className="flex items-center gap-3 mb-3">
        <span className="rounded-md px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider border text-gray-300 bg-white/5 border-white/10">
          SEV-{option.severity}
        </span>
        {option.deltaVMs > 0 && (
          <span className="font-mono text-xs text-gray-400">{option.deltaVMs} m/s</span>
        )}
        {option.estimatedTimeMin > 0 && (
          <span className="font-mono text-xs text-gray-400">{option.estimatedTimeMin} min</span>
        )}
      </div>

      <ConfidenceBar value={option.confidence} color={theme.barColor} />

      {(option.benefits.length > 0 || option.risks.length > 0) && (
        <div className="mt-3 space-y-1">
          {option.benefits.map((b: string, i: number) => (
            <div key={`b${i}`} className="flex items-start gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5" />
              <span className="font-mono text-xs text-emerald-400/80">{b}</span>
            </div>
          ))}
          {option.risks.map((r: string, i: number) => (
            <div key={`r${i}`} className="flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500 mt-0.5" />
              <span className="font-mono text-xs text-red-400/80">{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

/* ── Threshold settings dropdown ──────────────────────── */

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
        className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
      >
        <Settings className="h-5 w-5" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-xl border border-white/10 bg-gray-900/95 p-4 shadow-xl backdrop-blur-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-xs font-bold uppercase tracking-wide text-gray-400">
              Trigger Threshold
            </span>
            <span className="font-mono text-lg tabular-nums font-bold text-cyan-400">
              {Math.round(threshold * 100)}%
            </span>
          </div>
          <input
            type="range" min={0} max={100}
            value={Math.round(threshold * 100)}
            onChange={(e) => onThresholdChange(Number(e.target.value) / 100)}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-white/10
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400
              [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-cyan-400/30 [&::-webkit-slider-thumb]:border-none
              [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-cyan-400 [&::-moz-range-thumb]:border-none"
          />
        </div>
      )}
    </div>
  )
}

/* ── Standby state ────────────────────────────────────── */

function AgentStandby({
  threshold,
  onThresholdChange,
}: {
  threshold: number
  onThresholdChange: (value: number) => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-12 relative">
      <ScanLines />
      <div className="absolute inset-x-0 top-0 h-full overflow-hidden pointer-events-none">
        <div
          className="absolute inset-x-0 h-px opacity-10"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(0,255,255,0.6), transparent)",
            animation: "scanVertical 4s linear infinite",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="relative">
          <Brain className="h-24 w-24 text-cyan-500/20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-12 w-12 rounded-full border-2 border-cyan-500/20 animate-ping opacity-20" />
          </div>
        </div>

        <div className="text-center">
          <h3 className="font-mono text-2xl font-black uppercase tracking-[0.3em] text-gray-400">
            AGENT STANDBY
          </h3>
          <p className="mt-3 font-mono text-base text-gray-500 max-w-md leading-relaxed">
            Monitoring fleet risk — autonomous agent will engage when threat
            exceeds <span className="text-cyan-400 font-bold">{Math.round(threshold * 100)}%</span> threshold
          </p>
        </div>

        <div className="w-80 mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-sm font-bold uppercase tracking-wide text-gray-500">
              Activation Threshold
            </span>
            <span className="font-mono text-xl tabular-nums font-bold text-cyan-400">
              {Math.round(threshold * 100)}%
            </span>
          </div>
          <input
            type="range" min={0} max={100}
            value={Math.round(threshold * 100)}
            onChange={(e) => onThresholdChange(Number(e.target.value) / 100)}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-white/10
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400
              [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-cyan-400/30 [&::-webkit-slider-thumb]:border-none
              [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-cyan-400 [&::-moz-range-thumb]:border-none"
          />
          <div className="flex justify-between mt-2">
            <span className="font-mono text-xs text-gray-600">LOW</span>
            <span className="font-mono text-xs text-gray-600">HIGH</span>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-cyan-400/40 animate-pulse" />
            <span className="font-mono text-sm text-gray-500">SENSORS ONLINE</span>
          </div>
          <div className="h-4 w-px bg-white/5" />
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400/40 animate-pulse [animation-delay:500ms]" />
            <span className="font-mono text-sm text-gray-500">AGENT READY</span>
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

  const activeStepId = useMemo(() => {
    if (!activeSession) return null
    const active = activeSession.steps.find((s) => s.status === "active")
    return active?.id ?? null
  }, [activeSession])

  useEffect(() => {
    if (activeStepId) setSelectedStepId(activeStepId)
  }, [activeStepId])

  const detailStep = useMemo(() => {
    if (!activeSession) return null
    if (selectedStepId) return activeSession.steps.find((s) => s.id === selectedStepId) ?? null
    const active = activeSession.steps.find((s) => s.status === "active")
    if (active) return active
    const completed = [...activeSession.steps].reverse().find((s) => s.status === "complete")
    return completed ?? activeSession.steps[0]
  }, [activeSession, selectedStepId])

  const isSessionActive = useMemo(() => {
    if (!activeSession) return false
    return activeSession.completedAt === null
  }, [activeSession])

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
        <div className="relative z-10 border-b border-red-500/20 bg-red-500/[0.03] px-6 py-4 shrink-0">
          <div className="flex items-center gap-4">
            {/* Pulse dot */}
            <div className="relative">
              <div className={cn(
                "h-3.5 w-3.5 rounded-full",
                isSessionActive ? "bg-red-500 animate-pulse" : "bg-emerald-400",
              )} />
              {isSessionActive && (
                <div className="absolute inset-0 h-3.5 w-3.5 rounded-full bg-red-500 animate-ping opacity-30" />
              )}
            </div>

            {/* Title */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-lg font-black uppercase tracking-[0.15em] text-red-400">
                  AUTONOMOUS AGENT RESPONSE
                </span>
                {isSessionActive ? (
                  <span className="font-mono text-sm uppercase tracking-wider text-cyan-400 animate-pulse">ACTIVE</span>
                ) : (
                  <span className="font-mono text-sm uppercase tracking-wider text-emerald-400">COMPLETE</span>
                )}
              </div>
              {/* Threat info strip */}
              <div className="mt-1 flex items-center gap-2 text-base">
                <span className={cn(
                  "rounded-md px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider border",
                  rs.text, rs.bg, rs.border,
                )}>
                  {activeSession.threatLevel}
                </span>
                <span className="text-gray-600">|</span>
                <Skull className="h-4 w-4 text-red-400/60" />
                <span className="font-mono text-sm font-semibold text-red-300">{activeSession.threatSatelliteName}</span>
                <span className="text-gray-500 text-lg">→</span>
                <Crosshair className="h-4 w-4 text-cyan-400/60" />
                <span className="font-mono text-sm font-semibold text-cyan-300">{activeSession.satelliteName}</span>
              </div>
            </div>

            {/* Right: threat score + settings */}
            <div className="flex items-center gap-3">
              <ThreatScoreHUD score={activeSession.triggerRisk} />
              <ThresholdSettings threshold={threshold} onThresholdChange={handleThresholdChange} />
            </div>
          </div>
        </div>

        {/* ── Content: Two-column layout ── */}
        <div className="relative z-10 flex min-h-0 flex-1">
          {/* LEFT: Flowchart (40%) */}
          <div className="w-[40%] border-r border-white/[0.06] flex flex-col">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-2.5 shrink-0">
              <Target className="h-4 w-4 text-cyan-400/60" />
              <span className="font-mono text-sm font-bold uppercase tracking-wide text-gray-400">
                Decision Pipeline
              </span>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-0">
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

          {/* RIGHT: Step Detail (60%) */}
          <div className="w-[60%] flex flex-col">
            <div className="flex-1 min-h-0 p-3">
              {detailStep ? (
                <StepDetail step={detailStep} isSessionActive={isSessionActive} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="font-mono text-base text-gray-600">Select a step to view details</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Response Options (bottom) ── */}
        {showResponses && (
          <div className="relative z-10 border-t border-white/[0.06] bg-black/20 shrink-0">
            <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.06]">
              <Shield className="h-5 w-5 text-cyan-400/60" />
              <span className="font-mono text-sm font-bold uppercase tracking-wide text-gray-300">
                Response Protocols
              </span>
              <span className="font-mono text-xs text-gray-500 ml-auto">
                {activeSession.allResponses.length} options evaluated
              </span>
            </div>
            <div className="p-4 grid grid-cols-4 gap-3">
              {activeSession.allResponses.map((option, i) => (
                <ResponseCard key={option.tier} option={option} index={i} />
              ))}
            </div>

            {activeSession.selectedResponse && (
              <div className="mx-4 mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.03] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-5 w-5 text-cyan-400" />
                  <span className="font-mono text-base font-black uppercase tracking-wide text-cyan-300">
                    Selected: {activeSession.selectedResponse.label}
                  </span>
                </div>
                <p className="font-mono text-sm leading-relaxed text-gray-400">
                  {activeSession.selectedResponse.justification}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Geopolitical context strip */}
        {activeSession.geopoliticalContext && (
          <div className="relative z-10 border-t border-white/[0.04] bg-purple-500/[0.02] px-6 py-3 shrink-0">
            <div className="flex items-start gap-3">
              <Globe className="h-4 w-4 text-purple-400/60 mt-0.5 shrink-0" />
              <p className="font-mono text-xs leading-relaxed text-gray-400">
                {activeSession.geopoliticalContext}
              </p>
            </div>
          </div>
        )}

        <style jsx>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  )
}

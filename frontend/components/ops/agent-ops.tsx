"use client"

import { useEffect, useRef, useState, useMemo, useCallback, memo } from "react"
import {
  Brain,
  Zap,
  CheckCircle2,
  AlertTriangle,
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
  Fuel,
  Satellite,
  BatteryCharging,
  Signal,
  Users,
  Siren,
  BarChart3,
  Clock,
  Flame,
  ShieldAlert,
  ArrowUpDown,
  Radar,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useAgentOpsStore } from "@/stores/agent-ops-store"
import { useAgentSimulation } from "@/hooks/use-agent-simulation"
import { api } from "@/lib/api"
import type {
  AgentFlowStep,
  AgentFlowStepId,
  AgentStepStatus,
  AgentThinkingLine,
  AgentResponseOption,
  AgentResponseTier,
} from "@/types"

/* ================================================================
   Phase metadata — icon, title, subtitle for each pipeline step
   ================================================================ */

const STEP_META: Record<
  AgentFlowStepId,
  { title: string; subtitle: string; icon: typeof AlertTriangle; phaseNum: number }
> = {
  "threshold-breach": {
    phaseNum: 1,
    title: "Threat Threshold Breached",
    subtitle: "A satellite has crossed the risk threshold — identifying the threat source.",
    icon: AlertTriangle,
  },
  "deep-research-target": {
    phaseNum: 2,
    title: "Researching Our Asset",
    subtitle: "Querying orbital status, health, and manoeuvre capability of the target satellite.",
    icon: Search,
  },
  "deep-research-threat": {
    phaseNum: 3,
    title: "Researching the Threat",
    subtitle: "Investigating the foreign satellite's origin, behaviour, and capabilities.",
    icon: Target,
  },
  "geopolitical-analysis": {
    phaseNum: 4,
    title: "Geopolitical Context",
    subtitle: "Assessing diplomatic relations, military activity, and regional intelligence.",
    icon: Globe,
  },
  "threat-assessment": {
    phaseNum: 5,
    title: "Threat to US Intelligence",
    subtitle: "Computing the probability and severity of harm to national security assets.",
    icon: Gauge,
  },
  "response-selection": {
    phaseNum: 6,
    title: "Selecting a Response",
    subtitle: "Evaluating four response protocols and recommending the safest effective action.",
    icon: Shield,
  },
}

/* ================================================================
   Risk / status color palettes
   ================================================================ */

const RISK_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  critical: { text: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/40" },
  high: { text: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/40" },
  medium: { text: "text-yellow-400", bg: "bg-yellow-500/15", border: "border-yellow-500/40" },
  low: { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/40" },
}

function riskStyle(level: string) {
  return RISK_COLORS[level] ?? RISK_COLORS.medium
}

/* ================================================================
   Scan lines background effect
   ================================================================ */

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

/* ================================================================
   Threat score HUD ring (compact for header)
   ================================================================ */

function ThreatScoreHUD({ score }: { score: number }) {
  const pct = Math.min(100, Math.round(score * 100))
  const circumference = 2 * Math.PI * 18
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="relative flex items-center justify-center">
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle
          cx="24" cy="24" r="18" fill="none"
          stroke="url(#agentHudGrad)" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
          transform="rotate(-90 24 24)"
        />
        <defs>
          <linearGradient id="agentHudGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-sm font-black tabular-nums text-red-400">{pct}</span>
      </div>
    </div>
  )
}

/* ================================================================
   Confidence bar — visual fill + percentage
   ================================================================ */

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
    <div className="flex items-center gap-2 w-full">
      <div className="h-1.5 flex-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", gradient)}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums font-bold text-gray-400">{Math.round(value * 100)}%</span>
    </div>
  )
}

/* ================================================================
   Elapsed time formatter
   ================================================================ */

function formatElapsed(startedAt: number | null, completedAt: number | null): string {
  if (!startedAt) return "--"
  const end = completedAt ?? Date.now()
  const seconds = Math.floor((end - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

/* ================================================================
   Data Card — a compact card showing icon + label + value
   ================================================================ */

type CardStatus = "good" | "warning" | "critical" | "neutral"

interface DataCardProps {
  icon: React.ReactNode
  label: string
  value: string
  status?: CardStatus
}

const STATUS_STYLES: Record<CardStatus, { border: string; text: string; valueBg: string }> = {
  good: { border: "border-emerald-500/30", text: "text-emerald-400", valueBg: "bg-emerald-500/10" },
  warning: { border: "border-yellow-500/30", text: "text-yellow-400", valueBg: "bg-yellow-500/10" },
  critical: { border: "border-red-500/30", text: "text-red-400", valueBg: "bg-red-500/10" },
  neutral: { border: "border-white/10", text: "text-gray-300", valueBg: "bg-white/5" },
}

const DataCard = memo(function DataCard({ icon, label, value, status = "neutral" }: DataCardProps) {
  const s = STATUS_STYLES[status]
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border px-4 py-3 min-w-[100px] max-w-[140px]",
        s.border,
        s.valueBg,
      )}
    >
      <div className={cn("shrink-0", s.text)}>{icon}</div>
      <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      <span className={cn("font-mono text-sm font-bold tabular-nums", s.text)}>{value}</span>
    </div>
  )
})

/* ================================================================
   Data card extraction — parse thinking lines into cards per phase
   ================================================================ */

function numericStatus(val: number, goodAbove: number, warnAbove: number): CardStatus {
  if (val >= goodAbove) return "good"
  if (val >= warnAbove) return "warning"
  return "critical"
}

function extractNumber(lines: AgentThinkingLine[], pattern: RegExp): string | null {
  for (const line of lines) {
    const m = line.text.match(pattern)
    if (m) return m[1]
  }
  return null
}

function extractText(lines: AgentThinkingLine[], pattern: RegExp): string | null {
  for (const line of lines) {
    const m = line.text.match(pattern)
    if (m) return m[1]
  }
  return null
}

const iconClass = "h-5 w-5"

function extractPhaseCards(step: AgentFlowStep, triggerRisk: number): DataCardProps[] {
  const lines = step.thinkingLines
  const cards: DataCardProps[] = []

  switch (step.id) {
    case "threshold-breach": {
      const riskPct = extractNumber(lines, /risk level:\s*([\d.]+)%/i)
      const cause = extractText(lines, /Trigger cause:\s*(.+)/i) ?? "Proximity"
      const actor = extractText(lines, /threat actor:\s*([^\s(]+)/i) ?? "UNKNOWN"
      const rVal = riskPct ? parseFloat(riskPct) : triggerRisk * 100
      cards.push({
        icon: <Target className={iconClass} />,
        label: "Risk",
        value: `${Math.round(rVal)}%`,
        status: rVal > 75 ? "critical" : rVal > 50 ? "warning" : "good",
      })
      cards.push({
        icon: <Radar className={iconClass} />,
        label: "Cause",
        value: cause.length > 14 ? cause.slice(0, 12) + ".." : cause,
        status: "neutral",
      })
      cards.push({
        icon: <Satellite className={iconClass} />,
        label: "Actor",
        value: actor.length > 14 ? actor.slice(0, 12) + ".." : actor,
        status: "critical",
      })
      break
    }

    case "deep-research-target": {
      const power = extractNumber(lines, /Power subsystem:\s*(\d+)%/i)
      const comms = extractNumber(lines, /Comms:\s*(\d+)%/i)
      const fuel = extractNumber(lines, /Propellant:\s*(\d+)%/i)
      const mission = extractText(lines, /Mission status:\s*(\w+)/i) ?? "ACTIVE"
      const deltaV = extractNumber(lines, /Available delta-V:\s*([\d.]+)/i)

      if (power) {
        const v = parseInt(power)
        cards.push({ icon: <BatteryCharging className={iconClass} />, label: "Power", value: `${v}%`, status: numericStatus(v, 80, 50) })
      }
      if (comms) {
        const v = parseInt(comms)
        cards.push({ icon: <Signal className={iconClass} />, label: "Comms", value: `${v}%`, status: numericStatus(v, 80, 50) })
      }
      if (fuel) {
        const v = parseInt(fuel)
        cards.push({ icon: <Fuel className={iconClass} />, label: "Fuel", value: `${v}%`, status: numericStatus(v, 60, 30) })
      }
      cards.push({
        icon: <Satellite className={iconClass} />,
        label: "Mission",
        value: mission.toUpperCase(),
        status: mission.toUpperCase() === "ACTIVE" ? "good" : "warning",
      })
      if (deltaV) {
        const v = parseFloat(deltaV)
        cards.push({ icon: <Flame className={iconClass} />, label: "Delta-V", value: `${v} m/s`, status: v > 40 ? "good" : v > 20 ? "warning" : "critical" })
      }
      break
    }

    case "deep-research-threat": {
      const operator = extractText(lines, /Operator:\s*(.+?)(?:\s*—|$)/i)
      const approach = extractText(lines, /classified as "([^"]+)"/i) ?? extractText(lines, /Approach pattern.*?(\w+[-\w]*)/i)
      const tca = extractNumber(lines, /TCA in (\d+) minutes/i)
      const ew = extractText(lines, /EW capability assessment:\s*(\w+)/i)
      const asat = extractNumber(lines, /Match confidence:\s*(\d+)%/i)

      if (operator) {
        const short = operator.length > 14 ? operator.split(" ").slice(0, 2).join(" ") : operator
        cards.push({ icon: <Users className={iconClass} />, label: "Operator", value: short, status: "critical" })
      }
      if (approach) {
        cards.push({ icon: <ArrowUpDown className={iconClass} />, label: "Approach", value: approach, status: "warning" })
      }
      if (tca) {
        const v = parseInt(tca)
        cards.push({ icon: <Clock className={iconClass} />, label: "TCA", value: `${v} min`, status: v < 30 ? "critical" : v < 60 ? "warning" : "neutral" })
      }
      if (ew) {
        cards.push({ icon: <Zap className={iconClass} />, label: "EW Cap.", value: ew, status: ew === "HIGH" ? "critical" : "warning" })
      }
      if (asat) {
        const v = parseInt(asat)
        cards.push({ icon: <ShieldAlert className={iconClass} />, label: "ASAT Match", value: `${v}%`, status: v > 80 ? "critical" : v > 60 ? "warning" : "neutral" })
      }
      break
    }

    case "geopolitical-analysis": {
      const diplo = extractText(lines, /Diplomatic relations:\s*(\w+)/i)
      const exercises = extractNumber(lines, /(\d+) active military exercises/i)
      const defcon = extractText(lines, /readiness:\s*(\w+(?:\s*\([^)]*\))?)/i)
      const allied = extractNumber(lines, /(\d+) allied space assets/i)

      if (diplo) {
        cards.push({ icon: <Globe className={iconClass} />, label: "Diplomacy", value: diplo, status: diplo === "STRAINED" ? "critical" : "warning" })
      }
      if (exercises) {
        const v = parseInt(exercises)
        cards.push({ icon: <Siren className={iconClass} />, label: "Mil. Activity", value: `${v} exercises`, status: v > 2 ? "critical" : "warning" })
      }
      if (defcon) {
        const isEnhanced = defcon.includes("ENHANCED") || defcon.includes("2")
        cards.push({ icon: <ShieldAlert className={iconClass} />, label: "SPACECOM", value: isEnhanced ? "LEVEL 2" : "LEVEL 3", status: isEnhanced ? "critical" : "warning" })
      }
      if (allied) {
        const v = parseInt(allied)
        cards.push({ icon: <Users className={iconClass} />, label: "Allied Assets", value: `${v} nearby`, status: v > 4 ? "good" : "warning" })
      }
      break
    }

    case "threat-assessment": {
      const bayesian = extractText(lines, /Posterior:\s*([\d.]+)/i)
      const intent = extractNumber(lines, /Intent score:\s*(\d+)/i)
      const impact = extractText(lines, /Impact if asset compromised:\s*(\w+)/i)
      const urgency = extractText(lines, /Urgency:\s*(\w+)/i)

      if (bayesian) {
        const v = parseFloat(bayesian)
        const pct = Math.round(v * 100)
        cards.push({ icon: <BarChart3 className={iconClass} />, label: "Bayesian Prob", value: `${pct}%`, status: v > 0.75 ? "critical" : v > 0.5 ? "warning" : "neutral" })
      }
      if (intent) {
        const v = parseInt(intent)
        cards.push({ icon: <Target className={iconClass} />, label: "Intent Score", value: `${v}/100`, status: v > 70 ? "critical" : v > 40 ? "warning" : "neutral" })
      }
      if (impact) {
        cards.push({ icon: <Skull className={iconClass} />, label: "Impact", value: impact, status: impact === "SEVERE" ? "critical" : "warning" })
      }
      if (urgency) {
        cards.push({ icon: <Clock className={iconClass} />, label: "Urgency", value: urgency, status: urgency === "IMMEDIATE" ? "critical" : urgency === "HIGH" ? "warning" : "neutral" })
      }
      break
    }

    default:
      break
  }

  return cards
}

/* ================================================================
   Response card themes
   ================================================================ */

interface ResponseTheme {
  label: string
  shortDesc: string
  icon: React.ReactNode
  border: string
  bg: string
  text: string
  glow: string
  barColor: string
  sevColor: string
}

function getResponseTheme(tier: AgentResponseTier): ResponseTheme {
  const sz = "h-7 w-7"
  switch (tier) {
    case "manoeuvre":
      return {
        label: "MANOEUVRE",
        shortDesc: "Defensive orbit adjustment to increase separation distance.",
        icon: <Move className={cn(sz, "text-cyan-400")} />,
        border: "border-cyan-500/40",
        bg: "bg-cyan-500/5",
        text: "text-cyan-300",
        glow: "shadow-cyan-500/20",
        barColor: "cyan",
        sevColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
      }
    case "sarcastic-manoeuvre":
      return {
        label: "SARCASTIC",
        shortDesc: "Mirror the adversary's movements to signal awareness.",
        icon: <Eye className={cn(sz, "text-amber-400")} />,
        border: "border-amber-500/40",
        bg: "bg-amber-500/5",
        text: "text-amber-300",
        glow: "shadow-amber-500/20",
        barColor: "amber",
        sevColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      }
    case "decoy":
      return {
        label: "DECOY",
        shortDesc: "Deploy decoys and reposition under cover of false targets.",
        icon: <Radio className={cn(sz, "text-orange-400")} />,
        border: "border-orange-500/40",
        bg: "bg-orange-500/5",
        text: "text-orange-300",
        glow: "shadow-orange-500/20",
        barColor: "orange",
        sevColor: "bg-orange-500/20 text-orange-300 border-orange-500/30",
      }
    case "destroy":
    default:
      return {
        label: "DESTROY",
        shortDesc: "Kinetic neutralization. Extreme measure requiring NCA authorization.",
        icon: <Skull className={cn(sz, "text-red-400")} />,
        border: "border-red-500/50",
        bg: "bg-red-500/8",
        text: "text-red-300",
        glow: "shadow-red-500/30",
        barColor: "red",
        sevColor: "bg-red-500/20 text-red-300 border-red-500/30",
      }
  }
}

/* ================================================================
   Response Card — visual, compact, one-sentence description max
   ================================================================ */

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
        "relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-all duration-300 min-w-[140px] flex-1",
        option.recommended
          ? cn(theme.border, theme.bg, "shadow-lg", theme.glow, "ring-1 ring-cyan-500/30")
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]",
      )}
      style={{
        animationDelay: `${index * 100}ms`,
        animation: "slideUp 0.4s ease-out both",
      }}
    >
      {option.recommended && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-md bg-cyan-500 px-2 py-0.5 whitespace-nowrap">
          <Star className="h-3 w-3 text-black" />
          <span className="font-mono text-[9px] font-black uppercase tracking-wider text-black">REC</span>
        </div>
      )}

      {/* Icon */}
      {theme.icon}

      {/* Label */}
      <span className={cn("font-mono text-sm font-bold text-center", option.recommended ? theme.text : "text-gray-200")}>
        {theme.label}
      </span>

      {/* Severity badge */}
      <span
        className={cn(
          "rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider border",
          theme.sevColor,
        )}
      >
        SEV-{option.severity}
      </span>

      {/* Confidence bar */}
      <div className="w-full mt-1">
        <ConfidenceBar value={option.confidence} color={theme.barColor} />
      </div>

      {/* One sentence */}
      <p className="font-mono text-[10px] leading-relaxed text-gray-500 text-center line-clamp-2 mt-1">
        {theme.shortDesc}
      </p>
    </div>
  )
})

/* ================================================================
   Phase Section — full-width, with data cards and connecting line
   ================================================================ */

const PhaseSection = memo(function PhaseSection({
  step,
  isLast,
  triggerRisk,
  responses,
  selectedResponse,
  isSessionComplete,
  fullAutonomy,
  isExecuting,
}: {
  step: AgentFlowStep
  isLast: boolean
  triggerRisk: number
  responses: AgentResponseOption[]
  selectedResponse: AgentResponseOption | null
  isSessionComplete: boolean
  fullAutonomy: boolean
  isExecuting: boolean
}) {
  const meta = STEP_META[step.id]
  const PhaseIcon = meta.icon
  const isPending = step.status === "pending"
  const isActive = step.status === "active"
  const isComplete = step.status === "complete"

  // Data cards for non-response phases
  const dataCards = useMemo(() => {
    if (step.id === "response-selection") return []
    return extractPhaseCards(step, triggerRisk)
  }, [step, triggerRisk])

  // Collapsible thinking log — last 3 lines
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const recentThinking = useMemo(() => {
    const relevant = step.thinkingLines.filter((l) => l.type === "reasoning" || l.type === "warning")
    return relevant.slice(-3)
  }, [step.thinkingLines])

  // If pending, render minimal placeholder
  if (isPending) {
    return (
      <div className="opacity-30">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-gray-700/50 bg-gray-800/40">
            <PhaseIcon className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <span className="font-mono text-sm font-bold uppercase tracking-wider text-gray-600">
              PHASE {meta.phaseNum}: {meta.title}
            </span>
            <p className="font-mono text-xs text-gray-700 mt-0.5">{meta.subtitle}</p>
          </div>
        </div>
        {/* Connector */}
        {!isLast && (
          <div className="flex flex-col items-center pb-2">
            <div className="w-px h-8 border-l border-dashed border-gray-700/50" />
            <ChevronDown className="h-3 w-3 text-gray-700/50 -mt-0.5" />
          </div>
        )}
      </div>
    )
  }

  // Active or complete
  return (
    <div>
      {/* Divider */}
      <div
        className={cn(
          "h-px mx-6",
          isActive
            ? "bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"
            : "bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent",
        )}
      />

      {/* Phase header */}
      <div className="px-6 pt-5 pb-2">
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          {isActive ? (
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-cyan-500/60 bg-cyan-500/10">
              <PhaseIcon className="h-5 w-5 text-cyan-400" />
              <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-ping" />
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-emerald-500/40 bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "font-mono text-lg font-bold uppercase tracking-wider",
                  isActive ? "text-cyan-200" : "text-emerald-200",
                )}
              >
                PHASE {meta.phaseNum}: {meta.title}
              </span>
              {isActive && (
                <span className="font-mono text-xs uppercase tracking-wider text-cyan-400 animate-pulse">
                  PROCESSING
                </span>
              )}
            </div>
            <p
              className={cn(
                "font-mono text-sm mt-0.5",
                isActive ? "text-cyan-400/60" : "text-gray-500",
              )}
            >
              {meta.subtitle}
            </p>
          </div>

          {step.startedAt && (
            <span className="font-mono text-xs tabular-nums text-gray-500 shrink-0">
              {formatElapsed(step.startedAt, step.completedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Data cards row */}
      {step.id !== "response-selection" && dataCards.length > 0 && (
        <div className="px-6 pb-3 pt-2">
          <div className="flex flex-wrap gap-3">
            {dataCards.map((card, i) => (
              <DataCard key={i} {...card} />
            ))}
          </div>
        </div>
      )}

      {/* Active step: spinner line */}
      {isActive && step.thinkingLines.length > 0 && (
        <div className="px-6 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-mono text-xs text-cyan-300/70 truncate">
              {step.thinkingLines[step.thinkingLines.length - 1]?.text}
            </span>
          </div>
        </div>
      )}

      {/* Thinking lines — collapsible, last 3 reasoning/warning lines */}
      {isComplete && recentThinking.length > 0 && (
        <div className="px-6 pb-3">
          <button
            onClick={() => setThinkingOpen(!thinkingOpen)}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-600 hover:text-gray-400 transition-colors"
          >
            <Brain className="h-3 w-3" />
            <span>{thinkingOpen ? "Hide" : "Show"} reasoning ({recentThinking.length})</span>
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", thinkingOpen && "rotate-180")}
            />
          </button>
          {thinkingOpen && (
            <div className="mt-2 space-y-1 pl-1 border-l border-white/5">
              {recentThinking.map((line) => (
                <p key={line.id} className="font-mono text-xs text-gray-500 pl-3 leading-relaxed">
                  {line.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RESPONSE SELECTION PHASE — show the 4 response cards */}
      {step.id === "response-selection" && responses.length > 0 && (
        <div className="px-6 pb-4 pt-1">
          <div className="grid grid-cols-4 gap-3">
            {responses.map((opt, i) => (
              <ResponseCard key={opt.tier} option={opt} index={i} />
            ))}
          </div>

          {/* Recommended response block */}
          {selectedResponse && (
            <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="h-5 w-5 text-cyan-400" />
                <span className="font-mono text-sm font-black uppercase tracking-wide text-cyan-300">
                  RECOMMENDED: {selectedResponse.label}
                </span>
              </div>
              <p className="font-mono text-sm leading-relaxed text-gray-400 mb-3">
                {selectedResponse.justification}
              </p>

              {/* Execute button / executing state */}
              {fullAutonomy && isSessionComplete && (
                <div className="mt-2">
                  {isExecuting ? (
                    <ExecutionProgress />
                  ) : (
                    <div className="flex items-center gap-2 text-cyan-400">
                      <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="font-mono text-xs uppercase tracking-wider">
                        Auto-execution queued...
                      </span>
                    </div>
                  )}
                </div>
              )}

              {!fullAutonomy && isSessionComplete && (
                <button
                  className={cn(
                    "mt-2 w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5",
                    "font-mono text-sm font-bold uppercase tracking-wider text-cyan-300",
                    "hover:bg-cyan-500/20 transition-all",
                  )}
                  onClick={() => {
                    useAgentOpsStore.getState().setIsExecuting(true)
                    fetch(api.scenarioEvade, { method: "POST" }).catch(() => {})
                  }}
                >
                  EXECUTE MANOEUVRE
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Connector to next phase */}
      {!isLast && (
        <div className="flex flex-col items-center pb-2 pt-1">
          <div
            className={cn(
              "w-px h-8",
              isComplete
                ? "bg-gradient-to-b from-emerald-500/30 to-cyan-500/10"
                : "bg-gradient-to-b from-cyan-500/40 to-cyan-500/10",
            )}
          />
          <ChevronDown
            className={cn(
              "h-4 w-4 -mt-1",
              isComplete ? "text-emerald-500/40" : "text-cyan-500/40",
            )}
          />
        </div>
      )}
    </div>
  )
})

/* ================================================================
   Execution progress bar
   ================================================================ */

function ExecutionProgress() {
  const [pct, setPct] = useState(0)
  const [done, setDone] = useState(false)

  // Trigger USA-245 evasive maneuver on the backend when execution starts
  useEffect(() => {
    fetch(api.scenarioEvade, { method: "POST" }).catch(() => {})
  }, [])

  useEffect(() => {
    let frame: number
    const start = Date.now()
    const duration = 4000 // 4 seconds
    function tick() {
      const elapsed = Date.now() - start
      const p = Math.min(100, (elapsed / duration) * 100)
      setPct(p)
      if (p >= 100) {
        setDone(true)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
        <CheckCircle2 className="h-6 w-6 text-emerald-400" />
        <div>
          <span className="font-mono text-sm font-bold uppercase tracking-wider text-emerald-300">
            MANOEUVRE EXECUTED
          </span>
          <p className="font-mono text-[10px] text-emerald-400/70 mt-0.5">
            Orbit raise +50km, RAAN shift +30°, inclination shift +8° initiated. Trajectory separating.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/[0.05] px-4 py-3">
      <div className="flex items-center gap-3 mb-2">
        <Activity className="h-4 w-4 text-cyan-400 animate-pulse" />
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-300">
          EXECUTING RECOMMENDED RESPONSE...
        </span>
        <span className="font-mono text-xs tabular-nums text-cyan-400/60 ml-auto">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-100"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* ================================================================
   Threshold settings dropdown
   ================================================================ */

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
        <Settings className="h-4 w-4" />
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
            type="range"
            min={0}
            max={100}
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

/* ================================================================
   Standby State — adapted for full width
   ================================================================ */

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
            exceeds{" "}
            <span className="text-cyan-400 font-bold">{Math.round(threshold * 100)}%</span>{" "}
            threshold
          </p>
        </div>

        <div className="w-80 mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-sm font-bold uppercase tracking-wide text-gray-500">
              Activation Threshold
            </span>
            <span className="font-mono text-xl tabular-nums font-bold text-cyan-400">
              {Math.round(threshold * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
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

/* ================================================================
   ████  MAIN COMPONENT — AgentOps  ████
   ================================================================ */

export function AgentOps() {
  const threshold = useAgentOpsStore((s) => s.threshold)
  const setThreshold = useAgentOpsStore((s) => s.setThreshold)
  const activeSession = useAgentOpsStore((s) => s.activeSession)
  const pendingThreat = useAgentOpsStore((s) => s.pendingThreat)
  const clearPendingThreat = useAgentOpsStore((s) => s.clearPendingThreat)
  const startSession = useAgentOpsStore((s) => s.startSession)
  const fullAutonomy = useAgentOpsStore((s) => s.fullAutonomy)
  const isExecuting = useAgentOpsStore((s) => s.isExecuting)
  const { runSimulation } = useAgentSimulation()

  /* ── Consume pending threats ── */
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

  /* ── Auto-scroll to active phase ── */
  const activePhaseRef = useRef<HTMLDivElement>(null)
  const activeStepId = useMemo(() => {
    if (!activeSession) return null
    const active = activeSession.steps.find((s) => s.status === "active")
    return active?.id ?? null
  }, [activeSession])

  useEffect(() => {
    if (activePhaseRef.current) {
      activePhaseRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [activeStepId])

  const isSessionComplete = useMemo(() => {
    if (!activeSession) return false
    return activeSession.completedAt !== null
  }, [activeSession])

  const handleThresholdChange = useCallback(
    (value: number) => {
      setThreshold(value)
    },
    [setThreshold],
  )

  /* ── STANDBY — no active session ── */
  if (!activeSession) {
    return (
      <div className="mr-auto h-full w-full max-w-[560px]">
        <div
          data-ops-panel
          className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg font-mono"
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

  /* ── ACTIVE SESSION — scrollable journey ── */
  const rs = riskStyle(activeSession.threatLevel)

  return (
    <div className="mr-auto h-full w-full max-w-[560px]">
      <div
        data-ops-panel
        className="pointer-events-auto relative flex h-full flex-col overflow-hidden rounded-xl border border-red-500/20 bg-card/90 shadow-lg shadow-red-500/5 backdrop-blur-xl font-mono"
      >
        <ScanLines />

        {/* ══ STICKY HEADER ══ */}
        <div className="sticky top-0 z-30 border-b border-red-500/20 bg-gray-950/95 backdrop-blur-xl px-6 py-3 shrink-0">
          <div className="flex items-center gap-4">
            {/* Pulse dot */}
            <div className="relative shrink-0">
              <div
                className={cn(
                  "h-3 w-3 rounded-full",
                  !isSessionComplete ? "bg-red-500 animate-pulse" : "bg-emerald-400",
                )}
              />
              {!isSessionComplete && (
                <div className="absolute inset-0 h-3 w-3 rounded-full bg-red-500 animate-ping opacity-30" />
              )}
            </div>

            {/* Title block */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-base font-black uppercase tracking-[0.15em] text-red-400">
                  AUTONOMOUS AGENT
                </span>
                {!isSessionComplete ? (
                  <span className="font-mono text-xs uppercase tracking-wider text-cyan-400 animate-pulse">
                    ACTIVE
                  </span>
                ) : (
                  <span className="font-mono text-xs uppercase tracking-wider text-emerald-400">
                    COMPLETE
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-sm">
                <Skull className="h-3.5 w-3.5 text-red-400/60 shrink-0" />
                <span className="font-mono text-xs font-semibold text-red-300 truncate">
                  {activeSession.threatSatelliteName}
                </span>
                <span className="text-gray-600">→</span>
                <Crosshair className="h-3.5 w-3.5 text-cyan-400/60 shrink-0" />
                <span className="font-mono text-xs font-semibold text-cyan-300 truncate">
                  {activeSession.satelliteName}
                </span>
                <span className="text-gray-700 mx-1">|</span>
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider border",
                    rs.text,
                    rs.bg,
                    rs.border,
                  )}
                >
                  {activeSession.threatLevel}
                </span>
              </div>
            </div>

            {/* Right side: HUD + autonomy + settings */}
            <div className="flex items-center gap-3 shrink-0">
              <ThreatScoreHUD score={activeSession.triggerRisk} />
              <ThresholdSettings threshold={threshold} onThresholdChange={handleThresholdChange} />
            </div>
          </div>
        </div>

        {/* ══ SCROLLABLE JOURNEY ══ */}
        <ScrollArea className="flex-1 min-h-0 relative z-10">
          <div className="pb-12 pt-4">
            {activeSession.steps.map((step, i) => {
              const isActivePhase = step.id === activeStepId
              return (
                <div
                  key={step.id}
                  ref={isActivePhase ? activePhaseRef : undefined}
                >
                  <PhaseSection
                    step={step}
                    isLast={i === activeSession.steps.length - 1}
                    triggerRisk={activeSession.triggerRisk}
                    responses={activeSession.allResponses}
                    selectedResponse={activeSession.selectedResponse}
                    isSessionComplete={isSessionComplete}
                    fullAutonomy={fullAutonomy}
                    isExecuting={isExecuting}
                  />
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <style jsx>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes scanVertical {
            0% { top: -2px; }
            100% { top: 100%; }
          }
        `}</style>
      </div>
    </div>
  )
}

"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import {
  Target,
  Bot,
  User,
  Send,
  Loader2,
  Radio,
  ShieldAlert,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { cn } from "@/lib/utils"
import { useThreatStore } from "@/stores/threat-store"
import { useUIStore } from "@/stores/ui-store"
import type { SignalThreat } from "@/types"

/* ═══════════════════════════════════════════════════════
   Types & Constants
   ═══════════════════════════════════════════════════════ */

interface SignalOpsProps {
  threats: SignalThreat[]
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

const SEVERITY_ORDER: Record<string, number> = {
  threatened: 0,
  watched: 1,
  nominal: 2,
  allied: 3,
  friendly: 3,
}

/* ═══════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════ */

function formatTCA(minutes: number): string {
  if (minutes < 60) return `T-${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `T-${h}h ${m}m` : `T-${h}h`
}

function DataRow({
  label,
  value,
  alert,
}: {
  label: string
  value: string | number
  alert?: boolean
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/20 py-2.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-sm tabular-nums",
          alert ? "text-red-400 font-semibold" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  )
}

function ProbabilityBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border/40">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500 ease-out",
          value > 0.5
            ? "bg-red-500/80"
            : value > 0.2
              ? "bg-amber-500/80"
              : "bg-cyan-500/60",
        )}
        style={{ width: `${value * 100}%` }}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Orbital geometry constants
   ═══════════════════════════════════════════════════════ */

// Ground station fixed position
const GS_X = 400
const GS_Y = 290

// Friendly satellite orbit
const FRIENDLY_CX = 400
const FRIENDLY_CY = 170
const FRIENDLY_RX = 310
const FRIENDLY_RY = 140
const FRIENDLY_CENTER = Math.PI / 2
const FRIENDLY_AMP = Math.PI / 3 // max sweep range for clamping

// Hostile satellite orbit
const HOSTILE_CX = 400
const HOSTILE_CY = 160
const HOSTILE_RX = 230
const HOSTILE_RY = 90
const HOSTILE_CENTER = Math.PI / 2
const HOSTILE_AMP = Math.PI / 3.5
const HOSTILE_PERIOD = 8 // seconds — aggressive back-and-forth

/* ═══════════════════════════════════════════════════════
   Beam Interception Visual (Animated)
   ═══════════════════════════════════════════════════════ */

function BeamInterceptionVisual({
  threat,
  onProbChange,
}: {
  threat: SignalThreat | null
  onProbChange?: (prob: number) => void
}) {
  const friendlyName = threat?.targetLinkAssetName ?? "US SATELLITE"
  const hostileName = threat?.interceptorName ?? "HOSTILE SAT"
  const groundStation = threat?.groundStationName ?? "GROUND STATION"

  // Animation state — positions + computed probability
  const [anim, setAnim] = useState({
    fx: FRIENDLY_CX + FRIENDLY_RX * Math.cos(FRIENDLY_CENTER),
    fy: FRIENDLY_CY - FRIENDLY_RY * Math.sin(FRIENDLY_CENTER),
    hx: HOSTILE_CX + HOSTILE_RX * Math.cos(HOSTILE_CENTER),
    hy: HOSTILE_CY - HOSTILE_RY * Math.sin(HOSTILE_CENTER),
    prob: 0.15,
  })

  const frameRef = useRef<number>(0)
  const startRef = useRef(Date.now())
  const onProbChangeRef = useRef(onProbChange)
  onProbChangeRef.current = onProbChange

  // Physics state for green satellite
  const greenAngleRef = useRef(FRIENDLY_CENTER)
  const greenVelRef = useRef(0)
  // Lagged evasion signals — green reacts AFTER the crossover, not before
  const laggedProxRef = useRef(0)
  const laggedDirRef = useRef(0)

  useEffect(() => {
    let lastUpdate = 0

    function animate() {
      const now = Date.now()
      // Throttle to ~30fps
      if (now - lastUpdate < 33) {
        frameRef.current = requestAnimationFrame(animate)
        return
      }
      const dt = Math.min((now - lastUpdate) / 1000, 0.05) // cap dt
      lastUpdate = now

      const elapsed = (now - startRef.current) / 1000
      const omega = (2 * Math.PI) / HOSTILE_PERIOD

      // ── Red (hostile): independent sine oscillation — the aggressor ──
      const hT = HOSTILE_CENTER + HOSTILE_AMP * Math.sin(elapsed * omega)
      const hx = HOSTILE_CX + HOSTILE_RX * Math.cos(hT)
      const hy = HOSTILE_CY - HOSTILE_RY * Math.sin(hT)

      // ── Green (friendly): physics-based — slow drift + reactive evasion ──
      const fAngle = greenAngleRef.current
      const fx = FRIENDLY_CX + FRIENDLY_RX * Math.cos(fAngle)
      const fy = FRIENDLY_CY - FRIENDLY_RY * Math.sin(fAngle)

      // Beam: friendly → ground station
      const ABx = GS_X - fx
      const ABy = GS_Y - fy
      const APx = hx - fx
      const APy = hy - fy
      const signedCross = ABx * APy - ABy * APx
      const len = Math.sqrt(ABx * ABx + ABy * ABy)
      const dist = len > 0 ? Math.abs(signedCross) / len : 999

      // Probability — 100% at crossover, sharp falloff
      const prob = Math.max(0.02, Math.min(1.0, Math.exp(-dist / 30)))

      // === Green satellite physics ===

      // 1. Purposeful natural motion — green sweeps its orbit on its own
      const naturalTarget =
        FRIENDLY_CENTER + 0.35 * Math.sin(elapsed * 0.45)
      const springForce = (naturalTarget - fAngle) * 1.0

      // 2. LAGGED evasion — green only reacts ~1.3s AFTER the close approach
      //    This means green carries through the crossover before changing direction
      const proximity = Math.max(0, 1 - dist / 80)
      laggedProxRef.current +=
        (proximity - laggedProxRef.current) * 0.025 // slow ramp-up
      const rawDir = signedCross >= 0 ? -1 : 1
      laggedDirRef.current +=
        (rawDir - laggedDirRef.current) * 0.04 // smooth direction
      const evasionForce =
        laggedProxRef.current * laggedProxRef.current * 4.5 * laggedDirRef.current

      // 3. Moderate damping — enough momentum to carry through the cross
      const damping = -greenVelRef.current * 2.0

      // Integrate
      greenVelRef.current += (springForce + evasionForce + damping) * dt
      greenAngleRef.current += greenVelRef.current * dt

      // Clamp to orbit range
      const minAngle = FRIENDLY_CENTER - FRIENDLY_AMP
      const maxAngle = FRIENDLY_CENTER + FRIENDLY_AMP
      if (greenAngleRef.current < minAngle) {
        greenAngleRef.current = minAngle
        if (greenVelRef.current < 0) greenVelRef.current = 0
      }
      if (greenAngleRef.current > maxAngle) {
        greenAngleRef.current = maxAngle
        if (greenVelRef.current > 0) greenVelRef.current = 0
      }

      setAnim({ fx, fy, hx, hy, prob })
      onProbChangeRef.current?.(prob)

      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [])

  const { fx, fy, hx, hy, prob } = anim

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <svg
        viewBox="0 0 800 320"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ── Definitions ── */}
        <defs>
          <linearGradient id="beamGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.8" />
            <stop offset="40%" stopColor="#22c55e" stopOpacity="0.5" />
            <stop offset="55%" stopColor="#ef4444" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.3" />
          </linearGradient>

          <radialGradient id="interceptGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </radialGradient>

          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Background grid ── */}
        <pattern
          id="grid"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="rgba(255,255,255,0.03)"
            strokeWidth="0.5"
          />
        </pattern>
        <rect width="800" height="320" fill="url(#grid)" />

        {/* ── Earth surface arc ── */}
        <path
          d="M 0 305 Q 400 275 800 305"
          fill="none"
          stroke="rgba(59,130,246,0.2)"
          strokeWidth="1"
        />
        <path
          d="M 0 310 Q 400 280 800 310"
          fill="none"
          stroke="rgba(59,130,246,0.1)"
          strokeWidth="1"
        />

        {/* ── Dotted orbit paths ── */}
        {/* Friendly orbit (green dotted ellipse) */}
        <ellipse
          cx={FRIENDLY_CX}
          cy={FRIENDLY_CY}
          rx={FRIENDLY_RX}
          ry={FRIENDLY_RY}
          fill="none"
          stroke="#22c55e"
          strokeWidth="1"
          strokeOpacity="0.15"
          strokeDasharray="4,8"
        />
        {/* Hostile orbit (red dotted ellipse) */}
        <ellipse
          cx={HOSTILE_CX}
          cy={HOSTILE_CY}
          rx={HOSTILE_RX}
          ry={HOSTILE_RY}
          fill="none"
          stroke="#ef4444"
          strokeWidth="1"
          strokeOpacity="0.15"
          strokeDasharray="4,8"
        />

        {/* ── Beam: friendly sat → ground station ── */}
        <line
          x1={fx}
          y1={fy}
          x2={GS_X}
          y2={GS_Y}
          stroke="#22c55e"
          strokeWidth="1"
          strokeOpacity="0.1"
        />
        <line
          x1={fx}
          y1={fy}
          x2={GS_X}
          y2={GS_Y}
          stroke={prob > 0.3 ? "#ef4444" : "#22c55e"}
          strokeWidth="2"
          strokeDasharray="8,6"
          strokeOpacity={0.5 + prob * 0.5}
          style={{ animation: "beam-flow 1.5s linear infinite" }}
        />

        {/* ── Interception zone (around hostile sat, intensity = probability) ── */}
        <circle
          cx={hx}
          cy={hy}
          r={35 + prob * 20}
          fill="url(#interceptGlow)"
          opacity={0.3 + prob * 0.7}
        />
        {prob > 0.15 && (
          <circle
            cx={hx}
            cy={hy}
            r={18 + prob * 10}
            fill="none"
            stroke="#ef4444"
            strokeWidth="1"
            strokeOpacity={prob * 0.6}
            className="animate-ping"
          />
        )}
        {prob > 0.3 && (
          <circle
            cx={hx}
            cy={hy}
            r={10}
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeOpacity={prob}
            className="animate-pulse"
          />
        )}

        {/* ── Friendly US Satellite ── */}
        <g
          transform={`translate(${fx - 160}, ${fy - 44})`}
          filter="url(#glow)"
        >
          {/* Body */}
          <rect
            x="145"
            y="35"
            width="30"
            height="18"
            rx="3"
            fill="#22c55e"
            fillOpacity="0.2"
            stroke="#22c55e"
            strokeWidth="1.5"
          />
          {/* Solar panels */}
          <rect
            x="120"
            y="39"
            width="22"
            height="10"
            rx="1"
            fill="#22c55e"
            fillOpacity="0.12"
            stroke="#22c55e"
            strokeWidth="0.8"
          />
          <rect
            x="178"
            y="39"
            width="22"
            height="10"
            rx="1"
            fill="#22c55e"
            fillOpacity="0.12"
            stroke="#22c55e"
            strokeWidth="0.8"
          />
          {/* Antenna */}
          <line
            x1="160"
            y1="53"
            x2="160"
            y2="62"
            stroke="#22c55e"
            strokeWidth="1"
          />
          <circle cx="160" cy="64" r="2" fill="#22c55e" fillOpacity="0.6" />
        </g>
        {/* Friendly labels */}
        <text
          x={fx}
          y={fy - 22}
          textAnchor="middle"
          className="fill-emerald-400 font-mono"
          style={{ fontSize: "9px", letterSpacing: "0.08em" }}
        >
          {friendlyName}
        </text>
        <text
          x={fx}
          y={fy - 32}
          textAnchor="middle"
          className="fill-emerald-500/50 font-mono"
          style={{ fontSize: "8px" }}
        >
          FRIENDLY
        </text>

        {/* ── Hostile Interceptor Satellite ── */}
        <g
          transform={`translate(${hx - 370}, ${hy - 109})`}
          filter="url(#glow)"
        >
          {/* Body */}
          <rect
            x="355"
            y="100"
            width="30"
            height="18"
            rx="3"
            fill="#ef4444"
            fillOpacity="0.2"
            stroke="#ef4444"
            strokeWidth="1.5"
          />
          {/* Solar panels */}
          <rect
            x="330"
            y="104"
            width="22"
            height="10"
            rx="1"
            fill="#ef4444"
            fillOpacity="0.12"
            stroke="#ef4444"
            strokeWidth="0.8"
          />
          <rect
            x="388"
            y="104"
            width="22"
            height="10"
            rx="1"
            fill="#ef4444"
            fillOpacity="0.12"
            stroke="#ef4444"
            strokeWidth="0.8"
          />
          {/* Antenna dish */}
          <path
            d="M 365 118 Q 370 128 375 118"
            fill="none"
            stroke="#ef4444"
            strokeWidth="1"
          />
        </g>
        {/* Hostile labels */}
        <text
          x={hx}
          y={hy - 18}
          textAnchor="middle"
          className="fill-red-400 font-mono"
          style={{ fontSize: "9px", letterSpacing: "0.08em" }}
        >
          {hostileName}
        </text>
        <text
          x={hx}
          y={hy - 28}
          textAnchor="middle"
          className="fill-red-500/50 font-mono"
          style={{ fontSize: "8px" }}
        >
          INTERCEPTOR
        </text>

        {/* ── Ground Station (fixed) ── */}
        <g>
          <path
            d={`M ${GS_X - 10} ${GS_Y - 2} Q ${GS_X} ${GS_Y - 18} ${GS_X + 10} ${GS_Y - 2}`}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
          />
          <line
            x1={GS_X}
            y1={GS_Y - 2}
            x2={GS_X}
            y2={GS_Y + 10}
            stroke="#3b82f6"
            strokeWidth="1.5"
          />
          <rect
            x={GS_X - 8}
            y={GS_Y + 10}
            width="16"
            height="4"
            rx="1"
            fill="#3b82f6"
            fillOpacity="0.3"
            stroke="#3b82f6"
            strokeWidth="0.8"
          />
          <circle
            cx={GS_X}
            cy={GS_Y - 10}
            r="3"
            fill="#3b82f6"
            fillOpacity="0.4"
            className="animate-pulse"
          />
        </g>
        <text
          x={GS_X}
          y={GS_Y + 24}
          textAnchor="middle"
          className="fill-blue-400 font-mono"
          style={{ fontSize: "9px", letterSpacing: "0.08em" }}
        >
          {groundStation}
        </text>

        {/* ── Probability readout (right side) ── */}
        <text
          x="700"
          y="125"
          textAnchor="middle"
          className="fill-muted-foreground font-mono"
          style={{ fontSize: "9px", letterSpacing: "0.1em" }}
        >
          INTERCEPT PROBABILITY
        </text>
        <text
          x="700"
          y="165"
          textAnchor="middle"
          className={cn(
            "font-mono font-bold",
            prob > 0.5
              ? "fill-red-400"
              : prob > 0.2
                ? "fill-amber-400"
                : "fill-cyan-400",
          )}
          style={{ fontSize: "36px" }}
        >
          {(prob * 100).toFixed(0)}%
        </text>
        <text
          x="700"
          y="185"
          textAnchor="middle"
          className="fill-muted-foreground/60 font-mono"
          style={{ fontSize: "8px" }}
        >
          {prob > 0.5 ? "HIGH RISK" : prob > 0.2 ? "ELEVATED" : "LOW"}
        </text>
      </svg>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */

export function SignalOps({ threats }: SignalOpsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    threats[0]?.id ?? null,
  )
  const setFocusTarget = useThreatStore((s) => s.setFocusTarget)
  const openAdversaryDetail = useUIStore((s) => s.openAdversaryDetail)

  // Animated probability from the visual — smoothed for readable display
  const [animatedProb, setAnimatedProb] = useState<number | null>(null)
  const smoothProbRef = useRef(0)
  const handleProbChange = useCallback((rawProb: number) => {
    smoothProbRef.current += (rawProb - smoothProbRef.current) * 0.15
    setAnimatedProb(smoothProbRef.current)
  }, [])

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages])

  // Sorted threats
  const sorted = [...threats].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return a.tcaInMinutes - b.tcaInMinutes
  })

  const selected = sorted.find((t) => t.id === selectedId) ?? sorted[0]

  // Display probability: use animated value if available, otherwise static
  const displayProb = animatedProb ?? selected?.interceptionProbability ?? 0

  const handleSelect = useCallback(
    (threat: SignalThreat) => {
      setSelectedId(threat.id)
      setFocusTarget({
        ...threat.position,
        satelliteId: threat.interceptorId,
      })
    },
    [setFocusTarget],
  )

  // Chat handler
  const handleChatSend = useCallback(() => {
    const msg = chatInput.trim()
    if (!msg || isLoading) return

    setMessages((prev) => [...prev, { role: "user", content: msg }])
    setChatInput("")
    setIsLoading(true)

    ;(async () => {
      try {
        const threat = selected
        const currentProb = Math.round(displayProb * 100)
        const contextPrompt = threat
          ? [
              `You are a signal intelligence analyst for a space domain awareness system.`,
              `You are analyzing a beam interception threat.`,
              ``,
              `THREAT SUMMARY:`,
              `- Hostile interceptor: ${threat.interceptorName}`,
              `- Targeting: ${threat.targetLinkAssetName} downlink to ${threat.groundStationName}`,
              `- Current interception probability: ${currentProb}%`,
              `- Signal path angle: ${threat.signalPathAngleDeg}°`,
              `- Comm windows at risk: ${threat.commWindowsAtRisk} of ${threat.totalCommWindows}`,
              `- Time to closest approach: ${formatTCA(threat.tcaInMinutes)}`,
              `- Assessment confidence: ${(threat.confidence * 100).toFixed(0)}%`,
              `- Threat severity: ${threat.severity}`,
              ``,
              `Answer the operator's question concisely and with actionable recommendations where appropriate.`,
              `Operator question: ${msg}`,
            ].join("\n")
          : msg

        const params = new URLSearchParams({
          norad_id: "0",
          name: threat?.interceptorName ?? "Unknown",
          prompt: contextPrompt,
        })

        const res = await fetch(
          `/api/backend/api/adversary/chat?${params.toString()}`,
          {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: "",
          },
        )

        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Unable to reach the analysis backend (HTTP ${res.status}). Check that the backend server is running.`,
            },
          ])
        } else {
          const data = (await res.json()) as { response: string }
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: data.response },
          ])
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Cannot connect to the analysis backend. Ensure the backend server is running on the expected port.",
          },
        ])
      } finally {
        setIsLoading(false)
      }
    })()
  }, [chatInput, isLoading, selected, displayProb])

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleChatSend()
      }
    },
    [handleChatSend],
  )

  return (
    <div className="grid h-full w-full grid-rows-[340px_1fr] gap-4">
      {/* ═══ TOP: Beam Interception Visual ═══ */}
      <div
        data-ops-panel
        className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg"
      >
        <div className="flex items-center gap-2 border-b border-border/40 px-5 py-2">
          <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
            Beam Interception Monitor
          </h2>
          <p className="ml-2 font-mono text-[10px] text-muted-foreground">
            Live signal path intercept visualization
          </p>
        </div>
        <div className="flex-1">
          <BeamInterceptionVisual
            threat={selected}
            onProbChange={handleProbChange}
          />
        </div>
      </div>

      {/* ═══ BOTTOM: Threat Assessment (left) + Agent Chat (right) ═══ */}
      <div className="grid min-h-0 grid-cols-[1fr_380px] gap-4">
        {/* ── Left: Threat Assessment ── */}
        <div
          data-ops-panel
          className="pointer-events-auto flex flex-col overflow-hidden rounded-l-sm rounded-r-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg"
        >
          {/* Header */}
          <div className="border-b border-border/40 px-5 py-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
                Threat Assessment
              </h2>
            </div>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Likelihood of beam interception from adversary
            </p>
          </div>

          {/* Main probability metric — uses smoothed animated probability */}
          {selected && (
            <div className="border-b border-border/40 p-4">
              <div className="text-center">
                <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Interception Probability
                </div>
                <div
                  className={cn(
                    "font-mono text-4xl font-bold tabular-nums transition-colors duration-500",
                    displayProb > 0.5
                      ? "text-red-400"
                      : displayProb > 0.2
                        ? "text-amber-400"
                        : "text-cyan-400",
                  )}
                >
                  {Math.round(displayProb * 100)}%
                </div>
                <div className="mt-1 font-mono text-[9px] text-muted-foreground/60">
                  {displayProb > 0.5
                    ? "HIGH RISK — beam path compromised"
                    : displayProb > 0.2
                      ? "ELEVATED — adversary in proximity"
                      : "LOW — beam path clear"}
                </div>
                <ProbabilityBar value={displayProb} />
              </div>
            </div>
          )}

          {/* Supporting data + threat selector */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
              {/* Data fields */}
              {selected && (
                <div className="mb-4 space-y-0">
                  <DataRow
                    label="Interceptor"
                    value={selected.interceptorName}
                  />
                  <DataRow
                    label="Target Asset"
                    value={selected.targetLinkAssetName}
                  />
                  <DataRow
                    label="Ground Station"
                    value={selected.groundStationName}
                  />
                  <DataRow
                    label="Signal Path Angle"
                    value={`${selected.signalPathAngleDeg.toFixed(1)}\u00b0`}
                  />
                  <DataRow
                    label="Comm Windows at Risk"
                    value={`${selected.commWindowsAtRisk} / ${selected.totalCommWindows}`}
                    alert={selected.commWindowsAtRisk > 2}
                  />
                  <DataRow
                    label="TCA"
                    value={formatTCA(selected.tcaInMinutes)}
                  />
                  <DataRow
                    label="Confidence"
                    value={`${(selected.confidence * 100).toFixed(0)}%`}
                  />
                </div>
              )}

              {/* Active intercept selector */}
              <div className="border-t border-border/40 pt-3">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Active Intercepts ({sorted.length})
                </span>
                <div className="mt-2 space-y-1">
                  {sorted.map((threat) => (
                    <button
                      key={threat.id}
                      type="button"
                      onClick={() => handleSelect(threat)}
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left transition-all",
                        selectedId === threat.id
                          ? "border-primary/50 bg-primary/10"
                          : "border-transparent hover:bg-secondary/40",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ThreatBadge severity={threat.severity} />
                          <span className="font-mono text-[10px] font-medium text-foreground">
                            {threat.interceptorName}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          {(threat.interceptionProbability * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {threat.targetLinkAssetName} ↔{" "}
                        {threat.groundStationName}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Investigate button */}
              {selected && (
                <button
                  type="button"
                  onClick={() =>
                    openAdversaryDetail(selected.interceptorId)
                  }
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-red-400 transition-all hover:bg-red-500/20"
                >
                  <Target className="h-3.5 w-3.5" />
                  Investigate {selected.interceptorName}
                </button>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── Right: Agent Chat ── */}
        <div
          data-ops-panel
          className="pointer-events-auto flex flex-col overflow-hidden rounded-r-sm rounded-l-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg"
        >
          <div className="flex items-center gap-2.5 border-b border-border/40 px-5 py-3">
            <Bot className="h-4 w-4 text-primary/60" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Signal Intelligence Analyst
            </span>
          </div>

          {/* Messages */}
          <div
            ref={chatScrollRef}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="space-y-2 p-4">
              {messages.length === 0 && (
                <div className="flex gap-3 py-4">
                  <Radio className="mt-0.5 h-5 w-5 shrink-0 text-primary/40" />
                  <div className="font-mono text-[11px] leading-relaxed text-muted-foreground/60">
                    Ask me about signal interception threats, beam
                    vulnerability, or communication link security.
                    {selected && (
                      <>
                        <br />
                        <span className="text-muted-foreground/40">
                          Currently analyzing:{" "}
                          {selected.interceptorName} &rarr;{" "}
                          {selected.targetLinkAssetName}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-2 py-0.5",
                    msg.role === "user" && "justify-end",
                  )}
                >
                  {msg.role === "assistant" && (
                    <Bot className="mt-1 h-4 w-4 shrink-0 text-primary/50" />
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3.5 py-2 font-mono text-[11px] leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary/15 text-foreground"
                        : "bg-secondary/30 text-foreground",
                    )}
                  >
                    {msg.content}
                  </div>
                  {msg.role === "user" && (
                    <User className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40" />
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-2 py-0.5">
                  <Bot className="mt-1 h-4 w-4 shrink-0 text-primary/50" />
                  <div className="rounded-lg bg-secondary/30 px-3.5 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chat input */}
          <div className="border-t border-border/40 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Ask about signal threats..."
                disabled={isLoading}
                className="flex-1 rounded-lg border border-border/60 bg-secondary/30 px-3.5 py-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-40"
              />
              <button
                type="button"
                onClick={handleChatSend}
                disabled={!chatInput.trim() || isLoading}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  chatInput.trim() && !isLoading
                    ? "bg-primary/20 text-primary hover:bg-primary/30"
                    : "cursor-not-allowed text-muted-foreground/20",
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

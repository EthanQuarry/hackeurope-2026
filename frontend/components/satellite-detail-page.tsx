"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import {
  ArrowLeft,
  AlertTriangle,
  Radio,
  Activity,
  Send,
  Loader2,
  Bot,
  User,
  CheckCircle2,
  X,
  Satellite,
  Orbit,
  Compass,
  Zap,
  ShieldAlert,
  Check,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { THREAT_COLORS } from "@/lib/constants"
import { MOCK_SATELLITES } from "@/lib/mock-data"
import { useUIStore } from "@/stores/ui-store"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import { useCommsStore } from "@/stores/comms-store"
import { useCommsStream } from "@/hooks/use-comms-stream"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { api } from "@/lib/api"
import type {
  ProximityThreat,
  SignalThreat,
  AnomalyThreat,
  CommsChatMessage,
  CommsChatResponse,
  ParsedIntent,
  SatelliteData,
  CommsStage,
} from "@/types"

/* ═══════════════════════════════════════════════════════
   Types & command-builder constants
   ═══════════════════════════════════════════════════════ */

type Phase = "idle" | "approve" | "confirm" | "translating"

const COMMAND_TYPES = [
  { id: "orbit_adjust", label: "Orbit Adjust", icon: Orbit, desc: "Collision avoidance" },
  { id: "attitude_control", label: "Attitude", icon: Compass, desc: "Orientation" },
  { id: "telemetry_request", label: "Telemetry", icon: Activity, desc: "Status data" },
  { id: "power_management", label: "Power", icon: Zap, desc: "Power systems" },
  { id: "comm_relay_config", label: "Comms", icon: Radio, desc: "Relay config" },
  { id: "emergency_safe_mode", label: "Emergency", icon: ShieldAlert, desc: "Safe mode", emergency: true },
] as const

type CommandTypeId = (typeof COMMAND_TYPES)[number]["id"]
type Urgency = "normal" | "urgent" | "emergency"

interface FieldDef {
  key: string; label: string; type: "select" | "number" | "text"
  options?: string[]; defaultValue?: string | number; placeholder?: string
}

const PARAM_FIELDS: Record<string, FieldDef[]> = {
  orbit_adjust: [
    { key: "reason", label: "Reason", type: "select", options: ["collision_avoidance", "station_keeping", "orbit_raise", "orbit_lower", "deorbit"], defaultValue: "collision_avoidance" },
    { key: "delta_v", label: "Delta-V (m/s)", type: "number", defaultValue: 0.1 },
    { key: "burn_direction", label: "Direction", type: "select", options: ["prograde", "retrograde", "radial_in", "radial_out", "normal", "anti-normal"], defaultValue: "retrograde" },
    { key: "reference_threat", label: "Threat Ref", type: "text", placeholder: "e.g. SJ-26" },
  ],
  attitude_control: [
    { key: "target_orientation", label: "Orientation", type: "select", options: ["nadir_pointing", "sun_pointing", "target_tracking", "inertial_hold"], defaultValue: "nadir_pointing" },
    { key: "rotation_rate", label: "Rate (deg/s)", type: "number", defaultValue: 0.5 },
  ],
  telemetry_request: [
    { key: "telemetry_type", label: "Type", type: "select", options: ["full_status", "power_only", "thermal_only", "comms_only", "propulsion_only"], defaultValue: "full_status" },
  ],
  power_management: [
    { key: "action", label: "Action", type: "select", options: ["solar_panel_deploy", "solar_panel_stow", "battery_conditioning", "power_save_mode", "full_power"], defaultValue: "full_power" },
  ],
  comm_relay_config: [
    { key: "action", label: "Action", type: "select", options: ["enable_transponder", "disable_transponder", "change_frequency", "adjust_power"], defaultValue: "enable_transponder" },
    { key: "band", label: "Band", type: "select", options: ["S-band", "X-band", "Ka-band", "UHF"], defaultValue: "S-band" },
  ],
  emergency_safe_mode: [],
}

function buildCommandText(sat: SatelliteData, cmdType: string, params: Record<string, string | number>, urgency: Urgency): string {
  const label = cmdType.replace(/_/g, " ")
  let t = `Execute ${label} on ${sat.name}`
  switch (cmdType) {
    case "orbit_adjust":
      t += ` — ${params.delta_v ?? 0.1} m/s ${String(params.burn_direction ?? "retrograde").replace(/_/g, " ")} burn`
      if (params.reason) t += ` for ${String(params.reason).replace(/_/g, " ")}`
      if (params.reference_threat) t += ` to avoid ${params.reference_threat}`
      break
    case "attitude_control":
      t += ` — rotate to ${String(params.target_orientation ?? "nadir_pointing").replace(/_/g, " ")}`
      if (params.rotation_rate) t += ` at ${params.rotation_rate} deg/s`
      break
    case "telemetry_request":
      t += ` — request ${String(params.telemetry_type ?? "full_status").replace(/_/g, " ")} report`
      break
    case "power_management":
      t += ` — ${String(params.action ?? "full_power").replace(/_/g, " ")}`
      break
    case "comm_relay_config":
      t += ` — ${String(params.action ?? "enable_transponder").replace(/_/g, " ")}`
      if (params.band) t += ` on ${params.band}`
      break
    case "emergency_safe_mode":
      t += ` — activate emergency safe mode immediately`
      break
  }
  if (urgency !== "normal") t += `. Urgency: ${urgency}`
  return t + "."
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function getOrbitType(inclination: number): string {
  if (inclination > 96 && inclination < 99) return "SSO"
  if (inclination > 80 && inclination < 100) return "Polar"
  if (inclination < 10) return "Equatorial"
  return "LEO"
}

function formatTCA(minutes: number): string {
  if (minutes < 60) return `T-${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `T-${h}h ${m}m` : `T-${h}h`
}

function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${km.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} km`
}

function buildSatelliteContext(
  satellite: SatelliteData,
  threats: { proximity: ProximityThreat[]; signal: SignalThreat[]; anomaly: AnomalyThreat[] },
): string {
  let ctx = `You are an AI assistant for satellite operations. The operator is viewing ${satellite.name} (NORAD ${satellite.noradId}).`
  ctx += ` Orbital: alt ${satellite.altitude_km.toFixed(0)}km, vel ${satellite.velocity_kms.toFixed(2)} km/s, inc ${satellite.inclination_deg.toFixed(1)}°, period ${satellite.period_min.toFixed(1)}min.`
  ctx += ` Health: power ${satellite.health.power}%, comms ${satellite.health.comms}%, propellant ${satellite.health.propellant}%.`
  ctx += ` Status: ${satellite.status}.`
  const total = threats.proximity.length + threats.signal.length + threats.anomaly.length
  if (total > 0) {
    ctx += ` Active threats (${total}):`
    for (const pt of threats.proximity) {
      ctx += ` Proximity — ${pt.foreignSatName}, miss ${pt.missDistanceKm.toFixed(1)}km, TCA ${pt.tcaInMinutes}min, ${pt.approachPattern}.`
    }
    for (const st of threats.signal) {
      ctx += ` Signal — ${st.interceptorName}, ${(st.interceptionProbability * 100).toFixed(0)}% intercept, ${st.commWindowsAtRisk}/${st.totalCommWindows} windows.`
    }
    for (const at of threats.anomaly) {
      ctx += ` Anomaly — ${at.anomalyType}, ${(at.baselineDeviation * 100).toFixed(0)}% deviation.`
    }
  }
  return ctx
}

/* ═══════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════ */

function MetricBox({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-secondary/20 px-3 py-2">
      <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
        {value}
        {unit && <span className="ml-1 font-mono text-[9px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}

function HealthBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "#00e676" : value >= 40 ? "#ff9100" : "#ff1744"
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 font-mono text-[10px] capitalize text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">{value}%</span>
    </div>
  )
}

function CmdRow({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className={cn("font-mono text-[8px] text-right", alert ? "text-amber-400 font-semibold" : "text-foreground")}>{value}</span>
    </div>
  )
}

/* ── Compact Transcription Stage Indicator ── */

const STAGE_LIST: { id: CommsStage; label: string }[] = [
  { id: "human_input", label: "Human Input" },
  { id: "parsed_intent", label: "Parsed Intent" },
  { id: "at_commands", label: "AT Commands" },
  { id: "sbd_payload", label: "SBD Payload" },
  { id: "gateway_routing", label: "Gateway Routing" },
]

function TranscriptionStages() {
  const { isStreaming, humanInput, parsedIntent, atCommands, sbdPayload, gatewayRouting, error } = useCommsStore()
  const hasData = humanInput || parsedIntent || atCommands || sbdPayload || gatewayRouting
  if (!hasData && !error) return null

  const done = [!!humanInput, !!parsedIntent, !!atCommands, !!sbdPayload, !!gatewayRouting]
  const activeIdx = done.indexOf(false)

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("h-1.5 w-1.5 rounded-full", isStreaming ? "bg-cyan-400 animate-pulse" : "bg-emerald-400")} />
        <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
          {isStreaming ? "Translating to Iridium SBD..." : "Translation Complete"}
        </span>
      </div>
      {STAGE_LIST.map((s, i) => {
        const isActive = isStreaming && i === activeIdx
        const isPending = !done[i] && !isActive
        return (
          <div key={s.id} className={cn(
            "flex items-center gap-2 rounded border px-2.5 py-1",
            done[i] && "border-border/30 bg-secondary/10",
            isActive && "border-primary/40 bg-primary/5",
            isPending && "border-border/20 opacity-40",
          )}>
            <span className="font-mono text-[8px] text-muted-foreground w-3">{i + 1}.</span>
            <span className={cn("flex-1 font-mono text-[9px]", isPending ? "text-muted-foreground/50" : "text-foreground")}>{s.label}</span>
            {done[i] && <Check className="h-2.5 w-2.5 text-emerald-400" />}
            {isActive && <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />}
          </div>
        )
      })}
      {error && (
        <div className="mt-1 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1">
          <span className="font-mono text-[9px] text-red-400">{error}</span>
        </div>
      )}
    </div>
  )
}

/* ── Threat Cards ── */

function ProximityThreatCard({ threat }: { threat: ProximityThreat }) {
  return (
    <div className="rounded-md border border-border/30 bg-secondary/10 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-[10px] font-medium text-foreground">{threat.foreignSatName}</span>
        </div>
        <ThreatBadge severity={threat.severity} />
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <span className={cn("font-mono text-[9px] tabular-nums", threat.missDistanceKm < 5 ? "font-semibold text-red-400" : "text-muted-foreground")}>
          {formatDistance(threat.missDistanceKm)}
        </span>
        <span className="font-mono text-[9px] tabular-nums text-muted-foreground">{formatTCA(threat.tcaInMinutes)}</span>
        <span className="font-mono text-[8px] uppercase text-muted-foreground">{threat.approachPattern}</span>
        {threat.sunHidingDetected && (
          <span className="rounded bg-red-500/20 px-1 py-0.5 font-mono text-[8px] font-bold uppercase text-red-400">SUN-HIDE</span>
        )}
      </div>
    </div>
  )
}

function SignalThreatCard({ threat }: { threat: SignalThreat }) {
  return (
    <div className="rounded-md border border-border/30 bg-secondary/10 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-[10px] font-medium text-foreground">{threat.interceptorName}</span>
        </div>
        <ThreatBadge severity={threat.severity} />
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <span className={cn("font-mono text-[9px] tabular-nums", threat.interceptionProbability > 0.5 ? "font-semibold text-red-400" : "text-muted-foreground")}>
          {(threat.interceptionProbability * 100).toFixed(0)}% intercept
        </span>
        <span className="font-mono text-[9px] tabular-nums text-muted-foreground">{threat.commWindowsAtRisk}/{threat.totalCommWindows} windows</span>
        <span className="font-mono text-[9px] text-muted-foreground">{threat.groundStationName}</span>
      </div>
    </div>
  )
}

function AnomalyThreatCard({ threat }: { threat: AnomalyThreat }) {
  return (
    <div className="rounded-md border border-border/30 bg-secondary/10 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-[10px] font-medium text-foreground">{threat.satelliteName}</span>
        </div>
        <ThreatBadge severity={threat.severity} />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="rounded bg-secondary/50 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase text-muted-foreground">{threat.anomalyType.replace(/-/g, " ")}</span>
        <span className="font-mono text-[9px] tabular-nums text-muted-foreground">{(threat.baselineDeviation * 100).toFixed(0)}% deviation</span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main Component — 3-column mission hub
   ═══════════════════════════════════════════════════════ */

export function SatelliteDetailPage() {
  const setActiveView = useUIStore((s) => s.setActiveView)

  /* ── Fleet ── */
  const selectedId = useFleetStore((s) => s.selectedSatelliteId)
  const storeSats = useFleetStore((s) => s.satellites)
  const satellites = storeSats.length > 0 ? storeSats : MOCK_SATELLITES
  const satellite = satellites.find((s) => s.id === selectedId)

  /* ── Threats filtered for this satellite ── */
  const allProximity = useThreatStore((s) => s.proximityThreats)
  const allSignal = useThreatStore((s) => s.signalThreats)
  const allAnomaly = useThreatStore((s) => s.anomalyThreats)

  const proximityThreats = useMemo(
    () => allProximity.filter((t) => t.targetAssetId === selectedId || t.foreignSatId === selectedId),
    [allProximity, selectedId],
  )
  const signalThreats = useMemo(
    () => allSignal.filter((t) => t.targetLinkAssetId === selectedId),
    [allSignal, selectedId],
  )
  const anomalyThreats = useMemo(
    () => allAnomaly.filter((t) => t.satelliteId === selectedId),
    [allAnomaly, selectedId],
  )
  const totalThreats = proximityThreats.length + signalThreats.length + anomalyThreats.length

  /* ── Comms ── */
  const { sendCommand } = useCommsStream()
  const isStreaming = useCommsStore((s) => s.isStreaming)
  const commsHistory = useCommsStore((s) => s.history)

  const satHistory = useMemo(
    () => commsHistory.filter((h) => h.parsed_intent?.target_satellite_id === selectedId),
    [commsHistory, selectedId],
  )

  /* ── Command builder state ── */
  const [phase, setPhase] = useState<Phase>("idle")
  const [pendingIntent, setPendingIntent] = useState<ParsedIntent | null>(null)
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [cmdType, setCmdType] = useState<CommandTypeId | null>(null)
  const [params, setParams] = useState<Record<string, string | number>>({})
  const [urgency, setUrgency] = useState<Urgency>("normal")

  /* ── AI chat state ── */
  const [chatMessages, setChatMessages] = useState<CommsChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  /* ── Effects ── */
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" })
  }, [chatMessages, phase])

  useEffect(() => {
    if (!isStreaming && phase === "translating") setPhase("idle")
  }, [isStreaming, phase])

  /* ── Command builder handlers ── */
  const handleCmdTypeChange = useCallback((id: CommandTypeId) => {
    setCmdType(id)
    const defs: Record<string, string | number> = {}
    for (const f of (PARAM_FIELDS[id] ?? [])) {
      if (f.defaultValue !== undefined) defs[f.key] = f.defaultValue
    }
    setParams(defs)
    if (id === "emergency_safe_mode") setUrgency("emergency")
  }, [])

  const previewText = useMemo(() => {
    if (!satellite || !cmdType) return null
    return buildCommandText(satellite, cmdType, params, urgency)
  }, [satellite, cmdType, params, urgency])

  const handleBuilderSubmit = useCallback(() => {
    if (!previewText || !satellite || !cmdType || phase !== "idle") return
    setPendingText(previewText)
    setPendingIntent({
      command_type: cmdType,
      target_satellite_id: selectedId!,
      target_satellite_name: satellite.name,
      parameters: params,
      urgency,
      summary: previewText,
    })
    setPhase("approve")
  }, [previewText, satellite, cmdType, selectedId, params, urgency, phase])

  /* ── AI chat handlers ── */
  const handleChatSend = useCallback(async () => {
    const msg = chatInput.trim()
    if (!msg || chatLoading || phase !== "idle" || !satellite) return

    const context = buildSatelliteContext(satellite, {
      proximity: proximityThreats,
      signal: signalThreats,
      anomaly: anomalyThreats,
    })

    const newMsgs: CommsChatMessage[] = [...chatMessages, { role: "user", content: msg }]
    setChatMessages(newMsgs)
    setChatInput("")
    setChatLoading(true)

    // Inject satellite context so the AI knows what we're looking at
    const apiMessages: CommsChatMessage[] = [
      { role: "user", content: `[Context: ${context}]` },
      { role: "assistant", content: `I'm ready to help with ${satellite.name}. What would you like to know?` },
      ...newMsgs,
    ]

    try {
      const res = await fetch(api.commsChat, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: CommsChatResponse = await res.json()
      setChatMessages((p) => [...p, { role: "assistant", content: data.reply }])
      if (data.command_ready && data.parsed_intent) {
        setPendingIntent(data.parsed_intent)
        setPendingText(data.parsed_intent.summary)
        setPhase("approve")
      }
    } catch {
      setChatMessages((p) => [...p, { role: "assistant", content: "I can help with this satellite. Try asking about its status, threats, or what commands to send." }])
    } finally {
      setChatLoading(false)
    }
  }, [chatInput, chatLoading, phase, satellite, chatMessages, proximityThreats, signalThreats, anomalyThreats])

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend() } },
    [handleChatSend],
  )

  /* ── Shared approval flow ── */
  const handleApprove = useCallback(() => setPhase("confirm"), [])
  const handleReject = useCallback(() => { setPendingIntent(null); setPendingText(null); setPhase("idle") }, [])
  const handleConfirm = useCallback(() => {
    if (!pendingText || !pendingIntent) return
    setPhase("translating")
    sendCommand(pendingText, pendingIntent.target_satellite_id)
  }, [pendingText, pendingIntent, sendCommand])
  const handleCancelConfirm = useCallback(() => setPhase("approve"), [])

  const canBuilderSend = !!satellite && !!cmdType && phase === "idle"

  /* ── Null guard ── */
  if (!satellite) {
    return (
      <div data-ops-panel className="flex h-full w-full items-center justify-center">
        <div className="rounded-xl border border-border/60 bg-card/80 px-8 py-6 backdrop-blur-lg">
          <p className="font-mono text-sm text-muted-foreground">No satellite selected</p>
          <button
            type="button"
            onClick={() => setActiveView("overview")}
            className="mt-3 font-mono text-[10px] text-primary underline underline-offset-2 hover:text-primary/80"
          >
            Return to overview
          </button>
        </div>
      </div>
    )
  }

  const statusColors = THREAT_COLORS[satellite.status]
  const lastPoint = satellite.trajectory[satellite.trajectory.length - 1]

  return (
    <div className="grid h-full w-full grid-cols-[20rem_1fr_20rem] gap-3">

      {/* ═══ COLUMN 1 — Satellite Data ═══ */}
      <div data-ops-panel className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
          <button
            type="button"
            onClick={() => setActiveView("overview")}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <span className="font-mono text-sm font-semibold text-foreground">{satellite.name}</span>
          <span className={cn("rounded-full px-2 py-0.5 font-mono text-[9px] uppercase", statusColors.bg, statusColors.text)}>
            {satellite.status}
          </span>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {/* Orbital Parameters */}
          <div className="border-b border-border/40 p-4">
            <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">Orbital Parameters</div>
            <div className="grid grid-cols-2 gap-2">
              <MetricBox label="Altitude" value={satellite.altitude_km.toFixed(0)} unit="km" />
              <MetricBox label="Velocity" value={satellite.velocity_kms.toFixed(2)} unit="km/s" />
              <MetricBox label="Inclination" value={satellite.inclination_deg.toFixed(1)} unit="deg" />
              <MetricBox label="Period" value={satellite.period_min.toFixed(1)} unit="min" />
            </div>
          </div>

          {/* Current Position */}
          {lastPoint && (
            <div className="border-b border-border/40 px-4 py-3">
              <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">Current Position</div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">Lat</div>
                  <div className="font-mono text-[10px] tabular-nums text-foreground">{lastPoint.lat.toFixed(4)}</div>
                </div>
                <div>
                  <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">Lon</div>
                  <div className="font-mono text-[10px] tabular-nums text-foreground">{lastPoint.lon.toFixed(4)}</div>
                </div>
                <div>
                  <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">Alt</div>
                  <div className="font-mono text-[10px] tabular-nums text-foreground">{lastPoint.alt_km.toFixed(0)} km</div>
                </div>
              </div>
            </div>
          )}

          {/* Health Subsystems */}
          <div className="border-b border-border/40 px-4 py-3">
            <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">Health Subsystems</div>
            <div className="space-y-2">
              {(["power", "comms", "propellant"] as const).map((key) => (
                <HealthBar key={key} label={key} value={satellite.health[key]} />
              ))}
            </div>
          </div>

          {/* Satellite Info */}
          <div className="border-b border-border/40 px-4 py-3">
            <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">Satellite Info</div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">NORAD ID</span>
                <span className="font-mono text-[10px] tabular-nums text-foreground">{satellite.noradId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">Orbit Type</span>
                <span className="font-mono text-[10px] text-foreground">{getOrbitType(satellite.inclination_deg)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">Status</span>
                <ThreatBadge severity={satellite.status} />
              </div>
            </div>
          </div>

          {/* Active Threats */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">Active Threats</span>
              <span className={cn(
                "rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums",
                totalThreats > 0 ? "bg-red-500/15 text-red-400" : "bg-secondary/30 text-muted-foreground",
              )}>
                {totalThreats}
              </span>
            </div>
            {totalThreats === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <AlertTriangle className="mb-2 h-4 w-4 text-muted-foreground/30" />
                <p className="font-mono text-[10px] text-muted-foreground/60">No active threats</p>
              </div>
            ) : (
              <div className="space-y-2">
                {proximityThreats.map((t) => <ProximityThreatCard key={t.id} threat={t} />)}
                {signalThreats.map((t) => <SignalThreatCard key={t.id} threat={t} />)}
                {anomalyThreats.map((t) => <AnomalyThreatCard key={t.id} threat={t} />)}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ═══ COLUMN 2 — Command Centre ═══ */}
      <div data-ops-panel className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">

        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
          <div className={cn("h-1.5 w-1.5 rounded-full", phase === "translating" ? "bg-cyan-400 animate-pulse" : "bg-emerald-400")} />
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground">Command Centre</h2>
          <span className="ml-auto font-mono text-[8px] text-muted-foreground">{satellite.name}</span>
        </div>

        {/* ── Top half: Command Builder ── */}
        <div className="flex flex-col border-b border-border/40" style={{ maxHeight: "50%" }}>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-0">

              {/* Target satellite (locked to current) */}
              <div className="border-b border-border/20 px-3 py-2">
                <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground mb-1">Target</div>
                <div className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: statusColors.hex }} />
                  <span className="flex-1 font-mono text-[9px] font-medium text-foreground truncate">{satellite.name}</span>
                  <span className="font-mono text-[7px] text-muted-foreground">{satellite.altitude_km.toFixed(0)}km</span>
                </div>
              </div>

              {/* Command type — 3×2 grid */}
              <div className="border-b border-border/20 px-3 py-2">
                <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground mb-1">Command</div>
                <div className="grid grid-cols-3 gap-1">
                  {COMMAND_TYPES.map((cmd) => {
                    const Icon = cmd.icon
                    const isSel = cmdType === cmd.id
                    const isEmrg = "emergency" in cmd && cmd.emergency
                    return (
                      <button key={cmd.id} type="button" onClick={() => handleCmdTypeChange(cmd.id)} className={cn(
                        "flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-center transition-all",
                        isSel && !isEmrg && "border-primary/50 bg-primary/10",
                        isSel && isEmrg && "border-red-500/50 bg-red-500/10",
                        !isSel && !isEmrg && "border-border/30 hover:bg-secondary/30",
                        !isSel && isEmrg && "border-red-500/20 hover:bg-red-500/10",
                      )}>
                        <Icon className={cn("h-3 w-3", isSel && !isEmrg && "text-primary", isSel && isEmrg && "text-red-400", !isSel && !isEmrg && "text-muted-foreground", !isSel && isEmrg && "text-red-400/60")} />
                        <span className={cn("font-mono text-[7px] font-medium leading-none", isSel ? (isEmrg ? "text-red-400" : "text-primary") : "text-muted-foreground")}>{cmd.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Parameters (context-sensitive) */}
              {cmdType && (
                <div className="border-b border-border/20 px-3 py-2">
                  <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground mb-1">Parameters</div>
                  {cmdType === "emergency_safe_mode" ? (
                    <div className="flex items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5">
                      <AlertTriangle className="h-3 w-3 shrink-0 text-red-400" />
                      <span className="font-mono text-[8px] text-red-400">All operations will cease.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                      {(PARAM_FIELDS[cmdType] ?? []).map((f) => (
                        <div key={f.key} className={f.type === "text" ? "col-span-2" : ""}>
                          <label className="font-mono text-[6px] uppercase tracking-wider text-muted-foreground">{f.label}</label>
                          {f.type === "select" ? (
                            <select value={String(params[f.key] ?? f.defaultValue ?? "")} onChange={(e) => setParams((p) => ({ ...p, [f.key]: e.target.value }))} className="mt-0.5 w-full rounded border border-border/60 bg-secondary/30 px-1.5 py-0.5 font-mono text-[8px] text-foreground outline-none focus:ring-1 focus:ring-primary/50 [&>option]:bg-card">
                              {f.options?.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                            </select>
                          ) : f.type === "number" ? (
                            <input type="number" step="any" value={params[f.key] ?? f.defaultValue ?? ""} onChange={(e) => setParams((p) => ({ ...p, [f.key]: parseFloat(e.target.value) || 0 }))} className="mt-0.5 w-full rounded border border-border/60 bg-secondary/30 px-1.5 py-0.5 font-mono text-[8px] text-foreground outline-none focus:ring-1 focus:ring-primary/50" />
                          ) : (
                            <input type="text" value={String(params[f.key] ?? "")} onChange={(e) => setParams((p) => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="mt-0.5 w-full rounded border border-border/60 bg-secondary/30 px-1.5 py-0.5 font-mono text-[8px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/50" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Urgency + Transmit */}
              {cmdType && (
                <div className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5 flex-1">
                      {(["normal", "urgent", "emergency"] as const).map((u) => (
                        <button key={u} type="button" onClick={() => setUrgency(u)} className={cn(
                          "flex-1 rounded-full py-0.5 font-mono text-[7px] uppercase tracking-wider transition-all",
                          urgency === u && u === "normal" && "bg-primary/20 text-primary",
                          urgency === u && u === "urgent" && "bg-amber-500/20 text-amber-400",
                          urgency === u && u === "emergency" && "bg-red-500/20 text-red-400",
                          urgency !== u && "text-muted-foreground/40 hover:bg-secondary/30",
                        )}>{u}</button>
                      ))}
                    </div>
                    <button type="button" onClick={handleBuilderSubmit} disabled={!canBuilderSend} className={cn(
                      "flex items-center gap-1.5 rounded-md border px-3 py-1 font-mono text-[8px] font-semibold uppercase tracking-wider transition-all",
                      canBuilderSend ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25" : "border-border/30 text-muted-foreground/30 cursor-not-allowed",
                    )}>
                      <Send className="h-2.5 w-2.5" /> Transmit
                    </button>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── Bottom half: Approval → Transcription / History ── */}
        <div className="flex min-h-0 flex-1 flex-col">

          {/* Approval card */}
          {phase === "approve" && pendingIntent && (
            <div className="border-b border-border/40 p-3">
              <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                  <span className="font-mono text-[8px] font-semibold uppercase tracking-wider text-primary">Proposed Command</span>
                </div>
                <div className="space-y-0.5 mb-2">
                  <CmdRow label="Target" value={pendingIntent.target_satellite_name} />
                  <CmdRow label="Type" value={pendingIntent.command_type.replace(/_/g, " ").toUpperCase()} />
                  <CmdRow label="Urgency" value={pendingIntent.urgency.toUpperCase()} alert={pendingIntent.urgency !== "normal"} />
                </div>
                <div className="font-mono text-[8px] text-foreground/70 italic mb-2">{pendingIntent.summary}</div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={handleApprove} className="flex-1 flex items-center justify-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/15 px-2 py-1.5 font-mono text-[8px] font-semibold uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/25">
                    <CheckCircle2 className="h-2.5 w-2.5" />Approve
                  </button>
                  <button type="button" onClick={handleReject} className="flex items-center justify-center gap-1 rounded border border-border/40 bg-secondary/20 px-2 py-1.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground hover:bg-secondary/40">
                    <X className="h-2.5 w-2.5" />Modify
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Confirmation card */}
          {phase === "confirm" && pendingIntent && (
            <div className="border-b border-border/40 p-3">
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                  <span className="font-mono text-[8px] font-semibold uppercase tracking-wider text-amber-400">Confirm Transmission</span>
                </div>
                <p className="font-mono text-[8px] text-foreground/70 mb-1">Transmit via Iridium SBD to:</p>
                <p className="font-mono text-[9px] font-semibold text-foreground mb-2">{pendingIntent.target_satellite_name}</p>
                <div className="flex gap-1.5">
                  <button type="button" onClick={handleConfirm} className="flex-1 flex items-center justify-center gap-1 rounded border border-amber-500/50 bg-amber-500/20 px-2 py-1.5 font-mono text-[8px] font-semibold uppercase tracking-wider text-amber-400 hover:bg-amber-500/30">
                    <Send className="h-2.5 w-2.5" />Confirm
                  </button>
                  <button type="button" onClick={handleCancelConfirm} className="flex items-center justify-center gap-1 rounded border border-border/40 bg-secondary/20 px-2 py-1.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground hover:bg-secondary/40">Back</button>
                </div>
              </div>
            </div>
          )}

          {/* Transcription (when streaming) or Command History (when idle) */}
          {isStreaming ? (
            <>
              <div className="border-b border-border/40 px-4 py-2">
                <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">Protocol Transcription</span>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-3">
                  <TranscriptionStages />
                </div>
              </ScrollArea>
            </>
          ) : (
            <>
              <div className="border-b border-border/40 px-4 py-2">
                <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">Command History</span>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-2 p-3">
                  {satHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <Send className="mb-2 h-4 w-4 text-muted-foreground/30" />
                      <p className="font-mono text-[10px] text-muted-foreground/60">No commands sent to {satellite.name}</p>
                    </div>
                  ) : (
                    satHistory.map((entry) => (
                      <div key={entry.transcription_id} className="rounded-md border border-border/30 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <p className="font-mono text-[10px] text-foreground line-clamp-1">{entry.human_input}</p>
                          <span className="ml-2 shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          {entry.parsed_intent && (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase text-primary">
                              {entry.parsed_intent.command_type}
                            </span>
                          )}
                          {entry.gateway_routing && (
                            <span className="font-mono text-[9px] text-muted-foreground">
                              via {entry.gateway_routing.selected_gateway.name}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </div>

      {/* ═══ COLUMN 3 — AI Assistant ═══ */}
      <div data-ops-panel className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">

        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
          <Bot className="h-3 w-3 text-primary/60" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">AI Assistant</span>
        </div>

        {/* Chat messages */}
        <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-1 p-2.5">

            {/* Empty-state placeholder */}
            {chatMessages.length === 0 && (
              <div className="flex gap-2 px-1 py-3">
                <Satellite className="h-3.5 w-3.5 shrink-0 text-primary/40 mt-0.5" />
                <div className="font-mono text-[9px] text-muted-foreground/60 leading-relaxed">
                  Ask me about {satellite.name}&apos;s status, threats, or what commands to send.
                  <br />
                  <span className="text-muted-foreground/40">e.g. &ldquo;What threats are active?&rdquo;</span>
                </div>
              </div>
            )}

            {/* Message bubbles */}
            {chatMessages.map((msg, i) => (
              <div key={i} className={cn("flex gap-1.5 px-1 py-0.5", msg.role === "user" && "justify-end")}>
                {msg.role === "assistant" && <Bot className="h-3 w-3 shrink-0 text-primary/50 mt-0.5" />}
                <div className={cn(
                  "max-w-[85%] rounded-md px-2.5 py-1.5 font-mono text-[9px] leading-relaxed",
                  msg.role === "user" ? "bg-primary/15 text-foreground" : "bg-secondary/30 text-foreground",
                )}>
                  {msg.content}
                </div>
                {msg.role === "user" && <User className="h-3 w-3 shrink-0 text-muted-foreground/40 mt-0.5" />}
              </div>
            ))}

            {/* Loading indicator */}
            {chatLoading && (
              <div className="flex gap-1.5 px-1 py-0.5">
                <Bot className="h-3 w-3 shrink-0 text-primary/50 mt-0.5" />
                <div className="rounded-md bg-secondary/30 px-2.5 py-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat input — pinned at bottom */}
        <div className="border-t border-border/40 px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder={phase === "idle" ? `Ask about ${satellite.name}...` : "Waiting..."}
              disabled={phase !== "idle" || chatLoading}
              className="flex-1 rounded border border-border/60 bg-secondary/30 px-2.5 py-1 font-mono text-[9px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={handleChatSend}
              disabled={!chatInput.trim() || phase !== "idle" || chatLoading}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded transition-colors",
                chatInput.trim() && phase === "idle" && !chatLoading
                  ? "bg-primary/20 text-primary hover:bg-primary/30"
                  : "text-muted-foreground/20 cursor-not-allowed",
              )}
            >
              {chatLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

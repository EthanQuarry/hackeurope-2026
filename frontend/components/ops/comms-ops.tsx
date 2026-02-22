"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import {
  Send,
  Loader2,
  User,
  Bot,
  CheckCircle2,
  AlertTriangle,
  Satellite,
  X,
  Orbit,
  Compass,
  Activity,
  Zap,
  Radio,
  ShieldAlert,
  Search,
  ChevronDown,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { THREAT_COLORS } from "@/lib/constants"
import { useCommsStore } from "@/stores/comms-store"
import { useFleetStore } from "@/stores/fleet-store"
import { useCommsStream } from "@/hooks/use-comms-stream"
import { CommsTranscriptionView } from "@/components/ops/comms-transcription-view"
import { ThreatResponseView } from "@/components/ops/threat-response-view"
import { useResponseStore } from "@/stores/response-store"
import { api } from "@/lib/api"
import { MOCK_SATELLITES } from "@/lib/mock-data"
import type { CommsChatMessage, CommsChatResponse, ParsedIntent, SatelliteData } from "@/types"

/* ═══════════════════════════════════════════════════════ */

type Phase = "idle" | "approve" | "confirm" | "translating"

const COMMAND_TYPES = [
  { id: "orbit_adjust", label: "Orbit Adjust", icon: Orbit },
  { id: "attitude_control", label: "Attitude", icon: Compass },
  { id: "telemetry_request", label: "Telemetry", icon: Activity },
  { id: "power_management", label: "Power", icon: Zap },
  { id: "comm_relay_config", label: "Comms", icon: Radio },
  { id: "emergency_safe_mode", label: "Emergency", icon: ShieldAlert, emergency: true },
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
   Satellite Selector
   ═══════════════════════════════════════════════════════ */

function SatSelector({ satellites, selectedId, onSelect }: { satellites: SatelliteData[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const sel = satellites.find((s) => s.id === selectedId)
  const filtered = useMemo(() => { const lc = q.toLowerCase(); return q ? satellites.filter((s) => s.name.toLowerCase().includes(lc) || s.id.includes(lc) || String(s.noradId).includes(lc)) : satellites }, [q, satellites])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className={cn("flex w-full items-center gap-2.5 rounded-lg border px-4 py-2.5 text-left transition-colors", sel ? "border-border/60 bg-secondary/30" : "border-dashed border-border/40 bg-secondary/10")}>
        {sel ? (<><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: THREAT_COLORS[sel.status]?.hex ?? "#888" }} /><span className="flex-1 font-mono text-xs font-medium text-foreground truncate">{sel.name}</span><span className="font-mono text-[10px] text-muted-foreground">{sel.altitude_km.toFixed(0)} km</span></>) : (<><Search className="h-4 w-4 text-muted-foreground/50" /><span className="flex-1 font-mono text-[11px] text-muted-foreground/50">Select satellite...</span></>)}
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/50 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border/60 bg-card/95 shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2"><Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" /><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="flex-1 bg-transparent font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none" autoFocus />{q && <button type="button" onClick={() => setQ("")}><X className="h-3.5 w-3.5 text-muted-foreground/50" /></button>}</div>
          <div className="max-h-[180px] overflow-y-auto">
            {filtered.length === 0 ? <div className="px-4 py-3 text-center font-mono text-[11px] text-muted-foreground/50">No results</div> : filtered.map((s) => (
              <button key={s.id} type="button" onClick={() => { onSelect(s.id); setQ(""); setOpen(false) }} className={cn("flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-secondary/40", selectedId === s.id && "bg-primary/10")}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: THREAT_COLORS[s.status]?.hex ?? "#888" }} />
                <span className="flex-1 font-mono text-[11px] font-medium text-foreground truncate">{s.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{s.altitude_km.toFixed(0)} km</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */

export function CommsOps() {
  const { sendCommand } = useCommsStream()
  const isStreaming = useCommsStore((s) => s.isStreaming)
  const history = useCommsStore((s) => s.history)
  const selectedSatelliteId = useFleetStore((s) => s.selectedSatelliteId)
  const storeSats = useFleetStore((s) => s.satellites)
  const satellites = storeSats.length > 0 ? storeSats : MOCK_SATELLITES

  const [phase, setPhase] = useState<Phase>("idle")
  const [pendingIntent, setPendingIntent] = useState<ParsedIntent | null>(null)
  const [pendingText, setPendingText] = useState<string | null>(null)

  const [targetSatId, setTargetSatId] = useState<string | null>(selectedSatelliteId)
  const [cmdType, setCmdType] = useState<CommandTypeId | null>(null)
  const [params, setParams] = useState<Record<string, string | number>>({})
  const [urgency, setUrgency] = useState<Urgency>("normal")

  const [messages, setMessages] = useState<CommsChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (selectedSatelliteId) setTargetSatId(selectedSatelliteId) }, [selectedSatelliteId])
  useEffect(() => { chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" }) }, [messages, phase])
  useEffect(() => { if (!isStreaming && phase === "translating") setPhase("idle") }, [isStreaming, phase])

  const targetSat = satellites.find((s) => s.id === targetSatId)

  const handleCmdTypeChange = useCallback((id: CommandTypeId) => {
    setCmdType(id)
    const defs: Record<string, string | number> = {}
    for (const f of (PARAM_FIELDS[id] ?? [])) { if (f.defaultValue !== undefined) defs[f.key] = f.defaultValue }
    setParams(defs)
    if (id === "emergency_safe_mode") setUrgency("emergency")
  }, [])

  const previewText = useMemo(() => {
    if (!targetSat || !cmdType) return null
    return buildCommandText(targetSat, cmdType, params, urgency)
  }, [targetSat, cmdType, params, urgency])

  const handleBuilderSubmit = useCallback(() => {
    if (!previewText || !targetSat || !cmdType || phase !== "idle") return
    setPendingText(previewText)
    setPendingIntent({ command_type: cmdType, target_satellite_id: targetSatId!, target_satellite_name: targetSat.name, parameters: params, urgency, summary: previewText })
    setPhase("approve")
  }, [previewText, targetSat, cmdType, targetSatId, params, urgency, phase])

  const handleChatSend = useCallback(async () => {
    const msg = chatInput.trim()
    if (!msg || isLoading || phase !== "idle") return
    const newMsgs: CommsChatMessage[] = [...messages, { role: "user", content: msg }]
    setMessages(newMsgs); setChatInput(""); setIsLoading(true)
    try {
      const res = await fetch(api.commsChat, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: newMsgs }) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: CommsChatResponse = await res.json()
      setMessages((p) => [...p, { role: "assistant", content: data.reply }])
      if (data.command_ready && data.parsed_intent) {
        setPendingIntent(data.parsed_intent); setPendingText(data.parsed_intent.summary); setPhase("approve")
      }
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: "Tell me which satellite and what action. E.g. \"Move USA-245 away from SJ-26\"." }])
    } finally { setIsLoading(false) }
  }, [chatInput, isLoading, messages, phase])

  const handleChatKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend() } }, [handleChatSend])

  const handleApprove = useCallback(() => setPhase("confirm"), [])
  const handleReject = useCallback(() => { setPendingIntent(null); setPendingText(null); setPhase("idle") }, [])
  const handleConfirm = useCallback(() => { if (!pendingText || !pendingIntent) return; setPhase("translating"); sendCommand(pendingText, pendingIntent.target_satellite_id) }, [pendingText, pendingIntent, sendCommand])
  const handleCancelConfirm = useCallback(() => setPhase("approve"), [])

  const responseIsOpen = useResponseStore((s) => s.isOpen)

  const canBuilderSend = !!targetSat && !!cmdType && phase === "idle"

  return (
    <div className="grid h-full w-full grid-cols-2 gap-4">
      {/* ═══ LEFT PANEL ═══ */}
      <div data-ops-panel className="pointer-events-auto flex flex-col overflow-hidden rounded-l-sm rounded-r-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">

        {/* ──────── TOP: Command Builder ──────── */}
        <div className="flex flex-col border-b border-border/40" style={{ height: "55%" }}>
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border/40 px-5 py-2.5">
            <div className={cn("h-2 w-2 rounded-full", phase === "translating" ? "bg-cyan-400 animate-pulse" : "bg-emerald-400")} />
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-foreground">Command Builder</h2>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div>
              {/* Target */}
              <div className="border-b border-border/20 px-5 py-3">
                <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-2">Target</div>
                <SatSelector satellites={satellites} selectedId={targetSatId} onSelect={setTargetSatId} />
              </div>

              {/* Command type — 3×2 grid with LARGE icons */}
              <div className="border-b border-border/20 px-5 py-3">
                <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-3">Command</div>
                <div className="grid grid-cols-3 gap-2">
                  {COMMAND_TYPES.map((cmd) => {
                    const Icon = cmd.icon
                    const isSel = cmdType === cmd.id
                    const isEmrg = "emergency" in cmd && cmd.emergency
                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        onClick={() => handleCmdTypeChange(cmd.id)}
                        className={cn(
                          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 px-2 py-4 text-center transition-all",
                          isSel && !isEmrg && "border-primary/60 bg-primary/10",
                          isSel && isEmrg && "border-red-500/60 bg-red-500/10",
                          !isSel && !isEmrg && "border-border/30 bg-secondary/5 hover:bg-secondary/20 hover:border-border/50",
                          !isSel && isEmrg && "border-red-500/20 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/40",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-8 w-8",
                            isSel && !isEmrg && "text-primary",
                            isSel && isEmrg && "text-red-400",
                            !isSel && !isEmrg && "text-muted-foreground/70",
                            !isSel && isEmrg && "text-red-400/60",
                          )}
                          strokeWidth={1.5}
                        />
                        <span
                          className={cn(
                            "font-mono text-[10px] font-medium leading-none",
                            isSel ? (isEmrg ? "text-red-400" : "text-primary") : "text-muted-foreground",
                          )}
                        >
                          {cmd.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Parameters */}
              {cmdType && (
                <div className="border-b border-border/20 px-5 py-3">
                  <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-2">Parameters</div>
                  {cmdType === "emergency_safe_mode" ? (
                    <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
                      <span className="font-mono text-[11px] text-red-400">All operations will cease.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                      {(PARAM_FIELDS[cmdType] ?? []).map((f) => (
                        <div key={f.key} className={f.type === "text" ? "col-span-2" : ""}>
                          <label className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">{f.label}</label>
                          {f.type === "select" ? (
                            <select value={String(params[f.key] ?? f.defaultValue ?? "")} onChange={(e) => setParams((p) => ({ ...p, [f.key]: e.target.value }))} className="mt-1 w-full rounded-lg border border-border/60 bg-secondary/30 px-3 py-1.5 font-mono text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/50 [&>option]:bg-card">{f.options?.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}</select>
                          ) : f.type === "number" ? (
                            <input type="number" step="any" value={params[f.key] ?? f.defaultValue ?? ""} onChange={(e) => setParams((p) => ({ ...p, [f.key]: parseFloat(e.target.value) || 0 }))} className="mt-1 w-full rounded-lg border border-border/60 bg-secondary/30 px-3 py-1.5 font-mono text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary/50" />
                          ) : (
                            <input type="text" value={String(params[f.key] ?? "")} onChange={(e) => setParams((p) => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="mt-1 w-full rounded-lg border border-border/60 bg-secondary/30 px-3 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/50" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Urgency + Transmit */}
              {cmdType && (
                <div className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1 flex-1">
                      {(["normal", "urgent", "emergency"] as const).map((u) => (
                        <button key={u} type="button" onClick={() => setUrgency(u)} className={cn(
                          "flex-1 rounded-full py-1.5 font-mono text-[9px] uppercase tracking-wider transition-all",
                          urgency === u && u === "normal" && "bg-primary/20 text-primary",
                          urgency === u && u === "urgent" && "bg-amber-500/20 text-amber-400",
                          urgency === u && u === "emergency" && "bg-red-500/20 text-red-400",
                          urgency !== u && "text-muted-foreground/40 hover:bg-secondary/30",
                        )}>{u}</button>
                      ))}
                    </div>
                    <button type="button" onClick={handleBuilderSubmit} disabled={!canBuilderSend} className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all",
                      canBuilderSend ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25" : "border-border/30 text-muted-foreground/30 cursor-not-allowed",
                    )}>
                      <Send className="h-3.5 w-3.5" /> Transmit
                    </button>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ──────── BOTTOM: Chat ──────── */}
        <div className="flex flex-col" style={{ height: "45%" }}>
          {/* Chat header */}
          <div className="flex items-center gap-2.5 border-b border-border/40 px-5 py-2">
            <Bot className="h-4 w-4 text-primary/60" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">AI Assistant</span>
            {history.length > 0 && <span className="ml-auto font-mono text-[9px] text-muted-foreground/40">{history.length} sent</span>}
          </div>

          {/* Messages */}
          <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-2 p-4">
              {messages.length === 0 && phase === "idle" && (
                <div className="flex gap-3 py-4">
                  <Satellite className="h-5 w-5 shrink-0 text-primary/40 mt-0.5" />
                  <div className="font-mono text-[11px] text-muted-foreground/60 leading-relaxed">
                    Or describe a command in plain English and I&apos;ll build it for you.
                    <br />
                    <span className="text-muted-foreground/40">e.g. &ldquo;Move USA-245 away from SJ-26&rdquo;</span>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={cn("flex gap-2 py-0.5", msg.role === "user" && "justify-end")}>
                  {msg.role === "assistant" && <Bot className="h-4 w-4 shrink-0 text-primary/50 mt-1" />}
                  <div className={cn("max-w-[85%] rounded-lg px-3.5 py-2 font-mono text-[11px] leading-relaxed", msg.role === "user" ? "bg-primary/15 text-foreground" : "bg-secondary/30 text-foreground")}>{msg.content}</div>
                  {msg.role === "user" && <User className="h-4 w-4 shrink-0 text-muted-foreground/40 mt-1" />}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-2 py-0.5"><Bot className="h-4 w-4 shrink-0 text-primary/50 mt-1" /><div className="rounded-lg bg-secondary/30 px-3.5 py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div></div>
              )}

              {/* Approval */}
              {phase === "approve" && pendingIntent && (
                <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="h-4 w-4 text-primary" /><span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">Proposed Command</span></div>
                  <div className="space-y-1 mb-3">
                    <CmdRow label="Target" value={pendingIntent.target_satellite_name} />
                    <CmdRow label="Type" value={pendingIntent.command_type.replace(/_/g, " ").toUpperCase()} />
                    <CmdRow label="Urgency" value={pendingIntent.urgency.toUpperCase()} alert={pendingIntent.urgency !== "normal"} />
                  </div>
                  <div className="font-mono text-[10px] text-foreground/70 italic mb-3">{pendingIntent.summary}</div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleApprove} className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/25"><CheckCircle2 className="h-3.5 w-3.5" />Approve</button>
                    <button type="button" onClick={handleReject} className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-secondary/20 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-secondary/40"><X className="h-3.5 w-3.5" />Modify</button>
                  </div>
                </div>
              )}

              {/* Confirm */}
              {phase === "confirm" && pendingIntent && (
                <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                  <div className="flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-amber-400" /><span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-400">Confirm Transmission</span></div>
                  <p className="font-mono text-[10px] text-foreground/70 mb-1">Transmit via Iridium SBD to:</p>
                  <p className="font-mono text-xs font-semibold text-foreground mb-3">{pendingIntent.target_satellite_name}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleConfirm} className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-400 hover:bg-amber-500/30"><Send className="h-3.5 w-3.5" />Confirm</button>
                    <button type="button" onClick={handleCancelConfirm} className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-secondary/20 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-secondary/40">Back</button>
                  </div>
                </div>
              )}

              {phase === "translating" && (
                <div className="mt-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
                  <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-cyan-400" /><span className="font-mono text-[10px] text-cyan-400">Translating to Iridium SBD...</span></div>
                </div>
              )}
            </div>
          </div>

          {/* Chat input */}
          <div className="border-t border-border/40 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <input ref={inputRef} type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={handleChatKeyDown} placeholder={phase === "idle" ? "Describe a command in plain English..." : "Waiting..."} disabled={phase !== "idle" || isLoading} className="flex-1 rounded-lg border border-border/60 bg-secondary/30 px-3.5 py-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed" />
              <button type="button" onClick={handleChatSend} disabled={!chatInput.trim() || phase !== "idle" || isLoading} className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-colors", chatInput.trim() && phase === "idle" && !isLoading ? "bg-primary/20 text-primary hover:bg-primary/30" : "text-muted-foreground/20 cursor-not-allowed")}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL — swaps to Threat Response when active ═══ */}
      {responseIsOpen ? <ThreatResponseView /> : <CommsTranscriptionView />}
    </div>
  )
}

function CmdRow({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className={cn("font-mono text-[10px] text-right", alert ? "text-amber-400 font-semibold" : "text-foreground")}>{value}</span>
    </div>
  )
}

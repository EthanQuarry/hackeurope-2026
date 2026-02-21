"use client"

import { Loader2, Check, MessageSquare, Brain, Terminal, Binary, Radio } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useCommsStore } from "@/stores/comms-store"
import type { CommsStage, ATCommand, SBDPayload, GatewayRouting, ParsedIntent } from "@/types"

/* Stage ordering for sequential reveal */
const STAGE_ORDER: CommsStage[] = [
  "human_input",
  "parsed_intent",
  "at_commands",
  "sbd_payload",
  "gateway_routing",
]

const STAGE_META: Record<
  string,
  { label: string; color: string; icon: typeof MessageSquare }
> = {
  human_input: { label: "HUMAN INPUT", color: "bg-zinc-400", icon: MessageSquare },
  parsed_intent: { label: "PARSED INTENT", color: "bg-blue-400", icon: Brain },
  at_commands: { label: "AT COMMANDS", color: "bg-cyan-400", icon: Terminal },
  sbd_payload: { label: "SBD PAYLOAD", color: "bg-purple-400", icon: Binary },
  gateway_routing: { label: "GATEWAY ROUTING", color: "bg-amber-400", icon: Radio },
}

function stageIndex(stage: CommsStage | null): number {
  if (!stage) return -1
  return STAGE_ORDER.indexOf(stage)
}

/* ─── Intent Display ─── */
function IntentView({ intent }: { intent: ParsedIntent }) {
  return (
    <div className="space-y-1.5">
      <Row label="Command" value={intent.command_type.replace(/_/g, " ").toUpperCase()} />
      <Row label="Target" value={intent.target_satellite_name} />
      <Row label="Urgency" value={intent.urgency.toUpperCase()} alert={intent.urgency !== "normal"} />
      <Row label="Summary" value={intent.summary} />
      {Object.keys(intent.parameters).length > 0 && (
        <div className="mt-1 rounded border border-border/20 bg-secondary/20 px-2 py-1.5">
          <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-1">Parameters</div>
          {Object.entries(intent.parameters).map(([k, v]) => (
            <Row key={k} label={k.replace(/_/g, " ")} value={String(v)} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── AT Command Display ─── */
function ATCommandsView({ commands }: { commands: ATCommand[] }) {
  return (
    <div className="space-y-1.5">
      {commands.map((cmd, i) => (
        <div key={i} className="rounded border border-border/20 bg-secondary/20 px-2 py-1.5">
          <code className="block font-mono text-[11px] font-semibold text-cyan-400">
            {cmd.command.length > 60 ? cmd.command.slice(0, 60) + "..." : cmd.command}
          </code>
          <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">{cmd.description}</div>
          <div className="mt-0.5 font-mono text-[9px] text-emerald-400/70">
            ← {cmd.expected_response}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Hex Dump Display ─── */
function HexDumpView({ payload }: { payload: SBDPayload }) {
  const hexStr = payload.mt_payload_hex
  const bytes = hexStr.split(/\s+/).filter(Boolean)

  // Color regions (byte index ranges)
  const headerEnd = 3 // protocol + length
  const iei1End = 4 // MT header IEI
  const headerLenEnd = 6
  const msgIdEnd = 10
  const imeiEnd = 25
  const flagsEnd = 27
  const payloadIeiEnd = 28
  const payloadLenEnd = 30

  function byteColor(idx: number): string {
    if (idx < headerEnd) return "text-zinc-400" // protocol + length
    if (idx < iei1End) return "text-purple-400" // MT Header IEI
    if (idx < headerLenEnd) return "text-purple-400/70" // header length
    if (idx < msgIdEnd) return "text-amber-400" // message ID
    if (idx < imeiEnd) return "text-blue-400" // IMEI
    if (idx < flagsEnd) return "text-zinc-500" // disposition flags
    if (idx < payloadIeiEnd) return "text-purple-400" // payload IEI
    if (idx < payloadLenEnd) return "text-purple-400/70" // payload length
    return "text-cyan-400" // actual payload
  }

  // Render hex in rows of 16
  const rows: { offset: string; hex: { byte: string; color: string }[]; ascii: string }[] = []
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16)
    const ascii = chunk
      .map((b) => {
        const code = parseInt(b, 16)
        return code >= 32 && code < 127 ? String.fromCharCode(code) : "."
      })
      .join("")
    rows.push({
      offset: i.toString(16).padStart(4, "0").toUpperCase(),
      hex: chunk.map((b, j) => ({ byte: b.toUpperCase(), color: byteColor(i + j) })),
      ascii,
    })
  }

  return (
    <div className="space-y-2">
      {/* Hex dump */}
      <div className="rounded border border-border/20 bg-black/40 p-2 overflow-x-auto">
        {rows.map((row) => (
          <div key={row.offset} className="flex items-center gap-2 font-mono text-[10px] leading-5">
            <span className="text-zinc-600 w-10 shrink-0">{row.offset}</span>
            <span className="flex-1 flex flex-wrap gap-x-1">
              {row.hex.map((h, j) => (
                <span key={j} className={h.color}>{h.byte}</span>
              ))}
            </span>
            <span className="text-zinc-600 shrink-0">{row.ascii}</span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <Legend color="text-purple-400" label="Header/IEI" />
        <Legend color="text-amber-400" label="Msg ID" />
        <Legend color="text-blue-400" label="IMEI" />
        <Legend color="text-cyan-400" label="Payload" />
      </div>

      {/* Decoded summary */}
      <div className="rounded border border-border/20 bg-secondary/20 px-2 py-1.5">
        <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">Decoded</div>
        <div className="mt-0.5 font-mono text-[10px] text-foreground">{payload.mt_payload_human_readable}</div>
      </div>

      <Row label="Total Bytes" value={payload.total_bytes} />
      <Row label="IMEI" value={payload.imei} />
    </div>
  )
}

/* ─── Gateway Routing Display ─── */
function GatewayView({ routing }: { routing: GatewayRouting }) {
  const gw = routing.selected_gateway
  return (
    <div className="space-y-1.5">
      <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
        <div className="font-mono text-xs font-semibold text-amber-400">{gw.name}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{gw.location}</div>
      </div>
      <Row label="Routing" value={routing.routing_reason} />
      <Row label="Signal Hops" value={`${routing.signal_hops} inter-satellite link(s)`} />
      <Row label="Est. Latency" value={`${routing.estimated_latency_ms} ms`} />
      <Row
        label="Sat Position"
        value={`${routing.satellite_position.lat.toFixed(1)}N, ${routing.satellite_position.lon.toFixed(1)}E @ ${routing.satellite_position.altKm.toFixed(0)} km`}
      />
      {routing.alternative_gateways.length > 0 && (
        <div className="mt-1">
          <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-0.5">Alternatives</div>
          {routing.alternative_gateways.map((alt) => (
            <div key={alt.name} className="font-mono text-[10px] text-muted-foreground">
              {alt.name} — {alt.location}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Shared row component ─── */
function Row({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 py-0.5">
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[10px] text-right",
          alert ? "text-red-400 font-semibold" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("font-mono text-[10px] font-bold", color)}>XX</span>
      <span className="font-mono text-[8px] text-muted-foreground">{label}</span>
    </span>
  )
}

/* ─── Stage Card wrapper ─── */
function StageCard({
  stage,
  currentStage,
  isStreaming,
  children,
}: {
  stage: CommsStage
  currentStage: CommsStage | null
  isStreaming: boolean
  children: React.ReactNode
}) {
  const meta = STAGE_META[stage]
  const Icon = meta.icon
  const idx = STAGE_ORDER.indexOf(stage)
  const currentIdx = stageIndex(currentStage)

  const isComplete = currentIdx > idx || (!isStreaming && currentIdx >= idx)
  const isActive = isStreaming && currentIdx === idx
  const isPending = currentIdx < idx

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 transition-all duration-300",
        isActive && "border-primary/50 bg-primary/5",
        isComplete && "border-border/40 bg-secondary/20",
        isPending && "border-border/20 bg-secondary/10 opacity-40",
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn("h-2 w-2 rounded-full", meta.color, isPending && "opacity-40")} />
        <Icon className={cn("h-3 w-3", isPending ? "text-muted-foreground/40" : "text-muted-foreground")} />
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground flex-1">
          {meta.label}
        </span>
        {isActive && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
        {isComplete && <Check className="h-3 w-3 text-emerald-400" />}
      </div>
      {(isActive || isComplete) && <div className="mt-2">{children}</div>}
    </div>
  )
}

/* ─── Main Component ─── */
export function CommsTranscriptionView() {
  const {
    isStreaming,
    currentStage,
    humanInput,
    parsedIntent,
    atCommands,
    sbdPayload,
    gatewayRouting,
    error,
  } = useCommsStore()

  const hasAnyData = humanInput || parsedIntent || atCommands || sbdPayload || gatewayRouting

  if (!hasAnyData && !error) {
    return (
      <div data-ops-panel className="pointer-events-auto flex flex-col overflow-hidden rounded-r-sm rounded-l-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
        <div className="border-b border-border/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-zinc-500" />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
              Protocol Transcription
            </h2>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center font-mono text-[10px] text-muted-foreground">
            Send a command to see the
            <br />
            Iridium SBD protocol translation
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-auto flex flex-col overflow-hidden rounded-r-sm rounded-l-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
      {/* Header */}
      <div className="border-b border-border/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className={cn("h-2 w-2 rounded-full", isStreaming ? "bg-cyan-400 animate-pulse" : "bg-emerald-400")} />
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
            Protocol Transcription
          </h2>
        </div>
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          {isStreaming ? "Translating command..." : "Translation complete"}
        </p>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2">
          <div className="font-mono text-[10px] text-red-400">{error}</div>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3">
          {/* Stage 1: Human Input */}
          <StageCard stage="human_input" currentStage={currentStage} isStreaming={isStreaming}>
            <div className="font-mono text-[11px] text-foreground italic">
              &ldquo;{humanInput}&rdquo;
            </div>
          </StageCard>

          {/* Stage 2: Parsed Intent */}
          <StageCard stage="parsed_intent" currentStage={currentStage} isStreaming={isStreaming}>
            {parsedIntent && <IntentView intent={parsedIntent} />}
          </StageCard>

          {/* Stage 3: AT Commands */}
          <StageCard stage="at_commands" currentStage={currentStage} isStreaming={isStreaming}>
            {atCommands && <ATCommandsView commands={atCommands.commands} />}
          </StageCard>

          {/* Stage 4: SBD Payload */}
          <StageCard stage="sbd_payload" currentStage={currentStage} isStreaming={isStreaming}>
            {sbdPayload && <HexDumpView payload={sbdPayload} />}
          </StageCard>

          {/* Stage 5: Gateway Routing */}
          <StageCard stage="gateway_routing" currentStage={currentStage} isStreaming={isStreaming}>
            {gatewayRouting && <GatewayView routing={gatewayRouting} />}
          </StageCard>
        </div>
      </ScrollArea>
    </div>
  )
}

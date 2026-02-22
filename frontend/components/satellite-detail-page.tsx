"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  THREAT_COLORS,
  PROXIMITY_THREAT_KM,
  PROXIMITY_NOMINAL_KM,
  SIGNAL_THREAT_PCT,
  SIGNAL_NOMINAL_PCT,
} from "@/lib/constants";
import { useUIStore } from "@/stores/ui-store";
import { useFleetStore } from "@/stores/fleet-store";
import { useThreatStore } from "@/stores/threat-store";
import { useSatellitesWithDerivedStatus } from "@/hooks/use-derived-status";
import { useCommsStore } from "@/stores/comms-store";
import { useCommsStream } from "@/hooks/use-comms-stream";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThreatBadge } from "@/components/shared/threat-badge";
import { api } from "@/lib/api";
import type {
  ProximityThreat,
  SignalThreat,
  AnomalyThreat,
  OrbitalSimilarityThreat,
  CommsChatMessage,
  CommsChatResponse,
  ParsedIntent,
  SatelliteData,
  CommsStage,
} from "@/types";

/* ═══════════════════════════════════════════════════════
   Types & command-builder constants
   ═══════════════════════════════════════════════════════ */

type Phase = "idle" | "approve" | "confirm" | "translating";

const COMMAND_TYPES = [
  {
    id: "orbit_adjust",
    label: "Orbit Adjust",
    icon: Orbit,
    desc: "Collision avoidance",
  },
  {
    id: "attitude_control",
    label: "Attitude",
    icon: Compass,
    desc: "Orientation",
  },
  {
    id: "telemetry_request",
    label: "Telemetry",
    icon: Activity,
    desc: "Status data",
  },
  { id: "power_management", label: "Power", icon: Zap, desc: "Power systems" },
  {
    id: "comm_relay_config",
    label: "Comms",
    icon: Radio,
    desc: "Relay config",
  },
  {
    id: "emergency_safe_mode",
    label: "Emergency",
    icon: ShieldAlert,
    desc: "Safe mode",
    emergency: true,
  },
] as const;

type CommandTypeId = (typeof COMMAND_TYPES)[number]["id"];
type Urgency = "normal" | "urgent" | "emergency";

interface FieldDef {
  key: string;
  label: string;
  type: "select" | "number" | "text";
  options?: string[];
  defaultValue?: string | number;
  placeholder?: string;
}

const PARAM_FIELDS: Record<string, FieldDef[]> = {
  orbit_adjust: [
    {
      key: "reason",
      label: "Reason",
      type: "select",
      options: [
        "collision_avoidance",
        "station_keeping",
        "orbit_raise",
        "orbit_lower",
        "deorbit",
      ],
      defaultValue: "collision_avoidance",
    },
    {
      key: "delta_v",
      label: "Delta-V (m/s)",
      type: "number",
      defaultValue: 0.1,
    },
    {
      key: "burn_direction",
      label: "Direction",
      type: "select",
      options: [
        "prograde",
        "retrograde",
        "radial_in",
        "radial_out",
        "normal",
        "anti-normal",
      ],
      defaultValue: "retrograde",
    },
    {
      key: "reference_threat",
      label: "Threat Ref",
      type: "text",
      placeholder: "e.g. SJ-26",
    },
  ],
  attitude_control: [
    {
      key: "target_orientation",
      label: "Orientation",
      type: "select",
      options: [
        "nadir_pointing",
        "sun_pointing",
        "target_tracking",
        "inertial_hold",
      ],
      defaultValue: "nadir_pointing",
    },
    {
      key: "rotation_rate",
      label: "Rate (deg/s)",
      type: "number",
      defaultValue: 0.5,
    },
  ],
  telemetry_request: [
    {
      key: "telemetry_type",
      label: "Type",
      type: "select",
      options: [
        "full_status",
        "power_only",
        "thermal_only",
        "comms_only",
        "propulsion_only",
      ],
      defaultValue: "full_status",
    },
  ],
  power_management: [
    {
      key: "action",
      label: "Action",
      type: "select",
      options: [
        "solar_panel_deploy",
        "solar_panel_stow",
        "battery_conditioning",
        "power_save_mode",
        "full_power",
      ],
      defaultValue: "full_power",
    },
  ],
  comm_relay_config: [
    {
      key: "action",
      label: "Action",
      type: "select",
      options: [
        "enable_transponder",
        "disable_transponder",
        "change_frequency",
        "adjust_power",
      ],
      defaultValue: "enable_transponder",
    },
    {
      key: "band",
      label: "Band",
      type: "select",
      options: ["S-band", "X-band", "Ka-band", "UHF"],
      defaultValue: "S-band",
    },
  ],
  emergency_safe_mode: [],
};

function buildCommandText(
  sat: SatelliteData,
  cmdType: string,
  params: Record<string, string | number>,
  urgency: Urgency,
): string {
  const label = cmdType.replace(/_/g, " ");
  let t = `Execute ${label} on ${sat.name}`;
  switch (cmdType) {
    case "orbit_adjust":
      t += ` — ${params.delta_v ?? 0.1} m/s ${String(params.burn_direction ?? "retrograde").replace(/_/g, " ")} burn`;
      if (params.reason)
        t += ` for ${String(params.reason).replace(/_/g, " ")}`;
      if (params.reference_threat) t += ` to avoid ${params.reference_threat}`;
      break;
    case "attitude_control":
      t += ` — rotate to ${String(params.target_orientation ?? "nadir_pointing").replace(/_/g, " ")}`;
      if (params.rotation_rate) t += ` at ${params.rotation_rate} deg/s`;
      break;
    case "telemetry_request":
      t += ` — request ${String(params.telemetry_type ?? "full_status").replace(/_/g, " ")} report`;
      break;
    case "power_management":
      t += ` — ${String(params.action ?? "full_power").replace(/_/g, " ")}`;
      break;
    case "comm_relay_config":
      t += ` — ${String(params.action ?? "enable_transponder").replace(/_/g, " ")}`;
      if (params.band) t += ` on ${params.band}`;
      break;
    case "emergency_safe_mode":
      t += ` — activate emergency safe mode immediately`;
      break;
  }
  if (urgency !== "normal") t += `. Urgency: ${urgency}`;
  return t + ".";
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function getOrbitType(inclination: number): string {
  if (inclination > 96 && inclination < 99) return "SSO";
  if (inclination > 80 && inclination < 100) return "Polar";
  if (inclination < 10) return "Equatorial";
  return "LEO";
}

function formatTCA(minutes: number): string {
  if (minutes < 60) return `T-${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `T-${h}h ${m}m` : `T-${h}h`;
}

function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${km.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} km`;
}

type ThreatGroup = {
  id: string;
  name: string;
  severity: "threat" | "threatened" | "watched" | "nominal";
  threats: Array<{
    type: "proximity" | "orbital" | "signal" | "anomaly";
    data:
      | ProximityThreat
      | OrbitalSimilarityThreat
      | SignalThreat
      | AnomalyThreat;
  }>;
};

const SEVERITY_ORDER = {
  threat: 0,
  threatened: 1,
  watched: 2,
  nominal: 3,
} as const;

function buildSatelliteContext(
  satellite: SatelliteData,
  threats: {
    proximity: ProximityThreat[];
    signal: SignalThreat[];
    anomaly: AnomalyThreat[];
    orbital: OrbitalSimilarityThreat[];
  },
): string {
  let ctx = `You are an AI assistant for satellite operations. The operator is viewing ${satellite.name} (NORAD ${satellite.noradId}).`;
  ctx += ` Orbital: alt ${satellite.altitude_km.toFixed(0)}km, vel ${satellite.velocity_kms.toFixed(2)} km/s, inc ${satellite.inclination_deg.toFixed(1)}°, period ${satellite.period_min.toFixed(1)}min.`;
  ctx += ` Health: power ${satellite.health.power}%, comms ${satellite.health.comms}%, propellant ${satellite.health.propellant}%.`;
  ctx += ` Status: ${satellite.status}.`;
  const total =
    threats.proximity.length +
    threats.signal.length +
    threats.anomaly.length +
    threats.orbital.length;
  if (total > 0) {
    ctx +=
      satellite.status === "threat"
        ? ` Satellites threatened by this asset (${total}):`
        : ` Active threats (${total}):`;
    for (const pt of threats.proximity) {
      ctx += ` Proximity — ${pt.foreignSatName}, miss ${pt.missDistanceKm.toFixed(1)}km, TCA ${pt.tcaInMinutes}min, ${pt.approachPattern}.`;
    }
    for (const ot of threats.orbital) {
      ctx += ` Orbital similarity — ${ot.foreignSatName}, divergence ${ot.divergenceScore.toFixed(3)}, pattern ${ot.pattern}, inc diff ${ot.inclinationDiffDeg.toFixed(1)}°, alt diff ${ot.altitudeDiffKm.toFixed(0)}km, ${(ot.confidence * 100).toFixed(0)}% confidence.`;
    }
    for (const st of threats.signal) {
      ctx += ` Signal — ${st.interceptorName}, ${(st.interceptionProbability * 100).toFixed(0)}% intercept, ${st.commWindowsAtRisk}/${st.totalCommWindows} windows.`;
    }
    for (const at of threats.anomaly) {
      ctx += ` Anomaly — ${at.anomalyType}, ${(at.baselineDeviation * 100).toFixed(0)}% deviation.`;
    }
  }
  return ctx;
}

/* ═══════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════ */

function MetricBox({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-lg border border-border/30 bg-secondary/20 px-3 py-2">
      <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
        {value}
        {unit && (
          <span className="ml-1 font-mono text-[9px] text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function HealthBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "#00e676" : value >= 40 ? "#ff9100" : "#ff1744";
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 font-mono text-[10px] capitalize text-muted-foreground">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
        {value}%
      </span>
    </div>
  );
}

function CmdRow({
  label,
  value,
  alert,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[8px] text-right",
          alert ? "text-amber-400 font-semibold" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ThreatDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <span className="font-mono text-[9px] tabular-nums text-foreground/80">
        {value}
      </span>
    </div>
  );
}

function ThreatConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "#ff1744" : pct >= 40 ? "#ff9100" : "#4488ff";
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/70 shrink-0">
        Confidence
      </span>
      <div className="flex-1 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-[9px] tabular-nums text-muted-foreground/70 w-7 text-right">
        {pct}%
      </span>
    </div>
  );
}

/* ── Compact Transcription Stage Indicator ── */

const STAGE_LIST: { id: CommsStage; label: string }[] = [
  { id: "human_input", label: "Human Input" },
  { id: "parsed_intent", label: "Parsed Intent" },
  { id: "at_commands", label: "AT Commands" },
  { id: "sbd_payload", label: "SBD Payload" },
  { id: "gateway_routing", label: "Gateway Routing" },
];

function TranscriptionStages() {
  const {
    isStreaming,
    humanInput,
    parsedIntent,
    atCommands,
    sbdPayload,
    gatewayRouting,
    error,
  } = useCommsStore();
  const hasData =
    humanInput || parsedIntent || atCommands || sbdPayload || gatewayRouting;
  if (!hasData && !error) return null;

  const done = [
    !!humanInput,
    !!parsedIntent,
    !!atCommands,
    !!sbdPayload,
    !!gatewayRouting,
  ];
  const activeIdx = done.indexOf(false);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isStreaming ? "bg-cyan-400 animate-pulse" : "bg-emerald-400",
          )}
        />
        <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
          {isStreaming
            ? "Translating to Iridium SBD..."
            : "Translation Complete"}
        </span>
      </div>
      {STAGE_LIST.map((s, i) => {
        const isActive = isStreaming && i === activeIdx;
        const isPending = !done[i] && !isActive;
        return (
          <div
            key={s.id}
            className={cn(
              "flex items-center gap-2 rounded border px-2.5 py-1",
              done[i] && "border-border/30 bg-secondary/10",
              isActive && "border-primary/40 bg-primary/5",
              isPending && "border-border/20 opacity-40",
            )}
          >
            <span className="font-mono text-[8px] text-muted-foreground w-3">
              {i + 1}.
            </span>
            <span
              className={cn(
                "flex-1 font-mono text-[9px]",
                isPending ? "text-muted-foreground/50" : "text-foreground",
              )}
            >
              {s.label}
            </span>
            {done[i] && <Check className="h-2.5 w-2.5 text-emerald-400" />}
            {isActive && (
              <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
            )}
          </div>
        );
      })}
      {error && (
        <div className="mt-1 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1">
          <span className="font-mono text-[9px] text-red-400">{error}</span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Component — 3-column mission hub
   ═══════════════════════════════════════════════════════ */

export function SatelliteDetailPage() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const selectSatellite = useFleetStore((s) => s.selectSatellite);
  const setFocusTarget = useThreatStore((s) => s.setFocusTarget);

  /* ── Fleet ── */
  const selectedId = useFleetStore((s) => s.selectedSatelliteId);
  const satellites = useSatellitesWithDerivedStatus();
  const satellite = satellites.find((s) => s.id === selectedId);

  /* ── Threats filtered for this satellite ── */
  const allProximity = useThreatStore((s) => s.proximityThreats);
  const allSignal = useThreatStore((s) => s.signalThreats);
  const allAnomaly = useThreatStore((s) => s.anomalyThreats);
  const allOrbitalSimilarity = useThreatStore(
    (s) => s.orbitalSimilarityThreats,
  );

  const proximityThreats = useMemo(
    () =>
      allProximity.filter(
        (t) => t.targetAssetId === selectedId || t.foreignSatId === selectedId,
      ),
    [allProximity, selectedId],
  );
  const signalThreats = useMemo(
    () =>
      allSignal.filter(
        (t) =>
          t.targetLinkAssetId === selectedId || t.interceptorId === selectedId,
      ),
    [allSignal, selectedId],
  );
  const anomalyThreats = useMemo(
    () => allAnomaly.filter((t) => t.satelliteId === selectedId),
    [allAnomaly, selectedId],
  );
  const orbitalSimilarityThreats = useMemo(
    () =>
      allOrbitalSimilarity.filter(
        (t) => t.targetAssetId === selectedId || t.foreignSatId === selectedId,
      ),
    [allOrbitalSimilarity, selectedId],
  );
  const isThreatActor = satellite?.status === "threat";
  const totalThreats = isThreatActor
    ? proximityThreats.filter((t) => t.foreignSatId === selectedId).length +
      signalThreats.filter((t) => t.interceptorId === selectedId).length +
      orbitalSimilarityThreats.filter((t) => t.foreignSatId === selectedId)
        .length
    : proximityThreats.length +
      signalThreats.length +
      anomalyThreats.length +
      orbitalSimilarityThreats.length;

  const THREAT_ACTOR_COUNTRIES = new Set(["PRC", "RUS", "CIS"]);
  const threatGroups = useMemo(() => {
    const map = new Map<string, ThreatGroup>();
    const add = (
      id: string,
      name: string,
      severity: string,
      type: ThreatGroup["threats"][0]["type"],
      data:
        | ProximityThreat
        | OrbitalSimilarityThreat
        | SignalThreat
        | AnomalyThreat,
    ) => {
      let sev = severity;
      // Use the satellite's existing status from backend (already accounts for country)
      if (sev === "watched" || sev === "nominal") {
        const cp = satellites.find((s) => s.id === id);
        if (cp?.status === "threatened") sev = "threatened";
        else if (cp?.status === "watched" && sev === "nominal") sev = "watched";
      }
      const existing = map.get(id);
      const entry = { type, data };
      if (existing) {
        existing.threats.push(entry);
        const s = sev as keyof typeof SEVERITY_ORDER;
        const exSev = existing.severity as keyof typeof SEVERITY_ORDER;
        if (SEVERITY_ORDER[s] < SEVERITY_ORDER[exSev]) {
          existing.severity = sev as ThreatGroup["severity"];
        }
      } else {
        map.set(id, {
          id,
          name,
          severity: sev as ThreatGroup["severity"],
          threats: [entry],
        });
      }
    };
    for (const t of proximityThreats) {
      const cpId =
        t.foreignSatId === selectedId ? t.targetAssetId : t.foreignSatId;
      const cpName =
        t.foreignSatId === selectedId ? t.targetAssetName : t.foreignSatName;
      const counterpartyIsActor = t.targetAssetId === selectedId;
      const cp = satellites.find((s) => s.id === cpId);
      const sev = isThreatActor
        ? "threatened"
        : counterpartyIsActor &&
            cp &&
            (cp.status === "watched" || cp.status === "threatened")
          ? "threat"
          : t.severity;
      add(cpId, cpName, sev, "proximity", t);
    }
    for (const t of orbitalSimilarityThreats) {
      const cpId =
        t.foreignSatId === selectedId ? t.targetAssetId : t.foreignSatId;
      const cpName =
        t.foreignSatId === selectedId ? t.targetAssetName : t.foreignSatName;
      const counterpartyIsActor = t.targetAssetId === selectedId;
      const cp = satellites.find((s) => s.id === cpId);
      const sev = isThreatActor
        ? "threatened"
        : counterpartyIsActor &&
            cp &&
            (cp.status === "watched" || cp.status === "threatened")
          ? "threat"
          : t.severity;
      add(cpId, cpName, sev, "orbital", t);
    }
    for (const t of signalThreats) {
      const cpId =
        t.interceptorId === selectedId ? t.targetLinkAssetId : t.interceptorId;
      const cpName =
        t.interceptorId === selectedId
          ? t.targetLinkAssetName
          : t.interceptorName;
      const counterpartyIsActor = t.targetLinkAssetId === selectedId;
      const cp = satellites.find((s) => s.id === cpId);
      const sev = isThreatActor
        ? "threatened"
        : counterpartyIsActor &&
            cp &&
            (cp.status === "watched" || cp.status === "threatened")
          ? "threat"
          : t.severity;
      add(cpId, cpName, sev, "signal", t);
    }
    if (!isThreatActor) {
      for (const t of anomalyThreats) {
        add("__self", "This satellite", "threatened", "anomaly", t);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity as keyof typeof SEVERITY_ORDER] -
        SEVERITY_ORDER[b.severity as keyof typeof SEVERITY_ORDER],
    );
  }, [
    proximityThreats,
    orbitalSimilarityThreats,
    signalThreats,
    anomalyThreats,
    selectedId,
    isThreatActor,
    satellites,
  ]);

  /* ── Comms ── */
  const { sendCommand } = useCommsStream();
  const isStreaming = useCommsStore((s) => s.isStreaming);
  const commsHistory = useCommsStore((s) => s.history);

  const satHistory = useMemo(
    () =>
      commsHistory.filter(
        (h) => h.parsed_intent?.target_satellite_id === selectedId,
      ),
    [commsHistory, selectedId],
  );

  /* ── Command builder state ── */
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingIntent, setPendingIntent] = useState<ParsedIntent | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [cmdType, setCmdType] = useState<CommandTypeId | null>(null);
  const [params, setParams] = useState<Record<string, string | number>>({});
  const [urgency, setUrgency] = useState<Urgency>("normal");

  /* ── AI chat state ── */
  const [chatMessages, setChatMessages] = useState<CommsChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  /* ── Effects ── */
  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages, phase]);

  useEffect(() => {
    if (!isStreaming && phase === "translating") setPhase("idle");
  }, [isStreaming, phase]);

  /* ── Command builder handlers ── */
  const handleCmdTypeChange = useCallback((id: CommandTypeId) => {
    setCmdType(id);
    const defs: Record<string, string | number> = {};
    for (const f of PARAM_FIELDS[id] ?? []) {
      if (f.defaultValue !== undefined) defs[f.key] = f.defaultValue;
    }
    setParams(defs);
    if (id === "emergency_safe_mode") setUrgency("emergency");
  }, []);

  const previewText = useMemo(() => {
    if (!satellite || !cmdType) return null;
    return buildCommandText(satellite, cmdType, params, urgency);
  }, [satellite, cmdType, params, urgency]);

  const handleBuilderSubmit = useCallback(() => {
    if (!previewText || !satellite || !cmdType || phase !== "idle") return;
    setPendingText(previewText);
    setPendingIntent({
      command_type: cmdType,
      target_satellite_id: selectedId!,
      target_satellite_name: satellite.name,
      parameters: params,
      urgency,
      summary: previewText,
    });
    setPhase("approve");
  }, [previewText, satellite, cmdType, selectedId, params, urgency, phase]);

  /* ── AI chat handlers ── */
  const handleChatSend = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading || phase !== "idle" || !satellite) return;

    const context = buildSatelliteContext(satellite, {
      proximity: proximityThreats,
      signal: signalThreats,
      anomaly: anomalyThreats,
      orbital: orbitalSimilarityThreats,
    });

    const newMsgs: CommsChatMessage[] = [
      ...chatMessages,
      { role: "user", content: msg },
    ];
    setChatMessages(newMsgs);
    setChatInput("");
    setChatLoading(true);

    // Inject satellite context so the AI knows what we're looking at
    const apiMessages: CommsChatMessage[] = [
      { role: "user", content: `[Context: ${context}]` },
      {
        role: "assistant",
        content: `I'm ready to help with ${satellite.name}. What would you like to know?`,
      },
      ...newMsgs,
    ];

    try {
      const res = await fetch(api.commsChat, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CommsChatResponse = await res.json();
      setChatMessages((p) => [
        ...p,
        { role: "assistant", content: data.reply },
      ]);
      if (data.command_ready && data.parsed_intent) {
        setPendingIntent(data.parsed_intent);
        setPendingText(data.parsed_intent.summary);
        setPhase("approve");
      }
    } catch {
      setChatMessages((p) => [
        ...p,
        {
          role: "assistant",
          content:
            "I can help with this satellite. Try asking about its status, threats, or what commands to send.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [
    chatInput,
    chatLoading,
    phase,
    satellite,
    chatMessages,
    proximityThreats,
    signalThreats,
    anomalyThreats,
  ]);

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleChatSend();
      }
    },
    [handleChatSend],
  );

  /* ── Shared approval flow ── */
  const handleApprove = useCallback(() => setPhase("confirm"), []);
  const handleReject = useCallback(() => {
    setPendingIntent(null);
    setPendingText(null);
    setPhase("idle");
  }, []);
  const handleConfirm = useCallback(() => {
    if (!pendingText || !pendingIntent) return;
    setPhase("translating");
    sendCommand(pendingText, pendingIntent.target_satellite_id);
  }, [pendingText, pendingIntent, sendCommand]);
  const handleCancelConfirm = useCallback(() => setPhase("approve"), []);

  const canBuilderSend = !!satellite && !!cmdType && phase === "idle";

  /* ── Null guard — show satellite picker ── */
  if (!satellite) {
    return (
      <div
        data-ops-panel
        className="flex h-full w-full items-center justify-center"
      >
        <div className="w-full max-w-md rounded-xl border border-border/60 bg-card/80 px-6 py-5 backdrop-blur-lg">
          <div className="flex items-center gap-2 mb-4">
            <Satellite className="h-4 w-4 text-primary/60" />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
              Select a Satellite
            </h2>
          </div>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1 pr-2">
              {satellites.map((sat) => {
                const colors = THREAT_COLORS[sat.status];
                return (
                  <button
                    key={sat.id}
                    type="button"
                    onClick={() => selectSatellite(sat.id)}
                    className="w-full flex items-center gap-3 rounded-lg border border-border/30 bg-secondary/10 px-3 py-2.5 text-left transition-colors hover:border-border/60 hover:bg-secondary/25"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colors.hex }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="block font-mono text-[11px] font-medium text-foreground truncate">
                        {sat.name}
                      </span>
                      <span className="block font-mono text-[9px] text-muted-foreground">
                        NORAD {sat.noradId} · {sat.altitude_km.toFixed(0)} km ·{" "}
                        {getOrbitType(sat.inclination_deg)}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 font-mono text-[8px] uppercase",
                        colors.bg,
                        colors.text,
                      )}
                    >
                      {sat.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  const statusColors = THREAT_COLORS[satellite.status];
  const lastPoint = satellite.trajectory[satellite.trajectory.length - 1];

  return (
    <div className="grid h-full w-full grid-cols-[18rem_18rem_1fr_20rem] gap-3">
      {/* ═══ COLUMN 1 — Satellite Data ═══ */}
      <div
        data-ops-panel
        className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
          <button
            type="button"
            onClick={() => setActiveView("overview")}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <span className="font-mono text-sm font-semibold text-foreground">
            {satellite.name}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[9px] uppercase",
              statusColors.bg,
              statusColors.text,
            )}
          >
            {satellite.status}
          </span>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {/* Orbital Parameters */}
          <div className="border-b border-border/40 p-4">
            <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Orbital Parameters
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MetricBox
                label="Altitude"
                value={satellite.altitude_km.toFixed(0)}
                unit="km"
              />
              <MetricBox
                label="Velocity"
                value={satellite.velocity_kms.toFixed(2)}
                unit="km/s"
              />
              <MetricBox
                label="Inclination"
                value={satellite.inclination_deg.toFixed(1)}
                unit="deg"
              />
              <MetricBox
                label="Period"
                value={satellite.period_min.toFixed(1)}
                unit="min"
              />
            </div>
          </div>

          {/* Current Position */}
          {lastPoint && (
            <div className="border-b border-border/40 px-4 py-3">
              <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Current Position
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                    Lat
                  </div>
                  <div className="font-mono text-[10px] tabular-nums text-foreground">
                    {lastPoint.lat.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                    Lon
                  </div>
                  <div className="font-mono text-[10px] tabular-nums text-foreground">
                    {lastPoint.lon.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                    Alt
                  </div>
                  <div className="font-mono text-[10px] tabular-nums text-foreground">
                    {lastPoint.alt_km.toFixed(0)} km
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Health Subsystems */}
          <div className="border-b border-border/40 px-4 py-3">
            <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Health Subsystems
            </div>
            <div className="space-y-2">
              {(["power", "comms", "propellant"] as const).map((key) => (
                <HealthBar
                  key={key}
                  label={key}
                  value={satellite.health[key]}
                />
              ))}
            </div>
          </div>

          {/* Satellite Info */}
          <div className="border-b border-border/40 px-4 py-3">
            <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Satellite Info
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">
                  NORAD ID
                </span>
                <span className="font-mono text-[10px] tabular-nums text-foreground">
                  {satellite.noradId}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">
                  Orbit Type
                </span>
                <span className="font-mono text-[10px] text-foreground">
                  {getOrbitType(satellite.inclination_deg)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">
                  Status
                </span>
                <ThreatBadge severity={satellite.status} />
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* ═══ COLUMN 2 — Threats ═══ */}
      <div
        data-ops-panel
        className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground flex-1">
            {satellite.status === "threat"
              ? "Satellites Threatened"
              : "Active Threats"}
          </span>
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums",
              totalThreats > 0
                ? "bg-red-500/15 text-red-400"
                : "bg-secondary/30 text-muted-foreground",
            )}
          >
            {totalThreats}
          </span>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-4 py-3">
            <p className="font-mono text-[8px] text-muted-foreground/70 mb-2">
              Reference: threat &lt;{PROXIMITY_THREAT_KM} km · nominal &gt;
              {PROXIMITY_NOMINAL_KM} km
            </p>
            {totalThreats === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertTriangle className="mb-2 h-4 w-4 text-muted-foreground/30" />
                <p className="font-mono text-[10px] text-muted-foreground/60">
                  {satellite.status === "threat"
                    ? "No satellites threatened"
                    : "No active threats"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {threatGroups.map((group) => {
                  const targetSat = satellites.find((s) => s.id === group.id);
                  const handleSelectGroup = () => {
                    if (group.id === "__self") return;
                    selectSatellite(group.id);
                    const p = targetSat?.trajectory?.[0];
                    if (p)
                      setFocusTarget({
                        lat: p.lat,
                        lon: p.lon,
                        altKm: p.alt_km,
                        satelliteId: group.id,
                      });
                  };
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={handleSelectGroup}
                      disabled={group.id === "__self"}
                      className={cn(
                        "w-full rounded-md border border-border/30 bg-secondary/10 px-3 py-2 text-left transition-colors",
                        group.id !== "__self" &&
                          "hover:border-border/60 hover:bg-secondary/20 cursor-pointer",
                        group.id === "__self" && "cursor-default",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-medium text-foreground">
                          {group.name}
                        </span>
                        <ThreatBadge severity={group.severity} />
                      </div>
                      <div className="mt-2 space-y-3">
                        {group.threats.map((entry, i) => {
                          if (entry.type === "proximity") {
                            const t = entry.data as ProximityThreat;
                            const patternLabel = t.approachPattern.replace(
                              /-/g,
                              " ",
                            );
                            const miss = formatDistance(t.missDistanceKm);
                            const tca = formatTCA(t.tcaInMinutes);
                            const vel = `${t.approachVelocityKms.toFixed(1)} km/s`;
                            const target = t.targetAssetName;
                            const patternExplanations: Record<string, string> =
                              {
                                "co-orbital": `Tracking in the same orbital plane as ${target} at ${miss} separation. Co-orbital positioning is a known precursor to rendezvous, inspection, or grappling operations — it requires deliberate delta-V to establish and maintain.`,
                                drift: `Executing a passive drift approach toward ${target}. An altitude differential causes slow, continuous separation closure without thruster burns — making it difficult to classify as intentional. Closest pass ${tca} at ${miss}.`,
                                direct: `On a crossing trajectory with ${target} at ${vel} relative velocity. High relative velocity on a converging geometry is consistent with an intercept profile rather than a surveillance or shadowing posture.`,
                                "sun-hiding": `Approaching ${target} from the solar direction (${miss} at ${tca}). Sun-hiding is a deliberate evasion technique — passive electro-optical sensors cannot image targets inbound from the sun direction, masking the approach until very close range.`,
                              };
                            const summary =
                              patternExplanations[t.approachPattern] ??
                              `Conducting ${patternLabel} approach toward ${target} — closest pass ${tca} at ${miss}.`;
                            const severityCoda =
                              t.severity === "threatened"
                                ? ` Miss distance of ${miss} is within collision-hazard and close-inspection threshold.`
                                : t.severity === "watched"
                                  ? " Continued monitoring required — within proximity operations range."
                                  : "";
                            return (
                              <div
                                key={i}
                                className="space-y-1.5 border-t border-border/20 pt-2 first:border-t-0 first:pt-0"
                              >
                                <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/60">
                                  Proximity
                                </div>
                                <p className="font-mono text-[9px] text-foreground/70 leading-relaxed">
                                  {summary}
                                  {severityCoda}
                                  {t.sunHidingDetected &&
                                    t.approachPattern !== "sun-hiding" &&
                                    " Sun-hiding manoeuvre also detected."}
                                </p>
                                <div className="space-y-1 mt-1">
                                  <ThreatDetailRow
                                    label="Miss dist"
                                    value={formatDistance(t.missDistanceKm)}
                                  />
                                  <ThreatDetailRow
                                    label="TCA"
                                    value={formatTCA(t.tcaInMinutes)}
                                  />
                                  <ThreatDetailRow
                                    label="Approach vel"
                                    value={`${t.approachVelocityKms.toFixed(3)} km/s`}
                                  />
                                  <ThreatDetailRow
                                    label="Pattern"
                                    value={patternLabel}
                                  />
                                </div>
                                <ThreatConfidenceBar value={t.confidence} />
                              </div>
                            );
                          }
                          if (entry.type === "orbital") {
                            const t = entry.data as OrbitalSimilarityThreat;
                            const patternLabel = t.pattern.replace(/-/g, " ");
                            const target = t.targetAssetName;
                            const orbPatternExplanations: Record<
                              string,
                              string
                            > = {
                              "co-planar": `Orbital planes are nearly co-planar with ${target} (Δi ${t.inclinationDiffDeg.toFixed(1)}°, Δalt ${t.altitudeDiffKm.toFixed(0)} km). Achieving plane alignment requires significant delta-V investment — this is deliberate positioning, not coincidence.`,
                              "co-altitude": `Matching altitude shell of ${target} (Δalt ${t.altitudeDiffKm.toFixed(0)} km) without full plane alignment. Station-keeping at the same altitude while drifting in RAAN is a common precursor to a future rendezvous window.`,
                              "co-inclination": `Inclination closely matches ${target} (Δi ${t.inclinationDiffDeg.toFixed(1)}°). With matching inclination, natural RAAN drift over weeks will periodically bring the orbital planes into conjunction without further burns.`,
                              shadowing: `Orbital parameters closely mirror ${target} across both altitude (Δ${t.altitudeDiffKm.toFixed(0)} km) and inclination (Δ${t.inclinationDiffDeg.toFixed(1)}°). Divergence score ${t.divergenceScore.toFixed(3)} — the degree of similarity is inconsistent with an independent mission profile.`,
                            };
                            const summary =
                              orbPatternExplanations[t.pattern] ??
                              `Orbital plane match consistent with ${patternLabel} shadowing of ${target}. Divergence score ${t.divergenceScore.toFixed(3)}.`;
                            return (
                              <div
                                key={i}
                                className="space-y-1.5 border-t border-border/20 pt-2 first:border-t-0 first:pt-0"
                              >
                                <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/60">
                                  Orbital Similarity
                                </div>
                                <p className="font-mono text-[9px] text-foreground/70 leading-relaxed">
                                  {summary}
                                </p>
                                <div className="space-y-1 mt-1">
                                  <ThreatDetailRow
                                    label="Divergence"
                                    value={t.divergenceScore.toFixed(4)}
                                  />
                                  <ThreatDetailRow
                                    label="Inclination Δ"
                                    value={`±${t.inclinationDiffDeg.toFixed(1)}°`}
                                  />
                                  <ThreatDetailRow
                                    label="Altitude Δ"
                                    value={`±${t.altitudeDiffKm.toFixed(0)} km`}
                                  />
                                  <ThreatDetailRow
                                    label="Pattern"
                                    value={patternLabel}
                                  />
                                </div>
                                <ThreatConfidenceBar value={t.confidence} />
                              </div>
                            );
                          }
                          if (entry.type === "signal") {
                            const t = entry.data as SignalThreat;
                            const pct = (
                              t.interceptionProbability * 100
                            ).toFixed(0);
                            const riskLevel =
                              t.interceptionProbability > 0.4
                                ? "high"
                                : t.interceptionProbability > 0.15
                                  ? "moderate"
                                  : "low";
                            const summary = `In geometry to intercept ${t.commWindowsAtRisk} of ${t.totalCommWindows} uplink/downlink windows between ${t.targetLinkAssetName} and ${t.groundStationName}. Signal path angle ${t.signalPathAngleDeg.toFixed(1)}° gives a ${riskLevel} intercept probability (${pct}%). At this angle the satellite can passively collect command and telemetry without active jamming.`;
                            return (
                              <div
                                key={i}
                                className="space-y-1.5 border-t border-border/20 pt-2 first:border-t-0 first:pt-0"
                              >
                                <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/60">
                                  Signal Interception
                                </div>
                                <p className="font-mono text-[9px] text-foreground/70 leading-relaxed">
                                  {summary}
                                </p>
                                <div className="space-y-1 mt-1">
                                  <ThreatDetailRow
                                    label="Intercept prob"
                                    value={`${pct}%`}
                                  />
                                  <ThreatDetailRow
                                    label="Windows at risk"
                                    value={`${t.commWindowsAtRisk} / ${t.totalCommWindows}`}
                                  />
                                  <ThreatDetailRow
                                    label="Ground station"
                                    value={t.groundStationName}
                                  />
                                  <ThreatDetailRow
                                    label="Path angle"
                                    value={`${t.signalPathAngleDeg.toFixed(1)}°`}
                                  />
                                </div>
                                <ThreatConfidenceBar value={t.confidence} />
                              </div>
                            );
                          }
                          const t = entry.data as AnomalyThreat;
                          const typeLabel = t.anomalyType.replace(/-/g, " ");
                          const detectedAgo = Math.round(
                            (Date.now() - t.detectedAt) / 60000,
                          );
                          return (
                            <div
                              key={i}
                              className="space-y-1.5 border-t border-border/20 pt-2 first:border-t-0 first:pt-0"
                            >
                              <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/60">
                                Anomalous Behavior
                              </div>
                              <p className="font-mono text-[9px] text-foreground/70 leading-relaxed">
                                {t.description}
                              </p>
                              <div className="space-y-1 mt-1">
                                <ThreatDetailRow
                                  label="Type"
                                  value={typeLabel}
                                />
                                <ThreatDetailRow
                                  label="Deviation"
                                  value={`${(t.baselineDeviation * 100).toFixed(0)}% from baseline`}
                                />
                                <ThreatDetailRow
                                  label="Detected"
                                  value={`${detectedAgo}m ago`}
                                />
                              </div>
                              <ThreatConfidenceBar value={t.confidence} />
                            </div>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {isThreatActor && anomalyThreats.length > 0 && (
              <div className="mt-3 border-t border-border/30 pt-3">
                <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mb-2">
                  Anomalous Behavior
                </div>
                <div className="space-y-3">
                  {anomalyThreats.map((t, i) => {
                    const typeLabel = t.anomalyType.replace(/-/g, " ");
                    const detectedAgo = Math.round(
                      (Date.now() - t.detectedAt) / 60000,
                    );
                    return (
                      <div key={i} className="space-y-1.5">
                        <p className="font-mono text-[9px] text-foreground/70 leading-relaxed">
                          {t.description}
                        </p>
                        <div className="space-y-1">
                          <ThreatDetailRow label="Type" value={typeLabel} />
                          <ThreatDetailRow
                            label="Deviation"
                            value={`${(t.baselineDeviation * 100).toFixed(0)}% from baseline`}
                          />
                          <ThreatDetailRow
                            label="Detected"
                            value={`${detectedAgo}m ago`}
                          />
                        </div>
                        <ThreatConfidenceBar value={t.confidence} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ═══ COLUMN 3 — Command Centre ═══ */}
      <div
        data-ops-panel
        className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
          <div
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              phase === "translating"
                ? "bg-cyan-400 animate-pulse"
                : "bg-emerald-400",
            )}
          />
          <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground">
            Command Centre
          </h2>
          <span className="ml-auto font-mono text-[8px] text-muted-foreground">
            {satellite.name}
          </span>
        </div>

        {/* ── Top half: Command Builder ── */}
        <div
          className="flex flex-col border-b border-border/40"
          style={{ maxHeight: "50%" }}
        >
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-0">
              {/* Target satellite (locked to current) */}
              <div className="border-b border-border/20 px-3 py-2">
                <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground mb-1">
                  Target
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: statusColors.hex }}
                  />
                  <span className="flex-1 font-mono text-[9px] font-medium text-foreground truncate">
                    {satellite.name}
                  </span>
                  <span className="font-mono text-[7px] text-muted-foreground">
                    {satellite.altitude_km.toFixed(0)}km
                  </span>
                </div>
              </div>

              {/* Command type — 3×2 grid */}
              <div className="border-b border-border/20 px-3 py-2">
                <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground mb-1">
                  Command
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {COMMAND_TYPES.map((cmd) => {
                    const Icon = cmd.icon;
                    const isSel = cmdType === cmd.id;
                    const isEmrg = "emergency" in cmd && cmd.emergency;
                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        onClick={() => handleCmdTypeChange(cmd.id)}
                        className={cn(
                          "flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-center transition-all",
                          isSel && !isEmrg && "border-primary/50 bg-primary/10",
                          isSel && isEmrg && "border-red-500/50 bg-red-500/10",
                          !isSel &&
                            !isEmrg &&
                            "border-border/30 hover:bg-secondary/30",
                          !isSel &&
                            isEmrg &&
                            "border-red-500/20 hover:bg-red-500/10",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-3 w-3",
                            isSel && !isEmrg && "text-primary",
                            isSel && isEmrg && "text-red-400",
                            !isSel && !isEmrg && "text-muted-foreground",
                            !isSel && isEmrg && "text-red-400/60",
                          )}
                        />
                        <span
                          className={cn(
                            "font-mono text-[7px] font-medium leading-none",
                            isSel
                              ? isEmrg
                                ? "text-red-400"
                                : "text-primary"
                              : "text-muted-foreground",
                          )}
                        >
                          {cmd.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Parameters (context-sensitive) */}
              {cmdType && (
                <div className="border-b border-border/20 px-3 py-2">
                  <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground mb-1">
                    Parameters
                  </div>
                  {cmdType === "emergency_safe_mode" ? (
                    <div className="flex items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5">
                      <AlertTriangle className="h-3 w-3 shrink-0 text-red-400" />
                      <span className="font-mono text-[8px] text-red-400">
                        All operations will cease.
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                      {(PARAM_FIELDS[cmdType] ?? []).map((f) => (
                        <div
                          key={f.key}
                          className={f.type === "text" ? "col-span-2" : ""}
                        >
                          <label className="font-mono text-[6px] uppercase tracking-wider text-muted-foreground">
                            {f.label}
                          </label>
                          {f.type === "select" ? (
                            <select
                              value={String(
                                params[f.key] ?? f.defaultValue ?? "",
                              )}
                              onChange={(e) =>
                                setParams((p) => ({
                                  ...p,
                                  [f.key]: e.target.value,
                                }))
                              }
                              className="mt-0.5 w-full rounded border border-border/60 bg-secondary/30 px-1.5 py-0.5 font-mono text-[8px] text-foreground outline-none focus:ring-1 focus:ring-primary/50 [&>option]:bg-card"
                            >
                              {f.options?.map((o) => (
                                <option key={o} value={o}>
                                  {o.replace(/_/g, " ")}
                                </option>
                              ))}
                            </select>
                          ) : f.type === "number" ? (
                            <input
                              type="number"
                              step="any"
                              value={params[f.key] ?? f.defaultValue ?? ""}
                              onChange={(e) =>
                                setParams((p) => ({
                                  ...p,
                                  [f.key]: parseFloat(e.target.value) || 0,
                                }))
                              }
                              className="mt-0.5 w-full rounded border border-border/60 bg-secondary/30 px-1.5 py-0.5 font-mono text-[8px] text-foreground outline-none focus:ring-1 focus:ring-primary/50"
                            />
                          ) : (
                            <input
                              type="text"
                              value={String(params[f.key] ?? "")}
                              onChange={(e) =>
                                setParams((p) => ({
                                  ...p,
                                  [f.key]: e.target.value,
                                }))
                              }
                              placeholder={f.placeholder}
                              className="mt-0.5 w-full rounded border border-border/60 bg-secondary/30 px-1.5 py-0.5 font-mono text-[8px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/50"
                            />
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
                        <button
                          key={u}
                          type="button"
                          onClick={() => setUrgency(u)}
                          className={cn(
                            "flex-1 rounded-full py-0.5 font-mono text-[7px] uppercase tracking-wider transition-all",
                            urgency === u &&
                              u === "normal" &&
                              "bg-primary/20 text-primary",
                            urgency === u &&
                              u === "urgent" &&
                              "bg-amber-500/20 text-amber-400",
                            urgency === u &&
                              u === "emergency" &&
                              "bg-red-500/20 text-red-400",
                            urgency !== u &&
                              "text-muted-foreground/40 hover:bg-secondary/30",
                          )}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleBuilderSubmit}
                      disabled={!canBuilderSend}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border px-3 py-1 font-mono text-[8px] font-semibold uppercase tracking-wider transition-all",
                        canBuilderSend
                          ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25"
                          : "border-border/30 text-muted-foreground/30 cursor-not-allowed",
                      )}
                    >
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
                  <span className="font-mono text-[8px] font-semibold uppercase tracking-wider text-primary">
                    Proposed Command
                  </span>
                </div>
                <div className="space-y-0.5 mb-2">
                  <CmdRow
                    label="Target"
                    value={pendingIntent.target_satellite_name}
                  />
                  <CmdRow
                    label="Type"
                    value={pendingIntent.command_type
                      .replace(/_/g, " ")
                      .toUpperCase()}
                  />
                  <CmdRow
                    label="Urgency"
                    value={pendingIntent.urgency.toUpperCase()}
                    alert={pendingIntent.urgency !== "normal"}
                  />
                </div>
                <div className="font-mono text-[8px] text-foreground/70 italic mb-2">
                  {pendingIntent.summary}
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleApprove}
                    className="flex-1 flex items-center justify-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/15 px-2 py-1.5 font-mono text-[8px] font-semibold uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/25"
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    className="flex items-center justify-center gap-1 rounded border border-border/40 bg-secondary/20 px-2 py-1.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground hover:bg-secondary/40"
                  >
                    <X className="h-2.5 w-2.5" />
                    Modify
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
                  <span className="font-mono text-[8px] font-semibold uppercase tracking-wider text-amber-400">
                    Confirm Transmission
                  </span>
                </div>
                <p className="font-mono text-[8px] text-foreground/70 mb-1">
                  Transmit via Iridium SBD to:
                </p>
                <p className="font-mono text-[9px] font-semibold text-foreground mb-2">
                  {pendingIntent.target_satellite_name}
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="flex-1 flex items-center justify-center gap-1 rounded border border-amber-500/50 bg-amber-500/20 px-2 py-1.5 font-mono text-[8px] font-semibold uppercase tracking-wider text-amber-400 hover:bg-amber-500/30"
                  >
                    <Send className="h-2.5 w-2.5" />
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelConfirm}
                    className="flex items-center justify-center gap-1 rounded border border-border/40 bg-secondary/20 px-2 py-1.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground hover:bg-secondary/40"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Transcription (when streaming) or Command History (when idle) */}
          {isStreaming ? (
            <>
              <div className="border-b border-border/40 px-4 py-2">
                <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                  Protocol Transcription
                </span>
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
                <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                  Command History
                </span>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-2 p-3">
                  {satHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <Send className="mb-2 h-4 w-4 text-muted-foreground/30" />
                      <p className="font-mono text-[10px] text-muted-foreground/60">
                        No commands sent to {satellite.name}
                      </p>
                    </div>
                  ) : (
                    satHistory.map((entry) => (
                      <div
                        key={entry.transcription_id}
                        className="rounded-md border border-border/30 px-3 py-2"
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-mono text-[10px] text-foreground line-clamp-1">
                            {entry.human_input}
                          </p>
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

      {/* ═══ COLUMN 4 — AI Assistant ═══ */}
      <div
        data-ops-panel
        className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
          <Bot className="h-3 w-3 text-primary/60" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
            AI Assistant
          </span>
        </div>

        {/* Chat messages */}
        <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-1 p-2.5">
            {/* Empty-state placeholder */}
            {chatMessages.length === 0 && (
              <div className="flex gap-2 px-1 py-3">
                <Satellite className="h-3.5 w-3.5 shrink-0 text-primary/40 mt-0.5" />
                <div className="font-mono text-[9px] text-muted-foreground/60 leading-relaxed">
                  Ask me about {satellite.name}&apos;s status, threats, or what
                  commands to send.
                  <br />
                  <span className="text-muted-foreground/40">
                    e.g. &ldquo;What threats are active?&rdquo;
                  </span>
                </div>
              </div>
            )}

            {/* Message bubbles */}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-1.5 px-1 py-0.5",
                  msg.role === "user" && "justify-end",
                )}
              >
                {msg.role === "assistant" && (
                  <Bot className="h-3 w-3 shrink-0 text-primary/50 mt-0.5" />
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-md px-2.5 py-1.5 font-mono text-[9px] leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary/15 text-foreground"
                      : "bg-secondary/30 text-foreground",
                  )}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <User className="h-3 w-3 shrink-0 text-muted-foreground/40 mt-0.5" />
                )}
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
              placeholder={
                phase === "idle"
                  ? `Ask about ${satellite.name}...`
                  : "Waiting..."
              }
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
              {chatLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

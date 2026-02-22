"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import {
  Search,
  Loader2,
  Bot,
  User,
  Send,
  Shield,
  AlertTriangle,
  Clock,
  Crosshair,
  Activity,
  Satellite,
  FileText,
  ChevronDown,
  ExternalLink,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/stores/ui-store"
import { useAdversaryStore } from "@/stores/adversary-store"
import type { ThreatSeverity } from "@/lib/constants"

/* ═══════════════════════════════════════════════════════
   Dummy data — will be replaced with live integration
   ═══════════════════════════════════════════════════════ */

interface AdversaryEvent {
  id: string
  timestamp: number
  type: "maneuver" | "proximity" | "signal" | "anomaly" | "launch"
  title: string
  description: string
  severity: ThreatSeverity
}

interface AdversarySatellite {
  id: string
  name: string
  noradId: number
  owner: string
  country: string
  severity: ThreatSeverity
  orbitType: string
  altitude_km: number
  threatScore: number
  assessedMission: string
  recentEvents: AdversaryEvent[]
}

const DUMMY_ADVERSARIES: AdversarySatellite[] = [
  {
    id: "foreign-1",
    name: "KOSMOS 2558",
    noradId: 53328,
    owner: "Russian Aerospace Forces",
    country: "CIS",
    severity: "threatened",
    orbitType: "LEO",
    altitude_km: 448,
    threatScore: 0.91,
    assessedMission: "Counter-space / inspector satellite — tracking US NRO payload USA-326",
    recentEvents: [
      { id: "ev-1", timestamp: Date.now() - 300000, type: "maneuver", title: "Prograde burn detected", description: "0.4 m/s prograde burn reduced miss distance with SPECTER-4 to 800m. Not consistent with station-keeping.", severity: "threatened" },
      { id: "ev-2", timestamp: Date.now() - 1800000, type: "proximity", title: "RPO approach phase", description: "Entered proximity operations zone around SPECTER-4. Co-orbital approach pattern with sun-hiding geometry.", severity: "threatened" },
      { id: "ev-3", timestamp: Date.now() - 7200000, type: "anomaly", title: "RF emission spike", description: "S-band emission intensity increased 12 dB above baseline. Possible active sensor sweep.", severity: "watched" },
      { id: "ev-4", timestamp: Date.now() - 86400000, type: "maneuver", title: "Plane change maneuver", description: "Inclination adjusted 0.03° to match SPECTER-4 orbital plane.", severity: "watched" },
    ],
  },
  {
    id: "foreign-2",
    name: "SJ-21 (SHIJIAN-21)",
    noradId: 49328,
    owner: "PLA Strategic Support Force",
    country: "PRC",
    severity: "watched",
    orbitType: "GEO",
    altitude_km: 35786,
    threatScore: 0.78,
    assessedMission: "Debris mitigation / dual-use — demonstrated GEO object grappling capability",
    recentEvents: [
      { id: "ev-5", timestamp: Date.now() - 3600000, type: "maneuver", title: "Station-keeping burn", description: "Nominal east-west station-keeping. Position maintained near 104.5°E.", severity: "nominal" },
      { id: "ev-6", timestamp: Date.now() - 172800000, type: "proximity", title: "Close approach to OVERWATCH-2 relay", description: "Drifted within 18.5 km of OVERWATCH-2 GEO relay. Pattern consistent with inspection.", severity: "watched" },
    ],
  },
  {
    id: "foreign-3",
    name: "SHIJIAN-17",
    noradId: 41838,
    owner: "CAST / PLA SSF",
    country: "PRC",
    severity: "nominal",
    orbitType: "GEO",
    altitude_km: 35780,
    threatScore: 0.55,
    assessedMission: "Technology demonstration — robotic arm tested for on-orbit servicing",
    recentEvents: [
      { id: "ev-7", timestamp: Date.now() - 604800000, type: "maneuver", title: "GEO relocation", description: "Relocated 2° east to new slot. Purpose unclear.", severity: "nominal" },
    ],
  },
  {
    id: "foreign-4",
    name: "LUCH / OLYMP-K",
    noradId: 40258,
    owner: "Russian MOD",
    country: "CIS",
    severity: "watched",
    orbitType: "GEO",
    altitude_km: 35786,
    threatScore: 0.72,
    assessedMission: "SIGINT collection — repeated co-location with Western GEO MILSATCOM",
    recentEvents: [
      { id: "ev-8", timestamp: Date.now() - 259200000, type: "signal", title: "Co-location with SENTINEL-1 relay", description: "Positioned within 0.1° of SENTINEL-1 GEO relay node. Interception probability 34%.", severity: "watched" },
    ],
  },
  {
    id: "foreign-6",
    name: "YAOGAN-30D",
    noradId: 43034,
    owner: "PLA SSF",
    country: "PRC",
    severity: "watched",
    orbitType: "LEO",
    altitude_km: 600,
    threatScore: 0.62,
    assessedMission: "ELINT triplet constellation — signals intelligence collection",
    recentEvents: [
      { id: "ev-9", timestamp: Date.now() - 1800000, type: "anomaly", title: "Antenna pointing change", description: "Antenna redirected 15° from nadir, now aligned with GUARDIAN-3 orbital plane.", severity: "watched" },
    ],
  },
]

/* ═══════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════ */

function timeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return `${Math.floor(diffHrs / 24)}d ago`
}

const EVENT_ICONS: Record<AdversaryEvent["type"], typeof Activity> = {
  maneuver: Activity,
  proximity: Crosshair,
  signal: Satellite,
  anomaly: AlertTriangle,
  launch: ExternalLink,
}

function ThreatScoreBar({ score }: { score: number }) {
  const pct = score * 100
  const color = score > 0.8 ? "bg-red-500" : score > 0.5 ? "bg-amber-500" : "bg-cyan-500"
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("font-mono text-xs font-semibold tabular-nums", score > 0.8 ? "text-red-400" : score > 0.5 ? "text-amber-400" : "text-cyan-400")}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */

/* Keywords that trigger deep research from the chat */
const DEEP_RESEARCH_TRIGGERS = [
  "deep research", "run research", "investigate further",
  "full analysis", "generate dossier", "research this",
  "dig deeper", "go deeper", "more research",
]

function isDeepResearchRequest(msg: string): boolean {
  const lower = msg.toLowerCase()
  return DEEP_RESEARCH_TRIGGERS.some((t) => lower.includes(t))
}

export function AdversaryOps() {
  const selectedAdversaryId = useUIStore((s) => s.selectedAdversaryId)
  const openAdversaryDetail = useUIStore((s) => s.openAdversaryDetail)

  // Persisted store
  const getResearch = useAdversaryStore((s) => s.getResearch)
  const setReport = useAdversaryStore((s) => s.setReport)
  const appendToReport = useAdversaryStore((s) => s.appendToReport)
  const appendLog = useAdversaryStore((s) => s.appendLog)
  const clearLogs = useAdversaryStore((s) => s.clearLogs)
  const appendChatMessage = useAdversaryStore((s) => s.appendChatMessage)
  const storeResearch = useAdversaryStore((s) => s.research)

  const [selectedId, setSelectedId] = useState<string>(selectedAdversaryId ?? DUMMY_ADVERSARIES[0].id)
  const [researchRunning, setResearchRunning] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)

  const chatScrollRef = useRef<HTMLDivElement>(null)
  const researchLogRef = useRef<HTMLDivElement>(null)
  const researchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Derived from store
  const satResearch = storeResearch[selectedId]
  const researchReport = satResearch?.report ?? null
  const researchLogs = satResearch?.logs ?? []
  const messages = satResearch?.chatMessages ?? []

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    researchLogRef.current?.scrollTo({ top: researchLogRef.current.scrollHeight, behavior: "smooth" })
  }, [researchLogs])

  // Sync store selection
  useEffect(() => {
    if (selectedAdversaryId) setSelectedId(selectedAdversaryId)
  }, [selectedAdversaryId])

  // Cleanup interval on unmount
  useEffect(() => {
    return () => { if (researchIntervalRef.current) clearInterval(researchIntervalRef.current) }
  }, [])

  const selected = DUMMY_ADVERSARIES.find((a) => a.id === selectedId) ?? DUMMY_ADVERSARIES[0]

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    openAdversaryDetail(id)
  }, [openAdversaryDetail])

  // Build the report content for a satellite (initial or follow-up)
  const buildInitialReport = useCallback((sat: typeof DUMMY_ADVERSARIES[number]) => {
    return (
      `## Intelligence Dossier: ${sat.name}\n\n` +
      `**NORAD ID:** ${sat.noradId}  \n` +
      `**Operator:** ${sat.owner}  \n` +
      `**Country:** ${sat.country}  \n` +
      `**Orbit:** ${sat.orbitType} — ${sat.altitude_km} km  \n\n` +
      `### Assessed Mission\n${sat.assessedMission}\n\n` +
      `### Threat Assessment\n` +
      `**Threat Score:** ${(sat.threatScore * 100).toFixed(0)}%  \n` +
      `**Key Concerns:**\n` +
      `- Demonstrated maneuvering capability with ${sat.recentEvents.filter(e => e.type === "maneuver").length} recent orbital adjustments\n` +
      `- Behavioral pattern consistent with counter-space / inspection operations\n` +
      `- Operated by ${sat.owner}, which has documented ASAT testing history\n\n` +
      `### Behavioral History\n` +
      `14 maneuvers detected over 12 months. Average maneuver interval: 26 days. ` +
      `Delta-v budget estimated at 120-180 m/s remaining based on bus class assessment.\n\n` +
      `### Program Context\n` +
      `Part of a broader counter-space program. Related satellites include ` +
      `multiple inspector/servicing-class vehicles deployed since 2019.\n\n` +
      `### Recommended Monitoring\n` +
      `- Maintain continuous tracking with 15-minute TLE updates\n` +
      `- Alert on any maneuver reducing miss distance below 5 km to protected assets\n` +
      `- Cross-reference with RF emission data for active sensor sweeps`
    )
  }, [])

  const buildFollowUpReport = useCallback((sat: typeof DUMMY_ADVERSARIES[number], query: string) => {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z"
    return (
      `### Follow-up Research — ${ts}\n` +
      `**Query:** ${query}\n\n` +
      `Analysis of ${sat.name} regarding "${query}":\n\n` +
      `Based on updated intelligence from Space-Track and open-source analysis, ${sat.name} ` +
      `continues to exhibit behavior consistent with ${sat.assessedMission.split("—")[0].trim().toLowerCase()}. ` +
      `Cross-referencing recent TLE data with historical maneuver patterns reveals ` +
      `${sat.recentEvents.length} notable events in the current monitoring period.\n\n` +
      `Key findings from follow-up analysis:\n` +
      `- Orbital parameters remain within expected range for active ${sat.orbitType} operations\n` +
      `- Maneuver cadence suggests ongoing operational tasking by ${sat.owner}\n` +
      `- Threat score ${sat.threatScore > 0.7 ? "remains elevated" : "is stable"} at ${(sat.threatScore * 100).toFixed(0)}%\n` +
      `- Recommend continued monitoring with emphasis on the queried aspect`
    )
  }, [])

  // Core research runner — used by both button and chat
  const runResearch = useCallback((isFollowUp: boolean, chatQuery?: string) => {
    if (researchRunning) return
    setResearchRunning(true)
    clearLogs(selectedId)

    const sat = selected
    const satId = selectedId
    const prefix = isFollowUp ? "Follow-up: " : ""

    const steps = [
      `${prefix}Querying Space-Track SATCAT for catalog metadata...`,
      `${prefix}Found: ${sat.name} (NORAD ${sat.noradId}) — ${sat.country} payload`,
      `${prefix}Fetching 12-month TLE history from Space-Track GP_History...`,
      `${prefix}Detected 14 maneuvers over 12 months (avg interval: 26 days)`,
      `${prefix}Searching Perplexity: ${chatQuery ?? "military significance of " + sat.name}...`,
      `${prefix}Searching Perplexity: ${sat.owner} counter-space capabilities...`,
      `${prefix}Searching Perplexity: recent ${sat.name} orbital activity...`,
      `${prefix}Cross-referencing UCS Satellite Database for mission classification...`,
      `${prefix}Analyzing maneuver patterns for threat correlation...`,
      `${prefix}${isFollowUp ? "Appending follow-up analysis to dossier..." : "Generating intelligence dossier..."}`,
    ]

    let i = 0
    if (researchIntervalRef.current) clearInterval(researchIntervalRef.current)

    researchIntervalRef.current = setInterval(() => {
      if (i < steps.length) {
        appendLog(satId, steps[i])
        i++
      } else {
        if (researchIntervalRef.current) clearInterval(researchIntervalRef.current)
        researchIntervalRef.current = null
        setResearchRunning(false)

        if (isFollowUp) {
          const followUp = buildFollowUpReport(sat, chatQuery ?? "general follow-up")
          appendToReport(satId, followUp)
        } else {
          const report = buildInitialReport(sat)
          // If there's already a report, append; otherwise set fresh
          const existing = getResearch(satId).report
          if (existing) {
            appendToReport(satId, `\n---\n\n### Updated Analysis — ${new Date().toISOString().replace("T", " ").slice(0, 19)}Z\n\n` +
              `Re-ran full deep research. Previous findings confirmed and expanded.`)
          } else {
            setReport(satId, report)
          }
        }

        // If this was triggered from chat, send a confirmation message
        if (chatQuery) {
          appendChatMessage(satId, {
            role: "assistant",
            content: `Deep research complete. I've appended the findings for "${chatQuery}" to the intelligence dossier. You can see the updated report in the center panel.`,
          })
        }
      }
    }, 800)
  }, [researchRunning, selected, selectedId, clearLogs, appendLog, setReport, appendToReport, getResearch, buildInitialReport, buildFollowUpReport, appendChatMessage])

  const handleRunResearch = useCallback(() => {
    runResearch(false)
  }, [runResearch])

  // Chat handler — detects deep research requests
  const handleChatSend = useCallback(() => {
    const msg = chatInput.trim()
    if (!msg || isLoading || researchRunning) return

    appendChatMessage(selectedId, { role: "user", content: msg })
    setChatInput("")

    // Check if this is a deep research request
    if (isDeepResearchRequest(msg)) {
      appendChatMessage(selectedId, {
        role: "assistant",
        content: `Initiating deep research on ${selected.name}. I'll query Space-Track, Perplexity, and open-source intelligence. Watch the research log in the center panel — findings will be appended to the dossier.`,
      })
      // Small delay so the user sees the chat message before logs start
      setTimeout(() => runResearch(true, msg), 600)
      return
    }

    // Normal chat response
    setIsLoading(true)
    setTimeout(() => {
      const hasReport = !!getResearch(selectedId).report
      let response: string

      if (hasReport) {
        response = `Based on the intelligence dossier for ${selected.name}: this satellite has demonstrated ${selected.threatScore > 0.7 ? "significant" : "moderate"} counter-space capabilities. Its recent behavior pattern is consistent with ${selected.assessedMission.split("—")[0].trim().toLowerCase()}. ${
          msg.toLowerCase().includes("threat") ? `The current threat score is ${(selected.threatScore * 100).toFixed(0)}%.` : ""
        } If you want me to dig deeper on a specific aspect, just say "deep research" followed by your question.`
      } else {
        response = `I don't have a deep research dossier on ${selected.name} yet. I can tell you it's a ${selected.country} ${selected.orbitType} payload operated by ${selected.owner}. Say "run deep research" and I'll generate a full intelligence dossier.`
      }

      appendChatMessage(selectedId, { role: "assistant", content: response })
      setIsLoading(false)
    }, 1500)
  }, [chatInput, isLoading, researchRunning, selected, selectedId, appendChatMessage, getResearch, runResearch])

  const handleChatKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend() }
  }, [handleChatSend])

  return (
    <div className="grid h-full w-full grid-cols-[320px_1fr_380px] gap-4">
      {/* ═══ LEFT: Threat List ═══ */}
      <div data-ops-panel className="pointer-events-auto flex flex-col overflow-hidden rounded-l-sm rounded-r-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
        <div className="border-b border-border/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
              Adversary Tracker
            </h2>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Foreign satellite intelligence & threat monitoring
          </p>
        </div>

        {/* Search */}
        <div className="border-b border-border/40 px-4 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search adversaries..."
              className="flex-1 bg-transparent font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none"
            />
          </div>
        </div>

        {/* Threat queue */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-2">
            {DUMMY_ADVERSARIES.map((adv) => (
              <button
                key={adv.id}
                type="button"
                onClick={() => handleSelect(adv.id)}
                className={cn(
                  "w-full rounded-md border px-3 py-2.5 text-left transition-all",
                  selectedId === adv.id
                    ? "border-primary/50 bg-primary/10"
                    : "border-transparent hover:bg-secondary/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThreatBadge severity={adv.severity} />
                    <span className="font-mono text-[10px] font-medium text-foreground truncate">
                      {adv.name}
                    </span>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="font-mono text-[9px] text-muted-foreground">{adv.country}</span>
                  <span className="font-mono text-[9px] text-muted-foreground">•</span>
                  <span className="font-mono text-[9px] text-muted-foreground">{adv.orbitType} {adv.altitude_km.toFixed(0)} km</span>
                </div>
                <div className="mt-1.5">
                  <ThreatScoreBar score={adv.threatScore} />
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ═══ CENTER: Events + Research ═══ */}
      <div data-ops-panel className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
        {/* Satellite header */}
        <div className="border-b border-border/40 px-5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ThreatBadge severity={selected.severity} />
                <h2 className="font-mono text-sm font-semibold text-foreground">{selected.name}</h2>
                <span className="font-mono text-[10px] text-muted-foreground">NORAD {selected.noradId}</span>
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {selected.owner} — {selected.country} • {selected.orbitType} {selected.altitude_km.toFixed(0)} km
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Threat Score</div>
              <div className="mt-0.5 w-32">
                <ThreatScoreBar score={selected.threatScore} />
              </div>
            </div>
          </div>
          <p className="mt-2 rounded-md border border-border/30 bg-secondary/20 px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
            <Shield className="mr-1.5 inline h-3 w-3 text-primary/60" />
            {selected.assessedMission}
          </p>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-5 space-y-6">
            {/* Recent Events */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-primary/60" />
                <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Recent Events
                </h3>
                <span className="font-mono text-[9px] text-muted-foreground/50">
                  ({selected.recentEvents.length})
                </span>
              </div>
              <div className="space-y-2">
                {selected.recentEvents.map((ev) => {
                  const Icon = EVENT_ICONS[ev.type]
                  const isExpanded = expandedEvent === ev.id
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setExpandedEvent(isExpanded ? null : ev.id)}
                      className={cn(
                        "w-full rounded-md border p-3 text-left transition-all",
                        isExpanded ? "border-primary/40 bg-primary/5" : "border-border/30 bg-secondary/20 hover:bg-secondary/30"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", ev.severity === "threatened" ? "text-red-400" : "text-amber-400")} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-medium text-foreground">{ev.title}</span>
                            <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{timeAgo(ev.timestamp)}</span>
                          </div>
                          {isExpanded && (
                            <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                              {ev.description}
                            </p>
                          )}
                        </div>
                        <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform", isExpanded && "rotate-180")} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Deep Research Section */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-cyan-400" />
                  <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Deep Research
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleRunResearch}
                  disabled={researchRunning}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all",
                    researchRunning
                      ? "border-cyan-500/30 text-cyan-400/60 cursor-wait"
                      : "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
                  )}
                >
                  {researchRunning ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Researching...</>
                  ) : researchReport ? (
                    <><Search className="h-3.5 w-3.5" /> Re-run Research</>
                  ) : (
                    <><Search className="h-3.5 w-3.5" /> Run Deep Research</>
                  )}
                </button>
              </div>

              {/* Research log stream */}
              {researchLogs.length > 0 && (
                <div
                  ref={researchLogRef}
                  className="mb-3 max-h-[140px] overflow-y-auto rounded-md border border-border/30 bg-black/30 p-3"
                >
                  {researchLogs.map((log, i) => (
                    <div key={i} className="flex gap-2 py-0.5">
                      <span className="shrink-0 font-mono text-[9px] text-cyan-500/60">
                        [{String(i + 1).padStart(2, "0")}]
                      </span>
                      <span className="font-mono text-[10px] text-cyan-300/80">{log}</span>
                    </div>
                  ))}
                  {researchRunning && (
                    <div className="flex items-center gap-2 py-0.5">
                      <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                      <span className="font-mono text-[10px] text-cyan-400/60">Processing...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Research report */}
              {researchReport && (
                <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="prose prose-invert prose-sm max-w-none">
                    {researchReport.split("\n").map((line, i) => {
                      if (line.startsWith("## ")) return <h2 key={i} className="mb-2 mt-0 font-mono text-sm font-bold text-foreground">{line.replace("## ", "")}</h2>
                      if (line.startsWith("### ")) return <h3 key={i} className="mb-1.5 mt-3 font-mono text-xs font-semibold text-cyan-400">{line.replace("### ", "")}</h3>
                      if (line.startsWith("**") && line.includes(":**")) {
                        const [label, ...rest] = line.split(":**")
                        return <p key={i} className="my-0.5 font-mono text-[10px] text-foreground"><strong className="text-foreground">{label.replace(/\*\*/g, "")}:</strong> {rest.join(":**").replace(/\*\*/g, "").replace(/\s\s$/,"")}</p>
                      }
                      if (line.startsWith("- ")) return <p key={i} className="my-0.5 pl-3 font-mono text-[10px] text-muted-foreground">• {line.replace("- ", "")}</p>
                      if (line.trim() === "") return <div key={i} className="h-2" />
                      return <p key={i} className="my-0.5 font-mono text-[10px] leading-relaxed text-muted-foreground">{line}</p>
                    })}
                  </div>
                </div>
              )}

              {!researchReport && !researchRunning && (
                <div className="rounded-md border border-dashed border-border/30 bg-secondary/10 p-6 text-center">
                  <FileText className="mx-auto h-8 w-8 text-muted-foreground/20" />
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground/40">
                    Run deep research to generate an intelligence dossier on this satellite.
                  </p>
                  <p className="mt-1 font-mono text-[9px] text-muted-foreground/30">
                    Queries Space-Track, Perplexity AI, and open-source intelligence
                  </p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* ═══ RIGHT: Chat ═══ */}
      <div data-ops-panel className="pointer-events-auto flex flex-col overflow-hidden rounded-r-sm rounded-l-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
        <div className="flex items-center gap-2.5 border-b border-border/40 px-5 py-3">
          <Bot className="h-4 w-4 text-primary/60" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Intelligence Analyst
          </span>
        </div>

        {/* Messages */}
        <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-2 p-4">
            {messages.length === 0 && (
              <div className="flex gap-3 py-4">
                <Shield className="h-5 w-5 shrink-0 text-primary/40 mt-0.5" />
                <div className="font-mono text-[11px] text-muted-foreground/60 leading-relaxed">
                  Ask me anything about <strong className="text-foreground/80">{selected.name}</strong> — capabilities, threat assessment, historical behavior, or related programs.
                  <br />
                  <span className="text-muted-foreground/40">e.g. &ldquo;What is the assessed delta-v budget?&rdquo;</span>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2 py-0.5", msg.role === "user" && "justify-end")}>
                {msg.role === "assistant" && <Bot className="h-4 w-4 shrink-0 text-primary/50 mt-1" />}
                <div className={cn(
                  "max-w-[85%] rounded-lg px-3.5 py-2 font-mono text-[11px] leading-relaxed",
                  msg.role === "user" ? "bg-primary/15 text-foreground" : "bg-secondary/30 text-foreground"
                )}>
                  {msg.content}
                </div>
                {msg.role === "user" && <User className="h-4 w-4 shrink-0 text-muted-foreground/40 mt-1" />}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2 py-0.5">
                <Bot className="h-4 w-4 shrink-0 text-primary/50 mt-1" />
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
              placeholder="Ask about this adversary..."
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
                  : "text-muted-foreground/20 cursor-not-allowed"
              )}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

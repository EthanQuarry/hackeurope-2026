"use client"

import { useState } from "react"
import { ShieldAlert, Satellite, GitBranch, ChevronDown, Globe } from "lucide-react"

import { cn } from "@/lib/utils"
import { THREAT_COLORS, type ThreatSeverity } from "@/lib/constants"
import { MOCK_SATELLITES, MOCK_ORBITAL_SIMILARITY_THREATS } from "@/lib/mock-data"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import { useSatellitesWithDerivedStatus } from "@/hooks/use-derived-status"
import type { OrbitalSimilarityThreat } from "@/types"

/* ═══════════════════════════════════════════════════════
   Collapsible Panel Wrapper
   ═══════════════════════════════════════════════════════ */

function CollapsiblePanel({
  icon: Icon,
  iconColor,
  title,
  count,
  defaultOpen = true,
  children,
}: {
  icon: typeof ShieldAlert
  iconColor: string
  title: string
  count: number | string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border border-white/10 bg-card/60 backdrop-blur-xl shadow-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 transition-colors hover:bg-white/[0.03]"
      >
        <Icon className={cn("h-3.5 w-3.5", iconColor)} />
        <h2 className="flex-1 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-300">
          {title}
        </h2>
        <span className="font-mono text-[10px] tabular-nums text-gray-400">{count}</span>
        <ChevronDown className={cn("h-3 w-3 text-gray-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-white/5">{children}</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Active Threats Panel
   ═══════════════════════════════════════════════════════ */

const SEVERITY_ORDER: ThreatSeverity[] = ["threatened", "watched", "nominal"]

function ActiveThreatsPanel() {
  const threats = useThreatStore((s) => s.threats)

  const counts: Record<string, number> = {}
  for (const sev of SEVERITY_ORDER) {
    counts[sev] = threats.filter((t) => t.severity === sev).length
  }

  return (
    <CollapsiblePanel icon={ShieldAlert} iconColor="text-red-400" title="Active Threats" count={threats.length}>
      <div className="space-y-2 p-3">
        {SEVERITY_ORDER.map((sev) => {
          const colors = THREAT_COLORS[sev] ?? THREAT_COLORS.nominal
          return (
            <div key={sev} className="flex items-center gap-3">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors.hex }} />
              <span className="flex-1 font-mono text-[10px] capitalize text-gray-300">{sev}</span>
              <span className="font-mono text-xs font-semibold tabular-nums text-gray-200">{counts[sev] ?? 0}</span>
            </div>
          )
        })}
      </div>
    </CollapsiblePanel>
  )
}

/* ═══════════════════════════════════════════════════════
   Orbital Similarity Panel
   ═══════════════════════════════════════════════════════ */

type OrbitalPattern = OrbitalSimilarityThreat["pattern"]

const PATTERN_ROWS: { label: string; key: OrbitalPattern; hex: string }[] = [
  { label: "Co-Planar", key: "co-planar", hex: "#ff1744" },
  { label: "Co-Altitude", key: "co-altitude", hex: "#ffcc00" },
  { label: "Co-Incl.", key: "co-inclination", hex: "#ffaa00" },
  { label: "Shadowing", key: "shadowing", hex: "#888888" },
]

function OrbitalSimilarityPanel() {
  const store = useThreatStore((s) => s.orbitalSimilarityThreats)
  const threats = store.length > 0 ? store : MOCK_ORBITAL_SIMILARITY_THREATS

  const counts: Record<OrbitalPattern, number> = {
    "co-planar": 0, "co-altitude": 0, "co-inclination": 0, shadowing: 0,
  }
  for (const t of threats) counts[t.pattern]++

  const minDiv = threats.length > 0 ? Math.min(...threats.map((t) => t.divergenceScore)) : null
  const barPct = minDiv !== null ? Math.max(0, (1 - minDiv / 0.8) * 100) : 0
  const barColor = minDiv !== null && minDiv < 0.05 ? "#ff1744" : minDiv !== null && minDiv < 0.15 ? "#ffcc00" : "#00e676"

  return (
    <CollapsiblePanel icon={GitBranch} iconColor="text-amber-400" title="Orbital Similarity" count={threats.length}>
      <div className="space-y-2 p-3">
        {PATTERN_ROWS.map(({ label, key, hex }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
            <span className="flex-1 font-mono text-[10px] text-gray-300">{label}</span>
            <span className="font-mono text-xs font-semibold tabular-nums text-gray-200">{counts[key]}</span>
          </div>
        ))}
      </div>
      {minDiv !== null && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[8px] uppercase tracking-wider text-gray-500">Nearest Match</span>
            <span className="font-mono text-[9px] tabular-nums text-gray-400">{minDiv.toFixed(4)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
          </div>
        </div>
      )}
    </CollapsiblePanel>
  )
}

/* ═══════════════════════════════════════════════════════
   GEO-US Loiter Panel — Chinese/Russian sats over US
   ═══════════════════════════════════════════════════════ */

function GeoLoiterPanel() {
  const threats = useThreatStore((s) => s.geoUsLoiterThreats)
  const threatened = threats.filter((t) => t.severity === "threatened").length
  const watched = threats.filter((t) => t.severity === "watched").length
  const nominal = threats.filter((t) => t.severity === "nominal").length

  return (
    <CollapsiblePanel icon={Globe} iconColor="text-orange-400" title="GEO-US Loiter" count={threats.length}>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
          <span className="flex-1 font-mono text-[10px] text-gray-300">Threatened</span>
          <span className="font-mono text-xs font-semibold tabular-nums text-gray-200">{threatened}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          <span className="flex-1 font-mono text-[10px] text-gray-300">Watched</span>
          <span className="font-mono text-xs font-semibold tabular-nums text-gray-200">{watched}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-gray-500" />
          <span className="flex-1 font-mono text-[10px] text-gray-300">Nominal</span>
          <span className="font-mono text-xs font-semibold tabular-nums text-gray-200">{nominal}</span>
        </div>
        {threats.length > 0 && (
          <div className="border-t border-white/5 pt-2 mt-2">
            <span className="font-mono text-[8px] uppercase tracking-wider text-gray-500">
              PRC/CIS GEO over US sector
            </span>
          </div>
        )}
      </div>
    </CollapsiblePanel>
  )
}

/* ═══════════════════════════════════════════════════════
   Fleet Overview Panel
   ═══════════════════════════════════════════════════════ */

type FleetCategory = "friendly" | "nominal" | "watched" | "threatened"

const FLEET_CATEGORIES: { label: string; key: FleetCategory }[] = [
  { label: "Friendly", key: "friendly" },
  { label: "Nominal", key: "nominal" },
  { label: "Watched", key: "watched" },
  { label: "Threatened", key: "threatened" },
]

function FleetOverviewPanel() {
  const satellites = useSatellitesWithDerivedStatus(MOCK_SATELLITES)
  const total = satellites.length

  const counts: Record<string, number> = {}
  for (const cat of FLEET_CATEGORIES) {
    counts[cat.key] = satellites.filter((s) => s.status === cat.key).length
  }

  return (
    <CollapsiblePanel icon={Satellite} iconColor="text-cyan-400" title="Fleet Overview" count={total}>
      <div className="space-y-2.5 p-3">
        {FLEET_CATEGORIES.map(({ label, key }) => {
          const count = counts[key] ?? 0
          const pct = total > 0 ? (count / total) * 100 : 0
          const colors = THREAT_COLORS[key] ?? THREAT_COLORS.nominal
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-gray-400">{label}</span>
                <span className="font-mono text-xs font-semibold tabular-nums text-gray-200">{count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: colors.hex }} />
              </div>
            </div>
          )
        })}
      </div>
    </CollapsiblePanel>
  )
}

/* ═══════════════════════════════════════════════════════
   Combined Export — vertical stack
   ═══════════════════════════════════════════════════════ */

export function StatsCards({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-auto flex flex-col gap-2 w-[280px]", className)}>
      <ActiveThreatsPanel />
      <OrbitalSimilarityPanel />
      <GeoLoiterPanel />
      <FleetOverviewPanel />
    </div>
  )
}

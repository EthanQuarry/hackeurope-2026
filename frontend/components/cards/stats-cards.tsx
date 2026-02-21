"use client"

import { ShieldAlert, Satellite, GitBranch } from "lucide-react"

import { cn } from "@/lib/utils"
import { THREAT_COLORS, type ThreatSeverity } from "@/lib/constants"
import { MOCK_SATELLITES, MOCK_ORBITAL_SIMILARITY_THREATS } from "@/lib/mock-data"
import { useThreatStore } from "@/stores/threat-store"
import type { OrbitalSimilarityThreat } from "@/types"

// ── Active Threats Card ──

const SEVERITY_ORDER: ThreatSeverity[] = ["threatened", "watched", "nominal"]

function ActiveThreatsCard() {
  const threats = useThreatStore((s) => s.threats)

  const counts: Record<string, number> = {}
  for (const sev of SEVERITY_ORDER) {
    counts[sev] = threats.filter((t) => t.severity === sev).length
  }

  return (
    <div className="pointer-events-auto w-[260px] rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <ShieldAlert className="h-4 w-4 text-red-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
          Active Threats
        </h2>
        <span className="ml-auto font-mono text-xs text-gray-400">{threats.length}</span>
      </div>

      <div className="space-y-2.5 p-4">
        {SEVERITY_ORDER.map((sev) => {
          const colors = THREAT_COLORS[sev]
          return (
            <div key={sev} className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colors.hex }}
              />
              <span className="flex-1 text-xs capitalize text-gray-300">{sev}</span>
              <span className="font-mono text-sm font-semibold text-gray-200">
                {counts[sev] ?? 0}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Fleet Overview Card ──

type FleetCategory = "friendly" | "nominal" | "watched" | "threatened"

const FLEET_CATEGORIES: { label: string; key: FleetCategory }[] = [
  { label: "Friendly", key: "friendly" },
  { label: "Nominal", key: "nominal" },
  { label: "Watched", key: "watched" },
  { label: "Threatened", key: "threatened" },
]

function FleetOverviewCard() {
  const total = MOCK_SATELLITES.length

  const counts: Record<string, number> = {}
  for (const cat of FLEET_CATEGORIES) {
    counts[cat.key] = MOCK_SATELLITES.filter((s) => s.status === cat.key).length
  }

  return (
    <div className="pointer-events-auto w-[260px] rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <Satellite className="h-4 w-4 text-cyan-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
          Fleet Overview
        </h2>
        <span className="ml-auto font-mono text-xs text-gray-400">{total}</span>
      </div>

      <div className="space-y-3 p-4">
        {FLEET_CATEGORIES.map(({ label, key }) => {
          const count = counts[key] ?? 0
          const pct = total > 0 ? (count / total) * 100 : 0
          const colors = THREAT_COLORS[key]

          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{label}</span>
                <span className="font-mono text-xs font-semibold text-gray-200">{count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: colors.hex,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Orbital Similarity Card ──

type OrbitalPattern = OrbitalSimilarityThreat["pattern"]

const PATTERN_ROWS: { label: string; key: OrbitalPattern; hex: string }[] = [
  { label: "Co-Planar",    key: "co-planar",       hex: "#ff1744" },
  { label: "Co-Altitude",  key: "co-altitude",     hex: "#ffcc00" },
  { label: "Co-Incl.",     key: "co-inclination",  hex: "#ffaa00" },
  { label: "Shadowing",    key: "shadowing",        hex: "#888888" },
]

function OrbitalSimilarityCard() {
  const store = useThreatStore((s) => s.orbitalSimilarityThreats)
  const threats = store.length > 0 ? store : MOCK_ORBITAL_SIMILARITY_THREATS

  const counts: Record<OrbitalPattern, number> = {
    "co-planar": 0,
    "co-altitude": 0,
    "co-inclination": 0,
    shadowing: 0,
  }
  for (const t of threats) counts[t.pattern]++

  const minDiv = threats.length > 0
    ? Math.min(...threats.map((t) => t.divergenceScore))
    : null

  // Bar fill: divergence 0 → full bar (identical), 0.8+ → empty
  const barPct = minDiv !== null ? Math.max(0, (1 - minDiv / 0.8) * 100) : 0
  const barColor = minDiv !== null && minDiv < 0.05 ? "#ff1744" : minDiv !== null && minDiv < 0.15 ? "#ffcc00" : "#00e676"

  return (
    <div className="pointer-events-auto w-[260px] rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <GitBranch className="h-4 w-4 text-amber-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
          Orbital Similarity
        </h2>
        <span className="ml-auto font-mono text-xs text-gray-400">{threats.length}</span>
      </div>

      <div className="space-y-2.5 p-4">
        {PATTERN_ROWS.map(({ label, key, hex }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
            <span className="flex-1 text-xs text-gray-300">{label}</span>
            <span className="font-mono text-sm font-semibold text-gray-200">{counts[key]}</span>
          </div>
        ))}
      </div>

      {minDiv !== null && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Nearest Match
            </span>
            <span className="font-mono text-[10px] text-gray-400">{minDiv.toFixed(4)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${barPct}%`, backgroundColor: barColor }}
            />
          </div>
          <p className="mt-1 text-[10px] text-gray-600">divergence score (lower = more similar)</p>
        </div>
      )}
    </div>
  )
}

// ── Combined export ──

export function StatsCards({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-end gap-3", className)}>
      <ActiveThreatsCard />
      <OrbitalSimilarityCard />
      <FleetOverviewCard />
    </div>
  )
}

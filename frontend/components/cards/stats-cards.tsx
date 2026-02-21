"use client"

import { ShieldAlert, Satellite } from "lucide-react"

import { cn } from "@/lib/utils"
import { THREAT_COLORS, type ThreatSeverity } from "@/lib/constants"
import { MOCK_SATELLITES } from "@/lib/mock-data"
import { useThreatStore } from "@/stores/threat-store"

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

// ── Combined export ──

export function StatsCards({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-end gap-4", className)}>
      <ActiveThreatsCard />
      <FleetOverviewCard />
    </div>
  )
}

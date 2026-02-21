"use client"

import { useState, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { cn } from "@/lib/utils"
import { useThreatStore } from "@/stores/threat-store"
import type { ProximityThreat } from "@/types"

interface ProximityOpsProps {
  threats: ProximityThreat[]
}

const SEVERITY_ORDER: Record<string, number> = { threatened: 0, watched: 1, nominal: 2, allied: 3, friendly: 3 }

const PATTERN_LABELS: Record<ProximityThreat["approachPattern"], string> = {
  "co-orbital": "CO-ORBITAL",
  "sun-hiding": "SUN-HIDING",
  direct: "DIRECT",
  drift: "DRIFT",
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
  if (km < 10_000) return `${km.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} km`
  if (km < 1_000_000) return `${(km / 1000).toFixed(1)}k km`
  return `${(km / 1_000_000).toFixed(2)}M km`
}

function StatBox({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className={cn(
      "rounded-md border px-3 py-2",
      alert ? "border-red-500/40 bg-red-500/10" : "border-border/40 bg-secondary/30"
    )}>
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono text-lg tabular-nums font-semibold", alert ? "text-red-400" : "text-foreground")}>
        {value}
      </div>
    </div>
  )
}

function DataRow({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/20 py-2.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-sm tabular-nums", alert ? "text-red-400 font-semibold" : "text-foreground")}>
        {value}
      </span>
    </div>
  )
}

export function ProximityOps({ threats }: ProximityOpsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(threats[0]?.id ?? null)
  const setFocusTarget = useThreatStore((s) => s.setFocusTarget)

  const handleSelect = useCallback((threat: ProximityThreat) => {
    setSelectedId(threat.id)
    setFocusTarget({ ...threat.primaryPosition, satelliteId: threat.foreignSatId })
  }, [setFocusTarget])

  const sorted = [...threats].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return a.tcaInMinutes - b.tcaInMinutes
  })

  const selected = sorted.find((t) => t.id === selectedId) ?? sorted[0]
  const criticalCount = sorted.filter((t) => t.severity === "threatened").length
  const closestDist = sorted.length > 0 ? Math.min(...sorted.map((t) => t.missDistanceKm)) : 0

  return (
    <div className="mx-auto grid h-full w-full max-w-[1600px] grid-cols-[22rem_minmax(0,1fr)_22rem] gap-4">
      {/* Left panel — header + KPIs + queue */}
      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-l-sm rounded-r-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
        {/* Header */}
        <div className="border-b border-border/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
              Proximity Inspection
            </h2>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Attack positioning & approach pattern detection
          </p>
        </div>

        {/* KPI Stats */}
        <div className="grid grid-cols-3 gap-2 border-b border-border/40 p-4">
          <StatBox label="Active" value={sorted.length} />
          <StatBox label="Critical" value={criticalCount} alert={criticalCount > 0} />
          <StatBox label="Closest" value={formatDistance(closestDist)} alert={closestDist < 5} />
        </div>

        {/* Threat Queue */}
        <div className="border-b border-border/40 px-5 py-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            Threat Queue
          </span>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-2">
            {sorted.map((threat) => (
              <button
                key={threat.id}
                type="button"
                onClick={() => handleSelect(threat)}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left transition-all",
                  selectedId === threat.id
                    ? "border-primary/50 bg-primary/10"
                    : "border-transparent hover:bg-secondary/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ThreatBadge severity={threat.severity} />
                    <span className="font-mono text-[10px] font-medium text-foreground">
                      {threat.foreignSatName}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {formatDistance(threat.missDistanceKm)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">→ {threat.targetAssetName}</span>
                  <span className={cn(
                    "rounded px-1 py-0.5 font-mono text-[8px] font-bold uppercase",
                    threat.approachPattern === "sun-hiding"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-secondary/50 text-muted-foreground"
                  )}>
                    {PATTERN_LABELS[threat.approachPattern]}
                  </span>
                  {threat.sunHidingDetected && (
                    <span className="rounded bg-red-500/20 px-1 py-0.5 font-mono text-[8px] font-bold uppercase text-red-400">
                      SUN-HIDE
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Center — globe shows through */}
      <div />

      {/* Right panel — selected threat detail */}
      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-r-sm rounded-l-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
        {selected ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Threat Detail
                </span>
                <ThreatBadge severity={selected.severity} />
              </div>

              <div className="space-y-0">
                <DataRow label="Foreign Asset" value={selected.foreignSatName} />
                <DataRow label="Target Asset" value={selected.targetAssetName} />
                <DataRow label="Miss Distance" value={formatDistance(selected.missDistanceKm)} alert={selected.missDistanceKm < 5} />
                <DataRow label="Approach Velocity" value={`${selected.approachVelocityKms.toFixed(3)} km/s`} />
                <DataRow label="TCA" value={formatTCA(selected.tcaInMinutes)} alert={selected.tcaInMinutes < 30} />
                <DataRow label="Approach Pattern" value={PATTERN_LABELS[selected.approachPattern]} />
                <DataRow label="Sun-Hiding" value={selected.sunHidingDetected ? "DETECTED" : "NEGATIVE"} alert={selected.sunHidingDetected} />
                <DataRow label="Confidence" value={`${(selected.confidence * 100).toFixed(0)}%`} />
              </div>

              {/* Confidence bar */}
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                <div
                  className="h-full rounded-full bg-primary/70 transition-all"
                  style={{ width: `${selected.confidence * 100}%` }}
                />
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-1 items-center justify-center p-4">
            <p className="text-xs text-muted-foreground">No threat selected</p>
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

import { useState, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { cn } from "@/lib/utils"
import { useThreatStore } from "@/stores/threat-store"
import type { OrbitalSimilarityThreat, OrbitElements } from "@/types"

interface OrbitalOpsProps {
  threats: OrbitalSimilarityThreat[]
}

const SEVERITY_ORDER: Record<string, number> = { threatened: 0, watched: 1, nominal: 2, allied: 3, friendly: 3 }

const PATTERN_LABELS: Record<OrbitalSimilarityThreat["pattern"], string> = {
  "co-planar": "CO-PLANAR",
  "co-altitude": "CO-ALTITUDE",
  "co-inclination": "CO-INCLINATION",
  shadowing: "SHADOWING",
}

const PATTERN_COLORS: Record<OrbitalSimilarityThreat["pattern"], string> = {
  "co-planar": "bg-red-500/20 text-red-400",
  "co-altitude": "bg-amber-500/20 text-amber-400",
  "co-inclination": "bg-amber-500/20 text-amber-400",
  shadowing: "bg-secondary/50 text-muted-foreground",
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

/* ── Side-by-side orbital element comparison row ── */

function OrbitCompareRow({
  label,
  unit,
  foreignVal,
  targetVal,
  delta,
  alert,
}: {
  label: string
  unit: string
  foreignVal: string
  targetVal: string
  delta: string
  alert?: boolean
}) {
  return (
    <div className="grid grid-cols-[1fr_5rem_1fr] items-center gap-1 border-b border-border/20 py-2">
      {/* Foreign value — left-aligned, red-tinted */}
      <div className="text-left">
        <span className="font-mono text-[11px] tabular-nums font-semibold text-red-400">
          {foreignVal}
        </span>
        <span className="ml-1 font-mono text-[8px] text-muted-foreground/50">{unit}</span>
      </div>
      {/* Label + delta — centered */}
      <div className="flex flex-col items-center">
        <span className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground/60">{label}</span>
        <span className={cn(
          "font-mono text-[9px] tabular-nums font-bold",
          alert ? "text-amber-400" : "text-muted-foreground",
        )}>
          Δ{delta}
        </span>
      </div>
      {/* Target value — right-aligned, cyan-tinted */}
      <div className="text-right">
        <span className="font-mono text-[8px] text-muted-foreground/50">{unit} </span>
        <span className="font-mono text-[11px] tabular-nums font-semibold text-cyan-400">
          {targetVal}
        </span>
      </div>
    </div>
  )
}

export function OrbitalOps({ threats }: OrbitalOpsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(threats[0]?.id ?? null)
  const setFocusTarget = useThreatStore((s) => s.setFocusTarget)

  const handleSelect = useCallback((threat: OrbitalSimilarityThreat) => {
    setSelectedId(threat.id)
    setFocusTarget({ ...threat.position, satelliteId: threat.foreignSatId })
  }, [setFocusTarget])

  const sorted = [...threats].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return a.divergenceScore - b.divergenceScore
  })

  const selected = sorted.find((t) => t.id === selectedId) ?? sorted[0]
  const criticalCount = sorted.filter((t) => t.severity === "threatened").length
  const mostSimilar = sorted.length > 0 ? sorted[0].divergenceScore : 1

  return (
    <div className="mx-auto grid h-full w-full max-w-[1600px] grid-cols-[22rem_minmax(0,1fr)_22rem] gap-4">
      {/* Left panel — header + KPIs + queue */}
      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-l-sm rounded-r-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
        {/* Header */}
        <div className="border-b border-border/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
              Orbital Similarity
            </h2>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Co-orbital shadowing & trajectory matching detection
          </p>
        </div>

        {/* KPI Stats */}
        <div className="grid grid-cols-3 gap-2 border-b border-border/40 p-4">
          <StatBox label="Pairs" value={sorted.length} />
          <StatBox label="Critical" value={criticalCount} alert={criticalCount > 0} />
          <StatBox label="Min Div" value={mostSimilar.toFixed(3)} alert={mostSimilar < 0.05} />
        </div>

        {/* Threat Queue */}
        <div className="border-b border-border/40 px-5 py-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            Match Queue
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
                    {(threat.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">→ {threat.targetAssetName}</span>
                  <span className={cn(
                    "rounded px-1 py-0.5 font-mono text-[8px] font-bold uppercase",
                    PATTERN_COLORS[threat.pattern]
                  )}>
                    {PATTERN_LABELS[threat.pattern]}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Center — globe shows through */}
      <div />

      {/* Right panel — selected threat detail with side-by-side comparison */}
      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-r-sm rounded-l-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
        {selected ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
              {/* Header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Orbital Comparison
                </span>
                <ThreatBadge severity={selected.severity} />
              </div>

              {/* Satellite labels — side-by-side header */}
              <div className="grid grid-cols-[1fr_5rem_1fr] items-end gap-1 mb-1">
                <div className="text-left">
                  <div className="font-mono text-[7px] uppercase tracking-wider text-red-400/60">Foreign</div>
                  <div className="font-mono text-[11px] font-semibold text-red-400 truncate" title={selected.foreignSatName}>
                    {selected.foreignSatName}
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <span className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[7px] font-bold uppercase",
                    PATTERN_COLORS[selected.pattern],
                  )}>
                    {PATTERN_LABELS[selected.pattern]}
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[7px] uppercase tracking-wider text-cyan-400/60">Target</div>
                  <div className="font-mono text-[11px] font-semibold text-cyan-400 truncate" title={selected.targetAssetName}>
                    {selected.targetAssetName}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border/40 mb-1" />

              {/* Side-by-side orbital elements */}
              {selected.foreignOrbit && selected.targetOrbit ? (
                <div>
                  <OrbitCompareRow
                    label="Alt"
                    unit="km"
                    foreignVal={selected.foreignOrbit.altitudeKm.toFixed(1)}
                    targetVal={selected.targetOrbit.altitudeKm.toFixed(1)}
                    delta={`${selected.altitudeDiffKm.toFixed(1)} km`}
                    alert={selected.altitudeDiffKm < 20}
                  />
                  <OrbitCompareRow
                    label="Inc"
                    unit="deg"
                    foreignVal={selected.foreignOrbit.inclinationDeg.toFixed(2)}
                    targetVal={selected.targetOrbit.inclinationDeg.toFixed(2)}
                    delta={`${selected.inclinationDiffDeg.toFixed(2)}°`}
                    alert={selected.inclinationDiffDeg < 2}
                  />
                  <OrbitCompareRow
                    label="Period"
                    unit="min"
                    foreignVal={selected.foreignOrbit.periodMin.toFixed(1)}
                    targetVal={selected.targetOrbit.periodMin.toFixed(1)}
                    delta={`${Math.abs(selected.foreignOrbit.periodMin - selected.targetOrbit.periodMin).toFixed(1)} min`}
                  />
                  <OrbitCompareRow
                    label="Vel"
                    unit="km/s"
                    foreignVal={selected.foreignOrbit.velocityKms.toFixed(2)}
                    targetVal={selected.targetOrbit.velocityKms.toFixed(2)}
                    delta={`${Math.abs(selected.foreignOrbit.velocityKms - selected.targetOrbit.velocityKms).toFixed(3)} km/s`}
                  />
                </div>
              ) : (
                /* Fallback for data without orbit elements (e.g. cached/mock) */
                <div className="space-y-0">
                  <div className="flex items-center justify-between border-b border-border/20 py-2.5">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Inclination Δ</span>
                    <span className={cn("font-mono text-sm tabular-nums", selected.inclinationDiffDeg < 2 ? "text-red-400 font-semibold" : "text-foreground")}>
                      {selected.inclinationDiffDeg.toFixed(2)}°
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border/20 py-2.5">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Altitude Δ</span>
                    <span className={cn("font-mono text-sm tabular-nums", selected.altitudeDiffKm < 20 ? "text-red-400 font-semibold" : "text-foreground")}>
                      {selected.altitudeDiffKm.toFixed(1)} km
                    </span>
                  </div>
                </div>
              )}

              {/* Divergence + Confidence stats */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className={cn(
                  "rounded-md border px-3 py-2",
                  selected.divergenceScore < 0.05 ? "border-red-500/40 bg-red-500/10" : "border-border/40 bg-secondary/30",
                )}>
                  <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground">Divergence</div>
                  <div className={cn(
                    "mt-0.5 font-mono text-base tabular-nums font-semibold",
                    selected.divergenceScore < 0.05 ? "text-red-400" : "text-foreground",
                  )}>
                    {selected.divergenceScore.toFixed(4)}
                  </div>
                </div>
                <div className={cn(
                  "rounded-md border px-3 py-2",
                  selected.confidence > 0.6 ? "border-red-500/40 bg-red-500/10" : "border-border/40 bg-secondary/30",
                )}>
                  <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground">Confidence</div>
                  <div className={cn(
                    "mt-0.5 font-mono text-base tabular-nums font-semibold",
                    selected.confidence > 0.6 ? "text-red-400" : "text-foreground",
                  )}>
                    {(selected.confidence * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Bayesian posterior bar */}
              <div className="mt-4 space-y-1">
                <div className="flex justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    Bayesian Posterior
                  </span>
                  <span className="font-mono text-[9px] text-muted-foreground">
                    P(shadowing | orbit)
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${selected.confidence * 100}%`,
                      backgroundColor:
                        selected.confidence > 0.6 ? "#ff1744" :
                        selected.confidence > 0.3 ? "#ffcc00" :
                        "#00e676",
                    }}
                  />
                </div>
                <p className="font-mono text-[9px] text-muted-foreground/60">
                  Bayesian update: log-normal divergence distributions + country prior
                </p>
              </div>

              {/* Visual delta bars */}
              <div className="mt-4 space-y-2">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Orbital Element Delta
                </span>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-20 font-mono text-[9px] text-muted-foreground">Inclination</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/40">
                      <div
                        className="h-full rounded-full bg-amber-400/70 transition-all"
                        style={{ width: `${Math.min(100, (selected.inclinationDiffDeg / 10) * 100)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-[9px] tabular-nums text-muted-foreground">
                      {selected.inclinationDiffDeg.toFixed(2)}°
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-20 font-mono text-[9px] text-muted-foreground">Altitude</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/40">
                      <div
                        className="h-full rounded-full bg-cyan-400/70 transition-all"
                        style={{ width: `${Math.min(100, (selected.altitudeDiffKm / 100) * 100)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-[9px] tabular-nums text-muted-foreground">
                      {selected.altitudeDiffKm.toFixed(1)} km
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-1 items-center justify-center p-4">
            <p className="text-xs text-muted-foreground">No match selected</p>
          </div>
        )}
      </div>
    </div>
  )
}

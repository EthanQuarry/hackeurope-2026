"use client"

import { useMemo, useRef, useState, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import { useFleetRiskStore, type RiskSnapshot } from "@/stores/fleet-risk-store"
import { computeFleetRisk } from "@/lib/fleet-risk"

/* ── Sparkline ─────────────────────────────────────────── */

function RiskSparkline({ snapshots, width, height }: { snapshots: RiskSnapshot[]; width: number; height: number }) {
  if (snapshots.length === 0) {
    return (
      <svg width={width} height={height} className="opacity-30">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeWidth={0.5} strokeDasharray="2,4" />
      </svg>
    )
  }

  const pad = { top: 2, bottom: 2, left: 0, right: 32 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom

  const tMin = snapshots[0].t
  const tMax = snapshots[snapshots.length - 1].t
  const tRange = tMax - tMin || 1

  const points = snapshots.map((s) => ({
    x: pad.left + ((s.t - tMin) / tRange) * plotW,
    y: pad.top + plotH - s.risk * plotH,
    risk: s.risk,
  }))

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ")
  const last = points[points.length - 1]
  const pct = Math.round(last.risk * 100)

  const color =
    last.risk > 0.6 ? "#ff1744" : last.risk > 0.3 ? "#ffc800" : last.risk > 0 ? "#00e676" : "#555"

  return (
    <svg width={width} height={height}>
      <line
        x1={pad.left} y1={pad.top + plotH}
        x2={pad.left + plotW} y2={pad.top + plotH}
        stroke="currentColor" strokeWidth={0.3} className="text-border/40"
      />
      <polygon
        points={`${pad.left},${pad.top + plotH} ${polyline} ${last.x},${pad.top + plotH}`}
        fill={color} fillOpacity={0.08}
      />
      <polyline
        points={polyline}
        fill="none" stroke={color} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={2.5} fill={color} />
      <text x={last.x + 6} y={last.y + 3} fill={color} fontSize={9} fontFamily="monospace" fontWeight={600}>
        {pct}%
      </text>
    </svg>
  )
}

function ResponsiveSparkline({ snapshots, height }: { snapshots: RiskSnapshot[]; height: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(400)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 400
      setWidth(Math.max(100, Math.floor(w)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="w-full">
      <RiskSparkline snapshots={snapshots} width={width} height={height} />
    </div>
  )
}

/* ── Main Component ────────────────────────────────────── */

export function FleetRiskOps() {
  const satellites = useFleetStore((s) => s.satellites)
  const timelines = useFleetRiskStore((s) => s.timelines)

  const proximityThreats = useThreatStore((s) => s.proximityThreats)
  const signalThreats = useThreatStore((s) => s.signalThreats)
  const anomalyThreats = useThreatStore((s) => s.anomalyThreats)
  const orbitalThreats = useThreatStore((s) => s.orbitalSimilarityThreats)
  const geoLoiterThreats = useThreatStore((s) => s.geoUsLoiterThreats)

  const currentRisk = useMemo(
    () => computeFleetRisk(satellites, proximityThreats, signalThreats, anomalyThreats, orbitalThreats, geoLoiterThreats),
    [satellites, proximityThreats, signalThreats, anomalyThreats, orbitalThreats, geoLoiterThreats],
  )

  const sortedSatellites = useMemo(() => {
    return [...satellites].sort((a, b) => {
      const diff = (currentRisk[b.id] ?? 0) - (currentRisk[a.id] ?? 0)
      if (diff !== 0) return diff
      return a.name.localeCompare(b.name)
    })
  }, [satellites, currentRisk])

  const totalSats = satellites.length
  const threatenedCount = satellites.filter((s) => (currentRisk[s.id] ?? 0) > 0.6).length
  const watchedCount = satellites.filter((s) => {
    const r = currentRisk[s.id] ?? 0
    return r > 0.3 && r <= 0.6
  }).length

  return (
    <div className="mx-auto h-full w-full max-w-[1600px]">
      <div
        data-ops-panel
        className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg"
      >
        {/* Header */}
        <div className="border-b border-border/40 px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
                Fleet Risk Analysis
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Total</span>
                <span className="ml-2 font-mono text-sm tabular-nums font-semibold text-foreground">{totalSats}</span>
              </div>
              <div className="text-right">
                <span className="font-mono text-[9px] uppercase tracking-wider text-red-400/70">Threatened</span>
                <span className="ml-2 font-mono text-sm tabular-nums font-semibold text-red-400">{threatenedCount}</span>
              </div>
              <div className="text-right">
                <span className="font-mono text-[9px] uppercase tracking-wider text-yellow-400/70">Watched</span>
                <span className="ml-2 font-mono text-sm tabular-nums font-semibold text-yellow-400">{watchedCount}</span>
              </div>
            </div>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Bayesian posterior risk timeline — max(confidence) across all threat vectors
          </p>
        </div>

        {/* Column headers */}
        <div className="flex items-center border-b border-border/30 px-5 py-1.5">
          <div className="w-[240px] shrink-0">
            <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/50">Satellite</span>
          </div>
          <div className="flex-1 text-right">
            <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/50">
              Risk Timeline (0–100%)
            </span>
          </div>
        </div>

        {/* Scrollable rows */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="divide-y divide-border/20">
            {sortedSatellites.map((sat) => {
              const risk = currentRisk[sat.id] ?? 0
              const snapshots = timelines[sat.id]?.snapshots ?? []

              return (
                <div
                  key={sat.id}
                  className={cn(
                    "flex items-center gap-3 px-5 py-2 transition-colors hover:bg-secondary/20",
                    risk > 0.6 && "bg-red-500/[0.03]",
                  )}
                >
                  {/* Left: satellite info */}
                  <div className="w-[240px] shrink-0">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          risk > 0.6 ? "bg-red-500" :
                          risk > 0.3 ? "bg-yellow-500" :
                          risk > 0 ? "bg-emerald-500" :
                          "bg-muted-foreground/30",
                        )}
                      />
                      <span className="font-mono text-[11px] font-medium text-foreground truncate">
                        {sat.name}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 pl-3.5">
                      <span className="font-mono text-[9px] text-muted-foreground/60">
                        NORAD {sat.noradId}
                      </span>
                      {sat.country_code && (
                        <>
                          <span className="font-mono text-[9px] text-muted-foreground/30">|</span>
                          <span className="font-mono text-[9px] text-muted-foreground/60">{sat.country_code}</span>
                        </>
                      )}
                      <span className="font-mono text-[9px] text-muted-foreground/30">|</span>
                      <span className="font-mono text-[9px] text-muted-foreground/60">
                        {sat.altitude_km.toFixed(0)} km
                      </span>
                    </div>
                  </div>

                  {/* Right: sparkline */}
                  <div className="flex-1 min-w-0">
                    <ResponsiveSparkline snapshots={snapshots} height={32} />
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

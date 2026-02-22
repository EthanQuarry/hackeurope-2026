"use client"

import { useMemo, useRef, useState, useEffect, memo, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import { useFleetRiskStore, type RiskSnapshot } from "@/stores/fleet-risk-store"
import { computeFleetRisk } from "@/lib/fleet-risk"

/* ── Color helper ──────────────────────────────────────── */

function riskColor(risk: number) {
  if (risk > 0.6) return "#ff1744"
  if (risk > 0.3) return "#ffc800"
  if (risk > 0) return "#00e676"
  return "#555"
}

/* ── Downsample to max N points using LTTB-lite ────────── */

function downsample(data: RiskSnapshot[], maxPoints: number): RiskSnapshot[] {
  if (data.length <= maxPoints) return data
  const step = (data.length - 2) / (maxPoints - 2)
  const out: RiskSnapshot[] = [data[0]]
  for (let i = 1; i < maxPoints - 1; i++) {
    const idx = Math.round(1 + i * step)
    out.push(data[Math.min(idx, data.length - 1)])
  }
  out.push(data[data.length - 1])
  return out
}

/* ── Canvas sparkline with per-segment threshold coloring ── */

const CanvasSparkline = memo(function CanvasSparkline({ snapshots, width, height }: { snapshots: RiskSnapshot[]; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    if (snapshots.length === 0) {
      ctx.strokeStyle = "#333"
      ctx.lineWidth = 0.5
      ctx.setLineDash([2, 4])
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()
      return
    }

    const pad = { top: 2, bottom: 2, left: 0, right: 32 }
    const plotW = width - pad.left - pad.right
    const plotH = height - pad.top - pad.bottom
    const baseline = pad.top + plotH

    const tMin = snapshots[0].t
    const tMax = snapshots[snapshots.length - 1].t
    const tRange = tMax - tMin || 1

    const pts = snapshots.map((s) => ({
      x: pad.left + ((s.t - tMin) / tRange) * plotW,
      y: pad.top + plotH - s.risk * plotH,
      risk: s.risk,
    }))

    // Draw baseline
    ctx.strokeStyle = "rgba(255,255,255,0.06)"
    ctx.lineWidth = 0.3
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(pad.left, baseline)
    ctx.lineTo(pad.left + plotW, baseline)
    ctx.stroke()

    // Draw per-segment fills + lines
    ctx.lineWidth = 1.5
    ctx.lineCap = "round"
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]
      const cur = pts[i]
      const color = riskColor((prev.risk + cur.risk) / 2)

      // Fill
      ctx.fillStyle = color
      ctx.globalAlpha = 0.06
      ctx.beginPath()
      ctx.moveTo(prev.x, baseline)
      ctx.lineTo(prev.x, prev.y)
      ctx.lineTo(cur.x, cur.y)
      ctx.lineTo(cur.x, baseline)
      ctx.closePath()
      ctx.fill()

      // Line
      ctx.globalAlpha = 1
      ctx.strokeStyle = color
      ctx.beginPath()
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(cur.x, cur.y)
      ctx.stroke()
    }

    // Current value dot
    const last = pts[pts.length - 1]
    const dotColor = riskColor(last.risk)
    ctx.fillStyle = dotColor
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2)
    ctx.fill()

    // Percentage text
    ctx.font = "600 9px monospace"
    ctx.fillStyle = dotColor
    ctx.fillText(`${Math.round(last.risk * 100)}%`, last.x + 6, last.y + 3)
  }, [snapshots, width, height])

  return <canvas ref={canvasRef} width={width} height={height} style={{ width, height }} />
})

const ResponsiveSparkline = memo(function ResponsiveSparkline({ snapshots, height }: { snapshots: RiskSnapshot[]; height: number }) {
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
      <CanvasSparkline snapshots={snapshots} width={width} height={height} />
    </div>
  )
})

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

  // Alphabetical sort
  const sortedSatellites = useMemo(() => {
    return [...satellites].sort((a, b) => a.name.localeCompare(b.name))
  }, [satellites])

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

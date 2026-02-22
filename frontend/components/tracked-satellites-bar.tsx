"use client"

import { useMemo, useRef, useState, useEffect, memo, useCallback } from "react"
import { cn } from "@/lib/utils"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import { useFleetRiskStore, type RiskSnapshot } from "@/stores/fleet-risk-store"
import { useUIStore } from "@/stores/ui-store"
import { computeFleetRisk } from "@/lib/fleet-risk"
import { THREAT_COLORS } from "@/lib/constants"

/* ── Color helper ── */

function riskColor(risk: number) {
  if (risk > 0.6) return "#ff1744"
  if (risk > 0.3) return "#ffc800"
  if (risk > 0) return "#00e676"
  return "#555"
}

/* ── Mini canvas sparkline ── */

const MiniSparkline = memo(function MiniSparkline({
  snapshots,
  width,
  height,
}: {
  snapshots: RiskSnapshot[]
  width: number
  height: number
}) {
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

    if (snapshots.length < 2) {
      ctx.strokeStyle = "#333"
      ctx.lineWidth = 0.5
      ctx.setLineDash([2, 4])
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()
      return
    }

    const pad = { top: 2, bottom: 2, left: 0, right: 0 }
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

    // Fill under curve
    ctx.lineWidth = 1.2
    ctx.lineCap = "round"
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]
      const cur = pts[i]
      const color = riskColor((prev.risk + cur.risk) / 2)

      ctx.fillStyle = color
      ctx.globalAlpha = 0.08
      ctx.beginPath()
      ctx.moveTo(prev.x, baseline)
      ctx.lineTo(prev.x, prev.y)
      ctx.lineTo(cur.x, cur.y)
      ctx.lineTo(cur.x, baseline)
      ctx.closePath()
      ctx.fill()

      ctx.globalAlpha = 1
      ctx.strokeStyle = color
      ctx.beginPath()
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(cur.x, cur.y)
      ctx.stroke()
    }

    // Current value dot
    const last = pts[pts.length - 1]
    ctx.fillStyle = riskColor(last.risk)
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(last.x, last.y, 2, 0, Math.PI * 2)
    ctx.fill()
  }, [snapshots, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width, height }}
    />
  )
})

/* ── Main bar component ── */

export function TrackedSatellitesBar() {
  const satellites = useFleetStore((s) => s.satellites)
  const selectSatellite = useFleetStore((s) => s.selectSatellite)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const timelines = useFleetRiskStore((s) => s.timelines)

  const proximityThreats = useThreatStore((s) => s.proximityThreats)
  const signalThreats = useThreatStore((s) => s.signalThreats)
  const anomalyThreats = useThreatStore((s) => s.anomalyThreats)
  const orbitalThreats = useThreatStore((s) => s.orbitalSimilarityThreats)
  const geoLoiterThreats = useThreatStore((s) => s.geoUsLoiterThreats)

  const currentRisk = useMemo(
    () =>
      computeFleetRisk(
        satellites,
        proximityThreats,
        signalThreats,
        anomalyThreats,
        orbitalThreats,
        geoLoiterThreats,
      ),
    [
      satellites,
      proximityThreats,
      signalThreats,
      anomalyThreats,
      orbitalThreats,
      geoLoiterThreats,
    ],
  )

  // "Tracked" = satellites with non-zero risk, sorted highest risk first
  const tracked = useMemo(() => {
    return satellites
      .filter((s) => (currentRisk[s.id] ?? 0) > 0)
      .sort((a, b) => (currentRisk[b.id] ?? 0) - (currentRisk[a.id] ?? 0))
  }, [satellites, currentRisk])

  if (tracked.length === 0) return null

  return (
    <div className="pointer-events-auto flex items-stretch gap-2 overflow-x-auto scrollbar-none rounded-xl border border-white/10 bg-card/60 px-3 py-2 backdrop-blur-xl">
      {/* Label */}
      <div className="flex shrink-0 flex-col justify-center pr-2 border-r border-white/10">
        <span className="font-mono text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tracked
        </span>
        <span className="font-mono text-[10px] tabular-nums font-semibold text-foreground">
          {tracked.length}
        </span>
      </div>

      {/* Satellite cards */}
      {tracked.map((sat) => {
        const risk = currentRisk[sat.id] ?? 0
        const snapshots = timelines[sat.id]?.snapshots ?? []
        const color = riskColor(risk)
        const statusColors = THREAT_COLORS[sat.status] ?? THREAT_COLORS.nominal

        return (
          <button
            key={sat.id}
            type="button"
            onClick={() => {
              selectSatellite(sat.id)
              setActiveView("comms")
            }}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-border/30 bg-secondary/10 px-2.5 py-1.5 transition-colors hover:border-border/60 hover:bg-secondary/25 cursor-pointer"
          >
            {/* Satellite name + risk % */}
            <div className="flex flex-col justify-center min-w-[70px]">
              <span className="font-mono text-[9px] font-medium text-foreground truncate max-w-[100px]">
                {sat.name}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span
                  className="font-mono text-[10px] font-bold tabular-nums"
                  style={{ color }}
                >
                  {Math.round(risk * 100)}%
                </span>
              </div>
            </div>

            {/* Mini sparkline */}
            <MiniSparkline snapshots={snapshots} width={100} height={28} />
          </button>
        )
      })}
    </div>
  )
}

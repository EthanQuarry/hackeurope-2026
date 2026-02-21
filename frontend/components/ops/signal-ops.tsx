"use client"

import { useState, useCallback } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { cn } from "@/lib/utils"
import { useThreatStore } from "@/stores/threat-store"
import type { SignalThreat } from "@/types"

interface SignalOpsProps {
  threats: SignalThreat[]
}

const SEVERITY_ORDER: Record<string, number> = { threatened: 0, watched: 1, nominal: 2, allied: 3, friendly: 3 }

function formatTCA(minutes: number): string {
  if (minutes < 60) return `T-${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `T-${h}h ${m}m` : `T-${h}h`
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

function ProbabilityBar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-border/40">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          value > 0.5 ? "bg-red-500/80" : value > 0.2 ? "bg-amber-500/80" : "bg-cyan-500/60"
        )}
        style={{ width: `${value * 100}%` }}
      />
    </div>
  )
}

export function SignalOps({ threats }: SignalOpsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(threats[0]?.id ?? null)
  const setFocusTarget = useThreatStore((s) => s.setFocusTarget)

  const handleSelect = useCallback((threat: SignalThreat) => {
    setSelectedId(threat.id)
    setFocusTarget({ ...threat.position, satelliteId: threat.interceptorId })
  }, [setFocusTarget])

  const sorted = [...threats].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return a.tcaInMinutes - b.tcaInMinutes
  })

  const selected = sorted.find((t) => t.id === selectedId) ?? sorted[0]
  const totalWindowsAtRisk = sorted.reduce((sum, t) => sum + t.commWindowsAtRisk, 0)
  const maxProb = sorted.length > 0 ? Math.max(...sorted.map((t) => t.interceptionProbability)) : 0

  return (
    <div className="grid h-full w-full grid-cols-2 gap-4">
      {/* Left panel — header + KPIs + queue */}
      <div data-ops-panel className="pointer-events-auto flex flex-col overflow-hidden rounded-l-sm rounded-r-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
        {/* Header */}
        <div className="border-b border-border/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
              Signal Interception
            </h2>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Communication intercept positioning & link vulnerability
          </p>
        </div>

        {/* KPI Stats */}
        <div className="grid grid-cols-3 gap-2 border-b border-border/40 p-4">
          <StatBox label="Active" value={sorted.length} />
          <StatBox label="Windows at Risk" value={totalWindowsAtRisk} alert={totalWindowsAtRisk > 3} />
          <StatBox label="Max Prob" value={`${(maxProb * 100).toFixed(0)}%`} alert={maxProb > 0.3} />
        </div>

        {/* Intercept Queue */}
        <div className="border-b border-border/40 px-5 py-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            Intercept Queue
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
                      {threat.interceptorName}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {(threat.interceptionProbability * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {threat.targetLinkAssetName} ↔ {threat.groundStationName}
                </div>
                <ProbabilityBar value={threat.interceptionProbability} />
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right panel — selected intercept detail */}
      <div data-ops-panel className="pointer-events-auto flex flex-col overflow-hidden rounded-r-sm rounded-l-xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-lg">
        {selected ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Intercept Detail
                </span>
                <ThreatBadge severity={selected.severity} />
              </div>

              <div className="space-y-0">
                <DataRow label="Interceptor" value={selected.interceptorName} />
                <DataRow label="Target Asset" value={selected.targetLinkAssetName} />
                <DataRow label="Ground Station" value={selected.groundStationName} />
                <DataRow label="Intercept Prob" value={`${(selected.interceptionProbability * 100).toFixed(1)}%`} alert={selected.interceptionProbability > 0.3} />
                <DataRow label="Signal Path" value={`${selected.signalPathAngleDeg.toFixed(1)}\u00b0`} />
                <DataRow label="Windows at Risk" value={`${selected.commWindowsAtRisk} / ${selected.totalCommWindows}`} alert={selected.commWindowsAtRisk > 2} />
                <DataRow label="TCA" value={formatTCA(selected.tcaInMinutes)} />
                <DataRow label="Confidence" value={`${(selected.confidence * 100).toFixed(0)}%`} />
              </div>

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
            <p className="text-xs text-muted-foreground">No intercept selected</p>
          </div>
        )}
      </div>
    </div>
  )
}

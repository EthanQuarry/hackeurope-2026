"use client"

import { useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { cn } from "@/lib/utils"
import type { AnomalyThreat } from "@/types"

interface AnomalyOpsProps {
  threats: AnomalyThreat[]
}

const SEVERITY_ORDER = { threatened: 0, watched: 1, nominal: 2, friendly: 3 }

const ANOMALY_LABELS: Record<AnomalyThreat["anomalyType"], string> = {
  "unexpected-maneuver": "UNEXPECTED MANEUVER",
  "orientation-change": "ORIENTATION CHANGE",
  "pointing-change": "POINTING CHANGE",
  "orbit-raise": "ORBIT RAISE",
  "orbit-lower": "ORBIT LOWER",
  "rf-emission": "RF EMISSION",
}

function timeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return `${Math.floor(diffHrs / 24)}d ago`
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
    <div className="flex items-center justify-between border-b border-border/20 py-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-sm tabular-nums", alert ? "text-red-400 font-semibold" : "text-foreground")}>
        {value}
      </span>
    </div>
  )
}

function DeviationBar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-border/40">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          value > 0.7 ? "bg-red-500/80" : value > 0.4 ? "bg-amber-500/80" : "bg-cyan-500/60"
        )}
        style={{ width: `${value * 100}%` }}
      />
    </div>
  )
}

export function AnomalyOps({ threats }: AnomalyOpsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(threats[0]?.id ?? null)

  const sorted = [...threats].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return b.baselineDeviation - a.baselineDeviation
  })

  const selected = sorted.find((t) => t.id === selectedId) ?? sorted[0]
  const criticalCount = sorted.filter((t) => t.severity === "threatened").length
  const maxDeviation = sorted.length > 0 ? Math.max(...sorted.map((t) => t.baselineDeviation)) : 0

  return (
    <div className="pointer-events-auto flex h-full gap-4">
      {/* Left panel — ops data */}
      <div className="flex w-[520px] shrink-0 flex-col rounded-xl border border-border/50 bg-card/85 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="border-b border-border/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-foreground">
              Anomalous Behavior
            </h2>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Satellite hijacking detection & behavioral baseline monitoring
          </p>
        </div>

        {/* KPI Stats */}
        <div className="grid grid-cols-3 gap-2 border-b border-border/40 p-4">
          <StatBox label="Active" value={sorted.length} />
          <StatBox label="Critical" value={criticalCount} alert={criticalCount > 0} />
          <StatBox label="Max Deviation" value={`${(maxDeviation * 100).toFixed(0)}%`} alert={maxDeviation > 0.7} />
        </div>

        {/* Threat List */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border/40 px-5 py-2">
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              Anomaly Queue
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
              {sorted.map((threat) => (
                <button
                  key={threat.id}
                  type="button"
                  onClick={() => setSelectedId(threat.id)}
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
                        {threat.satelliteName}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {timeAgo(threat.detectedAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={cn(
                      "rounded px-1 py-0.5 font-mono text-[8px] font-bold uppercase",
                      threat.severity === "threatened"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-amber-500/20 text-amber-300"
                    )}>
                      {ANOMALY_LABELS[threat.anomalyType]}
                    </span>
                    <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                      {(threat.baselineDeviation * 100).toFixed(0)}% dev
                    </span>
                  </div>
                  <DeviationBar value={threat.baselineDeviation} />
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Selected Threat Detail */}
        {selected && (
          <div className="border-t border-border/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Anomaly Detail
              </span>
              <ThreatBadge severity={selected.severity} />
            </div>

            <div className="space-y-0">
              <DataRow label="Satellite" value={selected.satelliteName} />
              <DataRow label="Anomaly Type" value={ANOMALY_LABELS[selected.anomalyType]} />
              <DataRow label="Baseline Deviation" value={`${(selected.baselineDeviation * 100).toFixed(0)}%`} alert={selected.baselineDeviation > 0.7} />
              <DataRow label="Detected" value={timeAgo(selected.detectedAt)} />
              <DataRow label="Confidence" value={`${(selected.confidence * 100).toFixed(0)}%`} />
            </div>

            <div className="mt-3 rounded-md border border-border/30 bg-secondary/20 p-3">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Analysis</span>
              <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                {selected.description}
              </p>
            </div>

            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border/40">
              <div
                className="h-full rounded-full bg-primary/70 transition-all"
                style={{ width: `${selected.confidence * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Right side — transparent gap for globe */}
      <div className="flex-1" />
    </div>
  )
}

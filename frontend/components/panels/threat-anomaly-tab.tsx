"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { cn } from "@/lib/utils"
import type { AnomalyThreat } from "@/types"

interface ThreatAnomalyTabProps {
  threats: AnomalyThreat[]
  selectedThreatId?: string | null
  onSelectThreat?: (id: string) => void
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

export function ThreatAnomalyTab({ threats, selectedThreatId, onSelectThreat }: ThreatAnomalyTabProps) {
  const sorted = [...threats].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return b.baselineDeviation - a.baselineDeviation
  })

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-2 pr-2">
        {sorted.map((threat) => (
          <button
            key={threat.id}
            type="button"
            onClick={() => onSelectThreat?.(threat.id)}
            className={cn(
              "w-full rounded-md border p-3 text-left transition-colors",
              selectedThreatId === threat.id
                ? "border-primary/40 bg-primary/10"
                : "border-border/40 bg-secondary/30 hover:bg-secondary/50"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <ThreatBadge severity={threat.severity} />
              <span className="font-mono text-[10px] text-muted-foreground">
                {timeAgo(threat.detectedAt)}
              </span>
            </div>

            <div className="mt-2">
              <p className="text-xs font-medium text-foreground">{threat.satelliteName}</p>
            </div>

            <div className="mt-1.5">
              <span
                className={cn(
                  "inline-flex rounded-sm border px-1 py-0.5 font-mono text-[9px] font-medium uppercase",
                  threat.severity === "threatened"
                    ? "border-red-500/40 bg-red-500/15 text-red-400"
                    : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                )}
              >
                {ANOMALY_LABELS[threat.anomalyType]}
              </span>
            </div>

            {/* Baseline deviation bar */}
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">Baseline deviation</span>
                <span className="font-mono text-[10px] text-foreground">
                  {(threat.baselineDeviation * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    threat.baselineDeviation > 0.7
                      ? "bg-red-500/80"
                      : threat.baselineDeviation > 0.4
                        ? "bg-amber-500/80"
                        : "bg-cyan-500/60"
                  )}
                  style={{ width: `${threat.baselineDeviation * 100}%` }}
                />
              </div>
            </div>

            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              {threat.description}
            </p>

            <div className="mt-2 flex items-center gap-1">
              <div className="h-1 w-12 overflow-hidden rounded-full bg-border/40">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${threat.confidence * 100}%` }}
                />
              </div>
              <span className="font-mono text-[9px] text-muted-foreground">
                {(threat.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </button>
        ))}

        {sorted.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No behavioral anomalies detected
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { cn } from "@/lib/utils"
import type { SignalThreat } from "@/types"

interface ThreatSignalTabProps {
  threats: SignalThreat[]
  selectedThreatId?: string | null
  onSelectThreat?: (id: string) => void
}

const SEVERITY_ORDER: Record<string, number> = { threatened: 0, watched: 1, nominal: 2, allied: 3, friendly: 3 }

function formatTCA(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function ThreatSignalTab({ threats, selectedThreatId, onSelectThreat }: ThreatSignalTabProps) {
  const sorted = [...threats].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return a.tcaInMinutes - b.tcaInMinutes
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
                TCA {formatTCA(threat.tcaInMinutes)}
              </span>
            </div>

            <div className="mt-2">
              <p className="text-xs font-medium text-foreground">{threat.interceptorName}</p>
              <p className="text-[10px] text-muted-foreground">
                {threat.targetLinkAssetName} ↔ {threat.groundStationName}
              </p>
            </div>

            {/* Interception probability */}
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">Intercept prob.</span>
                <span className="font-mono text-[10px] text-foreground">
                  {(threat.interceptionProbability * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    threat.interceptionProbability > 0.5
                      ? "bg-red-500/80"
                      : threat.interceptionProbability > 0.2
                        ? "bg-amber-500/80"
                        : "bg-cyan-500/60"
                  )}
                  style={{ width: `${threat.interceptionProbability * 100}%` }}
                />
              </div>
            </div>

            <div className="mt-2 flex items-center gap-3">
              <span className="font-mono text-[10px] text-foreground">
                {threat.commWindowsAtRisk} / {threat.totalCommWindows} windows
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {threat.signalPathAngleDeg.toFixed(1)}\u00b0 path
              </span>
            </div>

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
            No signal interception threats detected
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

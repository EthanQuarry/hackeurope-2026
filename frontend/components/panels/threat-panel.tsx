"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { cn } from "@/lib/utils"
import type { ThreatData } from "@/types"

interface ThreatPanelProps {
  threats: ThreatData[]
  selectedThreatId?: string | null
  onSelectThreat?: (id: string) => void
}

function formatTCA(minutesFromNow: number): string {
  if (minutesFromNow < 1) return "< 1 min"
  if (minutesFromNow < 60) return `${Math.round(minutesFromNow)} min`
  const h = Math.floor(minutesFromNow / 60)
  const m = Math.round(minutesFromNow % 60)
  return `${h}h ${m}m`
}

function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${km.toFixed(0)} km`
}

export function ThreatPanel({ threats, selectedThreatId, onSelectThreat }: ThreatPanelProps) {
  // Sort by severity (threatened > watched > nominal), then by TCA
  const sortedThreats = [...threats].sort((a, b) => {
    const severityOrder = { threatened: 0, watched: 1, nominal: 2, friendly: 3 }
    const aSev = severityOrder[a.severity]
    const bSev = severityOrder[b.severity]
    if (aSev !== bSev) return aSev - bSev
    return a.tcaInMinutes - b.tcaInMinutes
  })

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {threats.length} active conjunctions
        </span>
      </div>

      <Separator className="bg-border/40" />

      {/* Proximity alert table */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {sortedThreats.map((threat) => (
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ThreatBadge severity={threat.severity} />
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      TCA {formatTCA(threat.tcaInMinutes)}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-xs font-medium text-foreground">
                    {threat.primaryName}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    vs {threat.secondaryName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs tabular-nums text-foreground">
                    {formatDistance(threat.missDistanceKm)}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">miss dist</p>
                </div>
              </div>

              {/* Intent classification */}
              {threat.intentClassification && (
                <div className="mt-2 flex items-center gap-2 border-t border-border/30 pt-2">
                  <span className="text-[10px] text-muted-foreground">Intent:</span>
                  <span className="text-[10px] text-foreground/80">
                    {threat.intentClassification}
                  </span>
                  {threat.confidence !== undefined && (
                    <div className="ml-auto flex items-center gap-1">
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
                  )}
                </div>
              )}
            </button>
          ))}

          {threats.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No active conjunction events detected
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

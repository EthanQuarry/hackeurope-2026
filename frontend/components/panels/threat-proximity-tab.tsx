"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { cn } from "@/lib/utils"
import type { ProximityThreat } from "@/types"

interface ThreatProximityTabProps {
  threats: ProximityThreat[]
  selectedThreatId?: string | null
  onSelectThreat?: (id: string) => void
}

const SEVERITY_ORDER: Record<string, number> = { threatened: 0, watched: 1, nominal: 2, allied: 3, friendly: 3 }

const PATTERN_LABELS: Record<ProximityThreat["approachPattern"], string> = {
  "co-orbital": "CO-ORBITAL",
  "sun-hiding": "SUN-HIDING",
  direct: "DIRECT",
  drift: "DRIFT",
}

function formatTCA(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`
  if (km < 100) return `${km.toFixed(1)} km`
  if (km < 10_000) return `${km.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} km`
  if (km < 1_000_000) return `${(km / 1000).toFixed(1)}k km`
  return `${(km / 1_000_000).toFixed(2)}M km`
}

export function ThreatProximityTab({ threats, selectedThreatId, onSelectThreat }: ThreatProximityTabProps) {
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
              <p className="text-xs font-medium text-foreground">{threat.foreignSatName}</p>
              <p className="text-[10px] text-muted-foreground">→ {threat.targetAssetName}</p>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] text-foreground">
                {formatDistance(threat.missDistanceKm)}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {threat.approachVelocityKms.toFixed(3)} km/s
              </span>
              <span
                className={cn(
                  "rounded-sm border px-1 py-0.5 font-mono text-[9px] font-medium uppercase",
                  threat.approachPattern === "sun-hiding"
                    ? "border-red-500/40 bg-red-500/15 text-red-400"
                    : "border-border/40 bg-secondary/40 text-muted-foreground"
                )}
              >
                {PATTERN_LABELS[threat.approachPattern]}
              </span>
              {threat.sunHidingDetected && (
                <span className="rounded-sm border border-red-500/40 bg-red-500/15 px-1 py-0.5 font-mono text-[9px] font-medium uppercase text-red-400">
                  SUN-HIDE
                </span>
              )}
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
            No proximity threats detected
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { StatusDot } from "@/components/shared/status-dot"
import { SatelliteDetail } from "@/components/panels/satellite-detail"
import { cn } from "@/lib/utils"
import type { SatelliteData } from "@/types"

interface FleetPanelProps {
  satellites: SatelliteData[]
  selectedSatelliteId: string | null
  onSelectSatellite: (id: string | null) => void
}

export function FleetPanel({
  satellites,
  selectedSatelliteId,
  onSelectSatellite,
}: FleetPanelProps) {
  const selectedSatellite = satellites.find((s) => s.id === selectedSatelliteId)

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {satellites.length} tracked assets
        </span>
      </div>

      <Separator className="bg-border/40" />

      {/* Satellite list */}
      <ScrollArea className={cn("pr-2", selectedSatellite ? "max-h-[40%]" : "flex-1")}>
        <div className="space-y-1">
          {satellites.map((sat) => (
            <button
              key={sat.id}
              type="button"
              onClick={() =>
                onSelectSatellite(sat.id === selectedSatelliteId ? null : sat.id)
              }
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                selectedSatelliteId === sat.id
                  ? "bg-primary/10 border border-primary/30"
                  : "border border-transparent hover:bg-secondary/40"
              )}
            >
              <StatusDot status={sat.status} pulse={sat.status === "threatened"} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {sat.name}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {sat.altitude_km.toFixed(0)} km
                </p>
              </div>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {sat.noradId}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Satellite detail drill-down */}
      {selectedSatellite && (
        <>
          <Separator className="bg-border/40" />
          <ScrollArea className="flex-1">
            <SatelliteDetail satellite={selectedSatellite} />
          </ScrollArea>
        </>
      )}
    </div>
  )
}

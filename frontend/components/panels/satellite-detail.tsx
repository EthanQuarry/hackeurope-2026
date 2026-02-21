"use client"

import { Separator } from "@/components/ui/separator"
import { TelemetryRow } from "@/components/shared/telemetry-row"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { cn } from "@/lib/utils"
import type { SatelliteData } from "@/types"

interface SatelliteDetailProps {
  satellite: SatelliteData
}

function HealthBar({ label, value }: { label: string; value: number }) {
  const color =
    value > 70
      ? "bg-emerald-400"
      : value > 40
        ? "bg-amber-400"
        : "bg-red-400"

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="font-mono text-[10px] tabular-nums text-foreground">
          {value}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

export function SatelliteDetail({ satellite }: SatelliteDetailProps) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-foreground">{satellite.name}</h3>
          <p className="font-mono text-[10px] text-muted-foreground">
            NORAD {satellite.noradId}
          </p>
        </div>
        <ThreatBadge severity={satellite.status} />
      </div>

      <Separator className="bg-border/40" />

      {/* Telemetry */}
      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Telemetry
        </p>
        <TelemetryRow label="Altitude" value={satellite.altitude_km.toFixed(1)} unit="km" />
        <TelemetryRow label="Velocity" value={satellite.velocity_kms.toFixed(2)} unit="km/s" />
        <TelemetryRow label="Inclination" value={satellite.inclination_deg.toFixed(1)} unit="deg" />
        <TelemetryRow label="Period" value={satellite.period_min.toFixed(1)} unit="min" />
      </div>

      <Separator className="bg-border/40" />

      {/* Health */}
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Subsystem Health
        </p>
        <div className="space-y-2">
          <HealthBar label="Power" value={satellite.health.power} />
          <HealthBar label="Communications" value={satellite.health.comms} />
          <HealthBar label="Propellant" value={satellite.health.propellant} />
        </div>
      </div>
    </div>
  )
}

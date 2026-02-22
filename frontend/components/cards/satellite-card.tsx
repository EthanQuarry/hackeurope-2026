"use client"

import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useFleetStore } from "@/stores/fleet-store"
import { useUIStore } from "@/stores/ui-store"
import { useSatellitesWithDerivedStatus } from "@/hooks/use-derived-status"
import { MOCK_SATELLITES } from "@/lib/mock-data"
import { ThreatBadge } from "@/components/shared/threat-badge"

function MetricCell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-0.5 font-mono text-2xl font-bold text-gray-100">
        {value}
        {unit && <span className="ml-0.5 text-sm font-normal text-gray-400">{unit}</span>}
      </p>
    </div>
  )
}

function getOrbitType(inclination: number): string {
  if (inclination > 96 && inclination < 99) return "SSO"
  if (inclination > 80 && inclination < 100) return "Polar"
  if (inclination < 10) return "Equatorial"
  return "LEO"
}

function getPurpose(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes("sentinel") || lower.includes("guardian")) return "Earth Observation"
  if (lower.includes("aegis") || lower.includes("overwatch")) return "Surveillance"
  if (lower.includes("vanguard") || lower.includes("centurion")) return "Communications"
  if (lower.includes("specter")) return "Signals Intelligence"
  if (lower.includes("horizon")) return "Navigation"
  return "Multi-mission"
}

export function SatelliteCard({ className }: { className?: string }) {
  const selectedId = useFleetStore((s) => s.selectedSatelliteId)
  const satellites = useSatellitesWithDerivedStatus(MOCK_SATELLITES)
  const selectSatellite = useFleetStore((s) => s.selectSatellite)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const satellite = satellites.find((s) => s.id === selectedId)

  if (!satellite) return null

  return (
    <div
      className={cn(
        "pointer-events-auto w-[260px] rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl shadow-2xl",
        className
      )}
    >
      {/* Header with close button */}
      <div className="flex items-start justify-between border-b border-white/5 px-4 py-3">
        <div>
          <p className="font-mono text-lg font-bold text-gray-100">{satellite.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <ThreatBadge severity={satellite.status} />
            <span className="text-[10px] text-gray-500">NORAD {satellite.noradId}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => selectSatellite(null)}
          className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-4 border-b border-white/5 p-4">
        <MetricCell
          label="Altitude"
          value={satellite.altitude_km.toFixed(0)}
          unit="km"
        />
        <MetricCell
          label="Velocity"
          value={satellite.velocity_kms.toFixed(2)}
          unit="km/s"
        />
        <MetricCell
          label="Period"
          value={satellite.period_min.toFixed(1)}
          unit="min"
        />
        <MetricCell
          label="Orbit Type"
          value={getOrbitType(satellite.inclination_deg)}
        />
      </div>

      {/* Purpose & health */}
      <div className="space-y-3 p-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Purpose</p>
          <p className="mt-0.5 text-sm text-gray-200">{getPurpose(satellite.name)}</p>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Health
          </p>
          <div className="space-y-1.5">
            {(["power", "comms", "propellant"] as const).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-16 text-[10px] capitalize text-gray-400">{key}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      satellite.health[key] > 70
                        ? "bg-emerald-500"
                        : satellite.health[key] > 40
                          ? "bg-amber-500"
                          : "bg-red-500"
                    )}
                    style={{ width: `${satellite.health[key]}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-[10px] text-gray-400">
                  {satellite.health[key]}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* View Details button */}
        <button
          type="button"
          onClick={() => setActiveView("satellite-detail")}
          className="w-full border-t border-white/5 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
        >
          View Details
        </button>
      </div>
    </div>
  )
}

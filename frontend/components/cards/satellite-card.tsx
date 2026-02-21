"use client"

import { useMemo } from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { PROXIMITY_FLAG_THRESHOLD } from "@/lib/constants"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import { MOCK_PROXIMITY_THREATS, MOCK_ORBITAL_SIMILARITY_THREATS } from "@/lib/mock-data"
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
  const satellites = useFleetStore((s) => s.satellites)
  const selectSatellite = useFleetStore((s) => s.selectSatellite)
  const storeProximity = useThreatStore((s) => s.proximityThreats)
  const storeOrbital = useThreatStore((s) => s.orbitalSimilarityThreats)

  const satellite = satellites.find((s) => s.id === selectedId)

  const proximityThreats = storeProximity.length > 0 ? storeProximity : MOCK_PROXIMITY_THREATS
  const orbitalThreats = storeOrbital.length > 0 ? storeOrbital : MOCK_ORBITAL_SIMILARITY_THREATS

  const proximityScore = useMemo(() => {
    if (!satellite) return 0
    return proximityThreats.reduce((max, t) => {
      if (t.foreignSatId === satellite.id || t.targetAssetId === satellite.id) {
        return Math.max(max, t.confidence)
      }
      return max
    }, 0)
  }, [satellite, proximityThreats])

  const orbitalMatch = useMemo(() => {
    if (!satellite) return null
    const matches = orbitalThreats.filter(
      (t) => t.foreignSatId === satellite.id || t.targetAssetId === satellite.id
    )
    if (matches.length === 0) return null
    return matches.reduce((best, t) => t.divergenceScore < best.divergenceScore ? t : best)
  }, [satellite, orbitalThreats])

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

        {/* Proximity threat score */}
        <div className="border-t border-white/5 pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Proximity Risk
            </p>
            {proximityScore > PROXIMITY_FLAG_THRESHOLD && (
              <span className="font-mono text-[10px] font-semibold" style={{ color: "#ffcc00" }}>
                ⚠ FLAGGED
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(proximityScore * 100).toFixed(0)}%`,
                  backgroundColor:
                    proximityScore > 0.6 ? "#ff1744" :
                    proximityScore > PROXIMITY_FLAG_THRESHOLD ? "#ffcc00" :
                    "#00e676",
                }}
              />
            </div>
            <span className="w-8 text-right font-mono text-[10px] text-gray-400">
              {(proximityScore * 100).toFixed(0)}%
            </span>
          </div>
          <p className="mt-1 text-[10px] text-gray-600">Bayesian posterior probability</p>
        </div>

        {/* Orbital similarity */}
        <div className="border-t border-white/5 pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Orbital Match
            </p>
            {orbitalMatch && orbitalMatch.divergenceScore < 0.15 && (
              <span className="font-mono text-[10px] font-semibold" style={{ color: "#ffaa00" }}>
                ⚠ CO-ORBITAL
              </span>
            )}
          </div>
          {orbitalMatch ? (
            <>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(0, (1 - orbitalMatch.divergenceScore / 0.8) * 100).toFixed(0)}%`,
                      backgroundColor:
                        orbitalMatch.divergenceScore < 0.05 ? "#ff1744" :
                        orbitalMatch.divergenceScore < 0.15 ? "#ffaa00" :
                        "#00e676",
                    }}
                  />
                </div>
                <span className="w-14 text-right font-mono text-[10px] text-gray-400">
                  {orbitalMatch.divergenceScore.toFixed(4)}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-gray-600">
                {orbitalMatch.pattern.replace("-", " ")} · {(orbitalMatch.confidence * 100).toFixed(0)}% posterior · vs {
                  orbitalMatch.foreignSatId === satellite?.id
                    ? orbitalMatch.targetAssetName
                    : orbitalMatch.foreignSatName
                }
              </p>
            </>
          ) : (
            <p className="text-[10px] text-gray-600">No co-orbital match detected</p>
          )}
        </div>
      </div>
    </div>
  )
}

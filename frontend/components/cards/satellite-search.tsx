"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Search, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { THREAT_COLORS, PROXIMITY_FLAG_THRESHOLD } from "@/lib/constants"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import { MOCK_SATELLITES, MOCK_PROXIMITY_THREATS } from "@/lib/mock-data"

export function SatelliteSearch({ className }: { className?: string }) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const storeSatellites = useFleetStore((s) => s.satellites)
  const selectSatellite = useFleetStore((s) => s.selectSatellite)
  const setFocusTarget = useThreatStore((s) => s.setFocusTarget)
  const storeProximity = useThreatStore((s) => s.proximityThreats)

  const satellites = storeSatellites.length > 0 ? storeSatellites : MOCK_SATELLITES
  const proximityThreats = storeProximity.length > 0 ? storeProximity : MOCK_PROXIMITY_THREATS

  const satScores = useMemo(() => {
    const scores: Record<string, number> = {}
    for (const threat of proximityThreats) {
      scores[threat.foreignSatId] = Math.max(scores[threat.foreignSatId] ?? 0, threat.confidence)
      scores[threat.targetAssetId] = Math.max(scores[threat.targetAssetId] ?? 0, threat.confidence)
    }
    return scores
  }, [proximityThreats])

  const filtered = useMemo(() => {
    if (!query.trim()) return satellites
    const q = query.toLowerCase()
    return satellites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        String(s.noradId).includes(q)
    )
  }, [query, satellites])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function handleSelect(sat: (typeof satellites)[number]) {
    selectSatellite(sat.id)
    // Focus globe on the satellite and track it
    if (sat.trajectory.length > 0) {
      const p = sat.trajectory[0]
      setFocusTarget({ lat: p.lat, lon: p.lon, altKm: p.alt_km, satelliteId: sat.id })
    }
    setQuery("")
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={cn("pointer-events-auto relative w-[280px]", className)}>
      {/* Search input */}
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-card/60 px-3 py-2 backdrop-blur-xl shadow-2xl">
        <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search satellites..."
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          className="flex-1 bg-transparent text-xs text-gray-200 placeholder:text-gray-500 outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("")
              inputRef.current?.focus()
            }}
            className="text-gray-500 hover:text-gray-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[320px] overflow-y-auto rounded-xl border border-white/10 bg-card/90 py-1 backdrop-blur-xl shadow-2xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-gray-500">
              No satellites found
            </div>
          ) : (
            filtered.map((sat) => {
              const colors = THREAT_COLORS[sat.status]
              const score = satScores[sat.id] ?? 0
              const flagged = score > PROXIMITY_FLAG_THRESHOLD
              return (
                <button
                  key={sat.id}
                  type="button"
                  onClick={() => handleSelect(sat)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colors.hex }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-gray-200">
                      {sat.name}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      NORAD {sat.noradId} · {sat.altitude_km.toFixed(0)} km · {sat.status}
                    </p>
                  </div>
                  {flagged && (
                    <span
                      className="shrink-0 font-mono text-[10px] font-semibold"
                      style={{ color: "#ffcc00" }}
                      title={`Proximity threat score: ${(score * 100).toFixed(0)}%`}
                    >
                      ⚠ {(score * 100).toFixed(0)}%
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

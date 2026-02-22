"use client"

import { useThreatStore } from "@/stores/threat-store"

export function TrackedSatellitesBar() {
  const proximityThreats = useThreatStore((s) => s.proximityThreats)
  const tracked = new Set<string>()
  for (const t of proximityThreats) {
    tracked.add(t.foreignSatName)
  }

  if (tracked.size === 0) return null

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-2 py-1 scrollbar-hide">
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-gray-500">
        Tracking
      </span>
      {[...tracked].map((name) => (
        <span
          key={name}
          className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[9px] text-gray-300"
        >
          {name}
        </span>
      ))}
    </div>
  )
}

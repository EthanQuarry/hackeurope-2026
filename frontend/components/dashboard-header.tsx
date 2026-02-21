"use client"

import { useState } from "react"
import { Play, Pause, Shield, Crosshair, Radio, AlertTriangle, LayoutGrid, ChevronDown, Globe } from "lucide-react"

import { cn } from "@/lib/utils"
import { SPEED_PRESETS, PLANET_CONFIG } from "@/lib/constants"
import type { GlobalThreatLevel } from "@/types"
import { useUIStore, type ActiveView, type Planet } from "@/stores/ui-store"

interface DashboardHeaderProps {
  globalThreatLevel: GlobalThreatLevel
  speed: number
  playing: boolean
  simTime: number
  onSpeedChange: (speed: number) => void
  onPlayToggle: () => void
  threatCounts?: { proximity: number; signal: number; anomaly: number }
}

const NAV_TABS: { id: ActiveView; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "OVERVIEW", icon: LayoutGrid },
  { id: "proximity", label: "PROXIMITY", icon: Crosshair },
  { id: "signal", label: "SIGNAL", icon: Radio },
  { id: "anomaly", label: "ANOMALY", icon: AlertTriangle },
]

function formatSimTime(ms: number): string {
  const date = new Date(ms)
  const y = date.getUTCFullYear()
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  const h = String(date.getUTCHours()).padStart(2, "0")
  const m = String(date.getUTCMinutes()).padStart(2, "0")
  const s = String(date.getUTCSeconds()).padStart(2, "0")
  return `${y}-${mo}-${d} ${h}:${m}:${s}Z`
}

const PLANETS: { id: Planet; label: string }[] = [
  { id: "earth", label: "Earth" },
  { id: "moon", label: "Moon" },
  { id: "mars", label: "Mars" },
]

function PlanetSelector() {
  const activePlanet = useUIStore((s) => s.activePlanet)
  const setActivePlanet = useUIStore((s) => s.setActivePlanet)
  const [open, setOpen] = useState(false)

  return (
    <div className="relative z-50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        <Globe className="h-3 w-3" />
        <span>{PLANET_CONFIG[activePlanet].label}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[70] mt-1 w-28 rounded-md border border-border/60 bg-card/95 py-1 shadow-xl backdrop-blur-xl">
            {PLANETS.map((planet) => (
              <button
                key={planet.id}
                type="button"
                onClick={() => {
                  setActivePlanet(planet.id)
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  activePlanet === planet.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                )}
              >
                {planet.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function DashboardHeader({
  globalThreatLevel,
  speed,
  playing,
  simTime,
  onSpeedChange,
  onPlayToggle,
  threatCounts,
}: DashboardHeaderProps) {
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const countMap: Record<string, number | undefined> = {
    proximity: threatCounts?.proximity,
    signal: threatCounts?.signal,
    anomaly: threatCounts?.anomaly,
  }

  return (
    <header className="flex items-center gap-4 rounded-2xl border border-white/10 bg-card/60 px-6 py-3 shadow-2xl backdrop-blur-xl">
      {/* Left: Logo + branding + planet selector */}
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-foreground whitespace-nowrap">
          Orbital Shield
        </h1>
        <PlanetSelector />
      </div>

      {/* Center: Pill-style nav tabs */}
      <nav className="flex flex-1 items-center justify-center gap-1">
        {NAV_TABS.map((tab) => {
          const Icon = tab.icon
          const count = countMap[tab.id]
          const isActive = activeView === tab.id

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveView(tab.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-all",
                isActive
                  ? "bg-primary/20 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
              {count !== undefined && count > 0 && (
                <span
                  className={cn(
                    "ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                    isActive
                      ? "bg-primary/25 text-primary"
                      : "bg-accent/60 text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Right: Sim time + speed controls + play/pause */}
      <div className="flex items-center gap-3">
        <div className="font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap">
          {formatSimTime(simTime)}
        </div>

        <div className="flex items-center gap-1">
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset.multiplier}
              type="button"
              onClick={() => onSpeedChange(preset.multiplier)}
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors whitespace-nowrap",
                speed === preset.multiplier
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onPlayToggle}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          aria-label={playing ? "Pause simulation" : "Play simulation"}
        >
          {playing ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </header>
  )
}

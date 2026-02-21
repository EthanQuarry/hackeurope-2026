"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Pause, Shield } from "lucide-react"

import { cn } from "@/lib/utils"
import { ThreatBadge } from "@/components/shared/threat-badge"
import { SPEED_PRESETS } from "@/lib/constants"
import type { ThreatSeverity } from "@/lib/constants"
import type { GlobalThreatLevel } from "@/types"

interface DashboardHeaderProps {
  globalThreatLevel: GlobalThreatLevel
  speed: number
  playing: boolean
  simTime: number
  onSpeedChange: (speed: number) => void
  onPlayToggle: () => void
}

const threatLevelToSeverity: Record<GlobalThreatLevel, ThreatSeverity> = {
  NOMINAL: "nominal",
  ELEVATED: "watched",
  HIGH: "threatened",
  CRITICAL: "threatened",
}

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

export function DashboardHeader({
  globalThreatLevel,
  speed,
  playing,
  simTime,
  onSpeedChange,
  onPlayToggle,
}: DashboardHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/80 px-5 py-3 shadow-lg backdrop-blur-lg">
      {/* Left: Branding */}
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-foreground">
          Orbital Shield
        </h1>
        <ThreatBadge severity={threatLevelToSeverity[globalThreatLevel]} />
      </div>

      {/* Center: Sim time */}
      <div className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatSimTime(simTime)}
      </div>

      {/* Right: Speed controls */}
      <div className="flex items-center gap-2">
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

        <div className="flex items-center gap-1">
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset.multiplier}
              type="button"
              onClick={() => onSpeedChange(preset.multiplier)}
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                speed === preset.multiplier
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}

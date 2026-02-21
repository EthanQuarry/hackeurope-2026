"use client"

import { useMemo } from "react"

import { GlobeView } from "@/components/globe/globe-view"
import { DashboardHeader } from "@/components/dashboard-header"
import { InsightsCard } from "@/components/cards/insights-card"
import { SatelliteCard } from "@/components/cards/satellite-card"
import { AiChatBar } from "@/components/cards/ai-chat-bar"
import { StatsCards } from "@/components/cards/stats-cards"
import { ProximityOps } from "@/components/ops/proximity-ops"
import { SignalOps } from "@/components/ops/signal-ops"
import { AnomalyOps } from "@/components/ops/anomaly-ops"
import { useUIStore } from "@/stores/ui-store"
import { useGlobeStore } from "@/stores/globe-store"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import { usePolling } from "@/hooks/use-polling"
import { api } from "@/lib/api"
import {
  MOCK_THREATS,
  MOCK_SATELLITES,
  MOCK_PROXIMITY_THREATS,
  MOCK_SIGNAL_THREATS,
  MOCK_ANOMALY_THREATS,
} from "@/lib/mock-data"
import { THREAT_REFRESH_MS, DEBRIS_REFRESH_MS } from "@/lib/constants"
import type { SatelliteData, ThreatData, DebrisData } from "@/types"

export function DashboardShell() {
  const activeView = useUIStore((s) => s.activeView)
  const terminalOpen = useUIStore((s) => s.terminalOpen)

  const speed = useGlobeStore((s) => s.speed)
  const playing = useGlobeStore((s) => s.playing)
  const simTime = useGlobeStore((s) => s.simTime)
  const setSpeed = useGlobeStore((s) => s.setSpeed)
  const togglePlaying = useGlobeStore((s) => s.togglePlaying)

  const setSatellites = useFleetStore((s) => s.setSatellites)
  const setThreats = useThreatStore((s) => s.setThreats)
  const setDebris = useThreatStore((s) => s.setDebris)

  // Poll backend for live data — falls back to mocks on error
  usePolling<SatelliteData[]>({
    url: api.satellites,
    intervalMs: 30_000,
    onData: setSatellites,
  })
  usePolling<ThreatData[]>({
    url: api.threats,
    intervalMs: THREAT_REFRESH_MS,
    onData: setThreats,
  })
  usePolling<DebrisData[]>({
    url: api.debris,
    intervalMs: DEBRIS_REFRESH_MS,
    onData: setDebris,
  })

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Full-screen globe background */}
      <GlobeView compacted={false} />

      {/* Header overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-6 pt-4">
        <div className="pointer-events-auto mx-auto w-full max-w-[1600px]">
          <DashboardHeader
            globalThreatLevel="NOMINAL"
            speed={speed}
            playing={playing}
            simTime={simTime}
            onSpeedChange={setSpeed}
            onPlayToggle={togglePlaying}
            threatCounts={{
              proximity: MOCK_PROXIMITY_THREATS.length,
              signal: MOCK_SIGNAL_THREATS.length,
              anomaly: MOCK_ANOMALY_THREATS.length,
            }}
          />
        </div>
      </div>

      {/* Content area — switches based on activeView */}
      <div className="pointer-events-none absolute inset-0 z-10 px-6 pt-24 pb-6">
        {activeView === "overview" ? (
          /* Overview: Floating glass cards over the globe */
          <div className="relative mx-auto h-full w-full max-w-[1600px]">
            {/* Left: AI Insights card */}
            <div className="absolute left-0 top-0 bottom-20">
              <InsightsCard />
            </div>

            {/* Right: Satellite detail card (only when selected) */}
            <div className="absolute right-0 top-0">
              <SatelliteCard />
            </div>

            {/* Bottom center: AI Chat input bar */}
            <div className="absolute bottom-36 left-1/2 -translate-x-1/2">
              <AiChatBar />
            </div>

            {/* Bottom: Stats cards */}
            <div className="absolute bottom-0 left-0 right-0">
              <StatsCards />
            </div>
          </div>
        ) : (
          /* Ops pages: full mission view */
          <div className="mx-auto h-full w-full max-w-[1600px]">
            {activeView === "proximity" && (
              <ProximityOps threats={MOCK_PROXIMITY_THREATS} />
            )}
            {activeView === "signal" && (
              <SignalOps threats={MOCK_SIGNAL_THREATS} />
            )}
            {activeView === "anomaly" && (
              <AnomalyOps threats={MOCK_ANOMALY_THREATS} />
            )}
          </div>
        )}
      </div>
    </main>
  )
}

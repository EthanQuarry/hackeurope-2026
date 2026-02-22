"use client";

import { useEffect, useMemo, useCallback, useState, lazy, Suspense } from "react"
import { Brain, ChevronLeft, ChevronRight, GitBranch, Lightbulb, Satellite, Target, Video } from "lucide-react"
import { api } from "@/lib/api"

import { GlobeView } from "@/components/globe/globe-view"
import { DashboardHeader } from "@/components/dashboard-header"
import { InsightsCard } from "@/components/cards/insights-card"
import { SatelliteCard } from "@/components/cards/satellite-card"
import { AiChatBar } from "@/components/cards/ai-chat-bar"
import { StatsCards } from "@/components/cards/stats-cards"
import { SatelliteSearch } from "@/components/cards/satellite-search"
import { DemoSelector } from "@/components/cards/demo-selector"
import { ProximityOps } from "@/components/ops/proximity-ops"
import { SignalOps } from "@/components/ops/signal-ops"
import { AnomalyOps } from "@/components/ops/anomaly-ops"
import { CommsOps } from "@/components/ops/comms-ops"
import { OrbitalOps } from "@/components/ops/orbital-ops"
import { AdversaryOps } from "@/components/ops/adversary-ops"
const SatelliteDetailPage = lazy(() =>
  import("@/components/satellite-detail-page").then((m) => ({
    default: m.SatelliteDetailPage,
  })),
)
import { useUIStore, type ActiveView } from "@/stores/ui-store"
import { cn } from "@/lib/utils"
import { useGlobeStore } from "@/stores/globe-store"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import { usePolling } from "@/hooks/use-polling"
import { useScenarioSocket } from "@/hooks/use-scenario-socket"
import {
  MOCK_THREATS,
  MOCK_SATELLITES,
  MOCK_PROXIMITY_THREATS,
  MOCK_SIGNAL_THREATS,
  MOCK_ANOMALY_THREATS,
} from "@/lib/mock-data";
import { THREAT_REFRESH_MS, DEBRIS_REFRESH_MS } from "@/lib/constants";
import type {
  SatelliteData,
  ThreatData,
  DebrisData,
  ProximityThreat,
  SignalThreat,
  AnomalyThreat,
} from "@/types";

const SIDEBAR_TABS: { id: ActiveView; icon: typeof Lightbulb; label: string; color: string }[] = [
  { id: "overview", icon: Lightbulb, label: "Insights", color: "text-muted-foreground" },
  { id: "orbital", icon: GitBranch, label: "Orbital", color: "text-muted-foreground" },
  { id: "comms", icon: Satellite, label: "Comms", color: "text-muted-foreground" },
  { id: "adversary-detail", icon: Target, label: "Adversary", color: "text-red-400/70" },
]

export function DashboardShell() {
  // Reset SJ-26 scenario on page load/refresh
  useEffect(() => {
    fetch(`${api.satellites.replace("/satellites", "/scenario/reset")}`, {
      method: "POST",
    }).catch(() => {})
  }, [])

  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const terminalOpen = useUIStore((s) => s.terminalOpen)
  const leftPanelCollapsed = useUIStore((s) => s.leftPanelCollapsed)
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel)

  const handleOpsBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-ops-panel]")) return;
      setActiveView("overview");
    },
    [setActiveView],
  );

  const speed = useGlobeStore((s) => s.speed);
  const playing = useGlobeStore((s) => s.playing);
  const simTime = useGlobeStore((s) => s.simTime);
  const setSpeed = useGlobeStore((s) => s.setSpeed);
  const togglePlaying = useGlobeStore((s) => s.togglePlaying);

  const selectedSatelliteId = useFleetStore((s) => s.selectedSatelliteId);
  const setSatellites = useFleetStore((s) => s.setSatellites);
  const setThreats = useThreatStore((s) => s.setThreats);
  const setDebris = useThreatStore((s) => s.setDebris);
  const setProximityThreats = useThreatStore((s) => s.setProximityThreats);
  const setSignalThreats = useThreatStore((s) => s.setSignalThreats);
  const setAnomalyThreats = useThreatStore((s) => s.setAnomalyThreats);
  const storeProximity = useThreatStore((s) => s.proximityThreats);
  const storeSignal = useThreatStore((s) => s.signalThreats);
  const storeAnomaly = useThreatStore((s) => s.anomalyThreats);

  // ── WebSocket: sole source for all threat data ──
  // Pushes complete threat arrays (general + SJ-26) every tick.
  // Tick rate scales with sim speed. No REST polling for threats.
  useScenarioSocket();

  // ── REST polling: satellites + debris only (large payloads, infrequent) ──
  const orbitInterval = Math.max(1000, Math.round(10_000 / speed));
  const debrisInterval = Math.max(2000, Math.round(DEBRIS_REFRESH_MS / speed));

  usePolling<SatelliteData[]>({
    url: `${api.satellites}?speed=${speed}`,
    intervalMs: orbitInterval,
    onData: setSatellites,
  });
  usePolling<DebrisData[]>({
    url: api.debris,
    intervalMs: debrisInterval,
    onData: setDebris,
  });

  // Poll ops-level threat endpoints
  usePolling<ProximityThreat[]>({
    url: api.proximityThreats,
    intervalMs: THREAT_REFRESH_MS,
    onData: setProximityThreats,
  });
  usePolling<SignalThreat[]>({
    url: api.signalThreats,
    intervalMs: THREAT_REFRESH_MS,
    onData: setSignalThreats,
  });
  usePolling<AnomalyThreat[]>({
    url: api.anomalyThreats,
    intervalMs: THREAT_REFRESH_MS,
    onData: setAnomalyThreats,
  });
  // Use live data when available, fall back to mocks
  const proximityThreats =
    storeProximity.length > 0 ? storeProximity : MOCK_PROXIMITY_THREATS;
  const signalThreats =
    storeSignal.length > 0 ? storeSignal : MOCK_SIGNAL_THREATS;
  const anomalyThreats =
    storeAnomaly.length > 0 ? storeAnomaly : MOCK_ANOMALY_THREATS;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Full-screen globe background */}
      <GlobeView compacted={false} />

      {/* Header overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-6 pt-4">
        <div className="pointer-events-auto mx-auto w-full max-w-[1600px] overflow-x-auto">
          <DashboardHeader
            globalThreatLevel="NOMINAL"
            speed={speed}
            playing={playing}
            simTime={simTime}
            onSpeedChange={setSpeed}
            onPlayToggle={togglePlaying}
            threatCounts={{
              proximity: proximityThreats.length,
              signal: signalThreats.length,
              anomaly: anomalyThreats.length,
            }}
          />
        </div>
      </div>

      {/* Content area — switches based on activeView */}
      <div
        className={`absolute inset-0 z-10 px-6 pt-24 pb-6 pointer-events-none`}
        onClick={activeView !== "overview" ? handleOpsBackdropClick : undefined}
      >
        {/* Persistent sidebar — single container, always visible */}
        <div
          data-ops-panel
          className={cn(
            "pointer-events-auto absolute left-6 top-24 bottom-24 z-30 flex flex-col rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl overflow-hidden transition-all duration-300 ease-in-out",
            activeView === "overview" && !leftPanelCollapsed ? "w-[280px]" : "w-[48px]"
          )}
        >
          {activeView === "overview" && !leftPanelCollapsed ? (
            /* ── Expanded: header + icon gutter / content side-by-side ── */
            <>
              {/* Header bar */}
              <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2">
                <Brain className="h-4 w-4 shrink-0 text-cyan-400" />
                <span className="truncate flex-1 text-[11px] font-semibold uppercase tracking-wider text-gray-300">
                  Intel Panel
                </span>
                <button
                  type="button"
                  onClick={toggleLeftPanel}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                  aria-label="Collapse panel"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Body: icon gutter + content */}
              <div className="flex min-h-0 flex-1">
                {/* Icon gutter */}
                <div className="flex w-[48px] shrink-0 flex-col items-center gap-1 border-r border-white/5 py-3">
                  {SIDEBAR_TABS.map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeView === tab.id
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveView(tab.id)}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                          isActive
                            ? tab.id === "adversary-detail"
                              ? "bg-red-500/10 text-red-400"
                              : "bg-white/[0.10] text-foreground"
                            : cn(tab.color, "hover:bg-white/[0.06] hover:text-foreground")
                        )}
                        title={tab.label}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    )
                  })}
                </div>

                {/* Content column */}
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  <div className="shrink-0 px-3 pt-2 pb-1 overflow-hidden">
                    <SatelliteSearch className="min-w-0" />
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <InsightsCard className="h-full w-full rounded-none border-0 bg-transparent shadow-none backdrop-blur-none" />
                  </div>
                  {/* Adversary Tracker link */}
                  <button
                    type="button"
                    onClick={() => setActiveView("adversary-detail")}
                    className="mx-3 mb-3 flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-left transition-all hover:bg-red-500/10 hover:border-red-500/30"
                  >
                    <Target className="h-4 w-4 shrink-0 text-red-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-foreground">Adversary Tracker</p>
                      <p className="text-[9px] text-muted-foreground">5 threats monitored</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* ── Collapsed: just icon strip ── */
            <>
              <div className="flex flex-1 flex-col items-center justify-center gap-1 py-3">
                {SIDEBAR_TABS.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeView === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        if (tab.id === "overview") {
                          setActiveView("overview")
                          if (leftPanelCollapsed) toggleLeftPanel()
                        } else {
                          setActiveView(tab.id)
                        }
                      }}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                        isActive
                          ? tab.id === "adversary-detail"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-white/[0.10] text-foreground"
                          : cn(tab.color, "hover:bg-white/[0.06] hover:text-foreground")
                      )}
                      title={tab.label}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
              {/* Expand toggle — only in overview */}
              {activeView === "overview" && (
                <button
                  type="button"
                  onClick={toggleLeftPanel}
                  className="mx-auto mb-3 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                  aria-label="Expand panel"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>

        {activeView === "overview" ? (
          /* Overview: Floating glass cards over the globe */
          <div className="relative mx-auto h-full w-full max-w-[1600px]">
            {/* Right: Stats panels (stacked, collapsible) + satellite card when selected */}
            <div className="absolute right-0 top-4 bottom-20 flex flex-col gap-2 overflow-y-auto pointer-events-auto scrollbar-none">
              {selectedSatelliteId && <SatelliteCard />}
              <StatsCards />
            </div>

            {/* Bottom center: AI Chat input bar */}
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
              <AiChatBar />
            </div>
          </div>
        ) : (
          /* Ops pages: full mission view */
          <div className="h-full w-full pl-[60px]">
            {activeView === "proximity" && (
              <ProximityOps threats={proximityThreats} />
            )}
            {activeView === "signal" && <SignalOps threats={signalThreats} />}
            {activeView === "anomaly" && (
              <AnomalyOps threats={anomalyThreats} />
            )}
            {activeView === "comms" && <CommsOps />}
            {activeView === "satellite-detail" && (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Loading…
                  </div>
                }
              >
                <SatelliteDetailPage />
              </Suspense>
            )}
            {activeView === "adversary-detail" && <AdversaryOps />}
          </div>
        )}
      </div>

      {/* Bottom-left: Cinematic flyover + Demo selector */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-20 flex items-center gap-2 p-6">
        <button
          type="button"
          onClick={() => {
            setActiveView("overview")
            useGlobeStore.getState().setCinematicActive(true)
          }}
          className="pointer-events-auto group flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-card/60 text-muted-foreground backdrop-blur-xl transition-all hover:scale-105 hover:border-white/20 hover:bg-card/80 hover:text-foreground"
          title="Cinematic flyover"
        >
          <Video className="h-4 w-4 transition-transform group-hover:scale-110" />
        </button>
        <div className="pointer-events-auto">
          <DemoSelector />
        </div>
      </div>
    </main>
  );
}

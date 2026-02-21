"use client"

import { type CSSProperties, useMemo } from "react"
import { AlertTriangle, Satellite, Radio, ShieldCheck } from "lucide-react"

import { GlobeView } from "@/components/globe/globe-view"
import { DashboardHeader } from "@/components/dashboard-header"
import { SidePanel } from "@/components/side-panel"
import { ThreatPanel } from "@/components/panels/threat-panel"
import { FleetPanel } from "@/components/panels/fleet-panel"
import { CommsPanel } from "@/components/panels/comms-panel"
import { ResponsePanel } from "@/components/panels/response-panel"
import { AITerminal } from "@/components/terminal/ai-terminal"
import { useUIStore } from "@/stores/ui-store"
import { useGlobeStore } from "@/stores/globe-store"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import { MOCK_THREATS, MOCK_SATELLITES } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import type { ResponseRecommendation } from "@/types"

// Mock response recommendations
const MOCK_RECOMMENDATIONS: ResponseRecommendation[] = [
  {
    id: "resp-1",
    threatId: "threat-1",
    type: "maneuver",
    description: "Execute along-track burn of +0.12 m/s at T-15 min to increase miss distance from 0.8 km to 42 km.",
    deltaV: 0.12,
    confidence: 0.91,
    timestamp: Date.now(),
  },
  {
    id: "resp-2",
    threatId: "threat-2",
    type: "monitor",
    description: "Continue tracking UNKNOWN OBJ 4718. Elevated monitoring — reassess at T-30 min if miss distance decreases below 5 km.",
    confidence: 0.78,
    timestamp: Date.now(),
  },
]

function TabBar({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: { id: string; label: string }[]
  activeTab: string
  onTabChange: (id: string) => void
}) {
  return (
    <div className="flex gap-1 border-b border-border/40 px-1 pb-2 mb-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
            activeTab === tab.id
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function DashboardShell() {
  const leftCollapsed = useUIStore((s) => s.leftPanelCollapsed)
  const rightCollapsed = useUIStore((s) => s.rightPanelCollapsed)
  const terminalOpen = useUIStore((s) => s.terminalOpen)
  const leftActiveTab = useUIStore((s) => s.leftActiveTab)
  const rightActiveTab = useUIStore((s) => s.rightActiveTab)
  const toggleLeft = useUIStore((s) => s.toggleLeftPanel)
  const toggleRight = useUIStore((s) => s.toggleRightPanel)
  const toggleTerminal = useUIStore((s) => s.toggleTerminal)
  const setLeftActiveTab = useUIStore((s) => s.setLeftActiveTab)
  const setRightActiveTab = useUIStore((s) => s.setRightActiveTab)

  const speed = useGlobeStore((s) => s.speed)
  const playing = useGlobeStore((s) => s.playing)
  const simTime = useGlobeStore((s) => s.simTime)
  const setSpeed = useGlobeStore((s) => s.setSpeed)
  const togglePlaying = useGlobeStore((s) => s.togglePlaying)

  const selectedSatelliteId = useFleetStore((s) => s.selectedSatelliteId)
  const selectSatellite = useFleetStore((s) => s.selectSatellite)

  const selectedThreatId = useThreatStore((s) => s.selectedThreatId)
  const selectThreat = useThreatStore((s) => s.selectThreat)

  const panelColumns = useMemo(() => {
    const leftWidth = leftCollapsed ? "4.75rem" : "22rem"
    const rightWidth = rightCollapsed ? "4.75rem" : "22rem"
    return `${leftWidth} minmax(0, 1fr) ${rightWidth}`
  }, [leftCollapsed, rightCollapsed])

  const leftIcon = leftActiveTab === "threats" ? AlertTriangle : Radio
  const leftTitle = leftActiveTab === "threats" ? "Threat Detection" : "Communications"

  const rightIcon = rightActiveTab === "fleet" ? Satellite : ShieldCheck
  const rightTitle = rightActiveTab === "fleet" ? "Fleet Dashboard" : "AI Responses"

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Full-screen globe background */}
      <GlobeView compacted={terminalOpen} />

      {/* Header overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-6">
        <div className="pointer-events-auto mx-auto w-full max-w-[1600px]">
          <DashboardHeader
            globalThreatLevel="NOMINAL"
            speed={speed}
            playing={playing}
            simTime={simTime}
            onSpeedChange={setSpeed}
            onPlayToggle={togglePlaying}
          />
        </div>
      </div>

      {/* Three-column panel grid */}
      <div className="pointer-events-none absolute inset-0 z-10 p-6 pt-28 pb-6">
        <div
          className="mx-auto grid h-full w-full max-w-[1600px] grid-cols-1 gap-4 transition-[grid-template-columns] duration-500 ease-in-out lg:[grid-template-columns:var(--panel-cols)] lg:grid-rows-[minmax(0,1fr)_auto]"
          style={{ "--panel-cols": panelColumns } as CSSProperties}
        >
          {/* Left panel: Threats / Comms */}
          <SidePanel
            className="lg:col-start-1 lg:row-span-2"
            side="left"
            collapsed={leftCollapsed}
            onToggle={toggleLeft}
            icon={leftIcon}
            title={leftTitle}
          >
            <TabBar
              tabs={[
                { id: "threats", label: "Threats" },
                { id: "comms", label: "Comms" },
              ]}
              activeTab={leftActiveTab}
              onTabChange={(id) => setLeftActiveTab(id as "threats" | "comms")}
            />
            {leftActiveTab === "threats" ? (
              <ThreatPanel
                threats={MOCK_THREATS}
                selectedThreatId={selectedThreatId}
                onSelectThreat={selectThreat}
              />
            ) : (
              <CommsPanel satellites={MOCK_SATELLITES} />
            )}
          </SidePanel>

          {/* Center transparent gap — globe shows through */}
          <div className="hidden lg:block lg:col-start-2 lg:row-start-1" />

          {/* Right panel: Fleet / Responses */}
          <SidePanel
            className="lg:col-start-3 lg:row-span-2"
            side="right"
            collapsed={rightCollapsed}
            onToggle={toggleRight}
            icon={rightIcon}
            title={rightTitle}
          >
            <TabBar
              tabs={[
                { id: "fleet", label: "Fleet" },
                { id: "responses", label: "Responses" },
              ]}
              activeTab={rightActiveTab}
              onTabChange={(id) => setRightActiveTab(id as "fleet" | "responses")}
            />
            {rightActiveTab === "fleet" ? (
              <FleetPanel
                satellites={MOCK_SATELLITES}
                selectedSatelliteId={selectedSatelliteId}
                onSelectSatellite={selectSatellite}
              />
            ) : (
              <ResponsePanel recommendations={MOCK_RECOMMENDATIONS} />
            )}
          </SidePanel>

          {/* Bottom: AI Terminal */}
          <AITerminal
            className="lg:col-start-2 lg:row-start-2"
            isOpen={terminalOpen}
            onToggle={toggleTerminal}
          />
        </div>
      </div>
    </main>
  )
}

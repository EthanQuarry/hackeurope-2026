"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { ThreatProximityTab } from "./threat-proximity-tab"
import { ThreatSignalTab } from "./threat-signal-tab"
import { ThreatAnomalyTab } from "./threat-anomaly-tab"
import type { ProximityThreat, SignalThreat, AnomalyThreat } from "@/types"

interface ThreatPanelProps {
  proximityThreats: ProximityThreat[]
  signalThreats: SignalThreat[]
  anomalyThreats: AnomalyThreat[]
  selectedThreatId?: string | null
  onSelectThreat?: (id: string) => void
}

const THREAT_TABS = [
  { id: "proximity" as const, label: "Proximity" },
  { id: "signal" as const, label: "Signal" },
  { id: "anomaly" as const, label: "Anomaly" },
]

type ThreatTabId = (typeof THREAT_TABS)[number]["id"]

export function ThreatPanel({
  proximityThreats,
  signalThreats,
  anomalyThreats,
  selectedThreatId,
  onSelectThreat,
}: ThreatPanelProps) {
  const [activeTab, setActiveTab] = useState<ThreatTabId>("proximity")

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-border/40 pb-2">
        {THREAT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
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

      {/* Tab content */}
      {activeTab === "proximity" && (
        <ThreatProximityTab
          threats={proximityThreats}
          selectedThreatId={selectedThreatId}
          onSelectThreat={onSelectThreat}
        />
      )}
      {activeTab === "signal" && (
        <ThreatSignalTab
          threats={signalThreats}
          selectedThreatId={selectedThreatId}
          onSelectThreat={onSelectThreat}
        />
      )}
      {activeTab === "anomaly" && (
        <ThreatAnomalyTab
          threats={anomalyThreats}
          selectedThreatId={selectedThreatId}
          onSelectThreat={onSelectThreat}
        />
      )}
    </div>
  )
}

"use client"

import { ArrowUpRight, Brain, Lightbulb, ShieldAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import { THREAT_COLORS, type ThreatSeverity } from "@/lib/constants"
import { MOCK_PROXIMITY_THREATS, MOCK_ANOMALY_THREATS } from "@/lib/mock-data"
import { ScrollArea } from "@/components/ui/scroll-area"

interface MiniCardProps {
  name: string
  description: string
  severity: ThreatSeverity
}

function MiniCard({ name, description, severity }: MiniCardProps) {
  const colors = THREAT_COLORS[severity]

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]">
      <span
        className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", colors.bg)}
        style={{ backgroundColor: colors.hex }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-gray-200">{name}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-gray-400">
          {description}
        </p>
      </div>
      <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-gray-500 transition-colors group-hover:text-gray-300" />
    </div>
  )
}

export function InsightsCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex w-[280px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-card/60 backdrop-blur-xl shadow-2xl",
        className
      )}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <Brain className="h-4 w-4 text-cyan-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
          AI Insights
        </h2>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {/* Predictions section */}
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Predictions
              </h3>
            </div>
            <div className="space-y-2">
              {MOCK_PROXIMITY_THREATS.map((threat) => (
                <MiniCard
                  key={threat.id}
                  name={threat.foreignSatName}
                  description={`Approaching ${threat.targetAssetName} — ${threat.missDistanceKm} km miss distance, TCA T+${threat.tcaInMinutes} min`}
                  severity={threat.severity}
                />
              ))}
            </div>
          </div>

          {/* Recommendations section */}
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-cyan-400" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Recommendations
              </h3>
            </div>
            <div className="space-y-2">
              {MOCK_ANOMALY_THREATS.map((threat) => (
                <MiniCard
                  key={threat.id}
                  name={threat.satelliteName}
                  description={threat.description}
                  severity={threat.severity}
                />
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

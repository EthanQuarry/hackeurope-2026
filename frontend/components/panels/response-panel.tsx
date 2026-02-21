"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { ResponseRecommendation } from "@/types"

interface ResponsePanelProps {
  recommendations: ResponseRecommendation[]
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}

const typeIcons: Record<ResponseRecommendation["type"], string> = {
  maneuver: "MNV",
  alert: "ALT",
  monitor: "MON",
  escalate: "ESC",
}

const typeColors: Record<ResponseRecommendation["type"], string> = {
  maneuver: "text-cyan-400 bg-cyan-500/15 border-cyan-500/40",
  alert: "text-amber-300 bg-amber-500/15 border-amber-500/40",
  monitor: "text-emerald-400 bg-emerald-500/15 border-emerald-500/40",
  escalate: "text-red-400 bg-red-500/15 border-red-500/40",
}

export function ResponsePanel({ recommendations, onApprove, onReject }: ResponsePanelProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {recommendations.length} pending recommendations
        </span>
      </div>

      <Separator className="bg-border/40" />

      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              className="rounded-md border border-border/40 bg-secondary/30 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase",
                    typeColors[rec.type]
                  )}
                >
                  {typeIcons[rec.type]}
                </span>
                <div className="flex items-center gap-1">
                  <div className="h-1 w-8 overflow-hidden rounded-full bg-border/40">
                    <div
                      className="h-full rounded-full bg-primary/60"
                      style={{ width: `${rec.confidence * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {(rec.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <p className="mt-2 text-xs text-foreground/90">{rec.description}</p>

              {rec.deltaV !== undefined && (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  dV: {rec.deltaV.toFixed(3)} m/s
                </p>
              )}

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => onApprove?.(rec.id)}
                  className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400 transition-colors hover:bg-emerald-500/20"
                >
                  APPROVE
                </button>
                <button
                  type="button"
                  onClick={() => onReject?.(rec.id)}
                  className="rounded border border-border/40 bg-secondary/30 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-secondary/50"
                >
                  REJECT
                </button>
              </div>
            </div>
          ))}

          {recommendations.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No pending recommendations
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

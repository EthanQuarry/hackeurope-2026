"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { StatusDot } from "@/components/shared/status-dot"
import type { SatelliteData } from "@/types"

interface CommsPanelProps {
  satellites: SatelliteData[]
}

interface LinkStatus {
  id: string
  name: string
  linkType: "S-BAND" | "X-BAND" | "KA-BAND" | "LASER"
  quality: number
  latencyMs: number
  encrypted: boolean
}

function generateLinkStatuses(satellites: SatelliteData[]): LinkStatus[] {
  return satellites.map((sat, i) => ({
    id: sat.id,
    name: sat.name,
    linkType: (["S-BAND", "X-BAND", "KA-BAND", "LASER"] as const)[i % 4],
    quality: 60 + Math.floor(Math.random() * 40),
    latencyMs: Math.floor(5 + Math.random() * 45),
    encrypted: true,
  }))
}

export function CommsPanel({ satellites }: CommsPanelProps) {
  const links = generateLinkStatuses(satellites)

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {links.length} active links
        </span>
        <span className="font-mono text-[10px] text-emerald-400">ALL ENCRYPTED</span>
      </div>

      <Separator className="bg-border/40" />

      <ScrollArea className="flex-1">
        <div className="space-y-1.5 pr-2">
          {links.map((link) => {
            const qualityStatus =
              link.quality > 80
                ? "nominal" as const
                : link.quality > 50
                  ? "watched" as const
                  : "threatened" as const

            return (
              <div
                key={link.id}
                className="flex items-center gap-3 rounded-md border border-border/30 bg-secondary/20 px-3 py-2"
              >
                <StatusDot status={qualityStatus} pulse={false} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {link.name}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {link.linkType}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] tabular-nums text-foreground">
                    {link.quality}%
                  </p>
                  <p className="font-mono text-[9px] tabular-nums text-muted-foreground">
                    {link.latencyMs}ms
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

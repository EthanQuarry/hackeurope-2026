import { cn } from "@/lib/utils"
import { THREAT_COLORS, type ThreatSeverity } from "@/lib/constants"

interface StatusDotProps {
  status: ThreatSeverity
  className?: string
  pulse?: boolean
}

const dotColorMap: Record<ThreatSeverity, string> = {
  nominal: "bg-cyan-400",
  watched: "bg-amber-400",
  threatened: "bg-red-400",
  friendly: "bg-emerald-400",
}

const pulseColorMap: Record<ThreatSeverity, string> = {
  nominal: "bg-cyan-400/50",
  watched: "bg-amber-400/50",
  threatened: "bg-red-400/50",
  friendly: "bg-emerald-400/50",
}

export function StatusDot({ status, className, pulse = true }: StatusDotProps) {
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            pulseColorMap[status]
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          dotColorMap[status]
        )}
      />
    </span>
  )
}

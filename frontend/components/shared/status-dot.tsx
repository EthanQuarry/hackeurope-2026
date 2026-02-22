import { cn } from "@/lib/utils"
import { THREAT_COLORS, type ThreatSeverity } from "@/lib/constants"

interface StatusDotProps {
  status: ThreatSeverity
  className?: string
  pulse?: boolean
}

const dotColorMap: Record<ThreatSeverity, string> = {
  allied: "bg-emerald-400",
  nominal: "bg-emerald-400",
  friendly: "bg-emerald-400",
  watched: "bg-blue-400",
  threatened: "bg-amber-400",
  threat: "bg-red-400",
}

export function StatusDot({ status, className, pulse = true }: StatusDotProps) {
  const shouldPulse = pulse && status === "threatened"
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      {shouldPulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            "bg-amber-400/50"
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

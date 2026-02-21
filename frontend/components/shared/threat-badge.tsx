import { cn } from "@/lib/utils"
import { THREAT_COLORS, type ThreatSeverity } from "@/lib/constants"

interface ThreatBadgeProps {
  severity: ThreatSeverity
  className?: string
}

export function ThreatBadge({ severity, className }: ThreatBadgeProps) {
  const colors = THREAT_COLORS[severity]

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
        colors.text,
        colors.bg,
        colors.border,
        className
      )}
    >
      {severity}
    </span>
  )
}

import { cn } from "@/lib/utils"

interface TelemetryRowProps {
  label: string
  value: string | number
  unit?: string
  className?: string
}

export function TelemetryRow({ label, value, unit, className }: TelemetryRowProps) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2 py-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs tabular-nums text-foreground">
        {value}
        {unit ? <span className="ml-0.5 text-muted-foreground">{unit}</span> : null}
      </span>
    </div>
  )
}

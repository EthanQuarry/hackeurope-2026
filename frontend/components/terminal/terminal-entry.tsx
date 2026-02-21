"use client"

import { cn } from "@/lib/utils"
import type { TerminalLogEntry } from "@/types"

interface TerminalEntryProps {
  entry: TerminalLogEntry
}

export function TerminalEntry({ entry }: TerminalEntryProps) {
  return (
    <div className={cn("mb-0.5 last:mb-0", entry.color)}>
      <span className="text-gray-600">[{entry.timestamp}]</span>{" "}
      {entry.text}
    </div>
  )
}

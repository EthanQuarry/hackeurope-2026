"use client"

import { useState, useRef, useEffect } from "react"
import { Play, Square, ChevronDown, Swords } from "lucide-react"

import { cn } from "@/lib/utils"
import { useGlobeStore } from "@/stores/globe-store"

interface Demo {
  id: string
  label: string
  description: string
}

const DEMOS: Demo[] = [
  {
    id: "malicious-manoeuvre",
    label: "Malicious Manoeuvre",
    description: "SJ-26 executes covert orbital transfer toward USA-245 reconnaissance asset",
  },
]

export function DemoSelector({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeDemo = useGlobeStore((s) => s.activeDemo)
  const setActiveDemo = useGlobeStore((s) => s.setActiveDemo)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function handleSelect(demo: Demo) {
    // Reset scenario clock so it starts fresh
    fetch("/api/backend/scenario/reset", { method: "POST" }).catch(() => {})
    setActiveDemo(demo.id)
    setOpen(false)
  }

  function handleStop() {
    setActiveDemo(null)
  }

  // When a demo is active, show the stop bar instead of the dropdown trigger
  if (activeDemo) {
    const demo = DEMOS.find((d) => d.id === activeDemo)
    return (
      <div className={cn("pointer-events-auto", className)}>
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 shadow-2xl backdrop-blur-xl">
          <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300">
            {demo?.label ?? "Demo"}
          </span>
          <button
            type="button"
            onClick={handleStop}
            className="ml-1 flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-gray-300 transition-colors hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-300"
          >
            <Square className="h-2.5 w-2.5" />
            Stop
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn("pointer-events-auto relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-card/60 px-3 py-2 text-xs font-medium backdrop-blur-xl shadow-2xl transition-colors hover:bg-white/[0.06] hover:text-gray-100 text-gray-300"
      >
        <Swords className="h-3.5 w-3.5" />
        <span className="font-mono text-[11px] uppercase tracking-wider">Demos</span>
        <ChevronDown className={cn("h-3 w-3 text-gray-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-white/10 bg-card/95 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-white/5 px-3 py-2">
            <p className="font-mono text-[9px] uppercase tracking-wider text-gray-500">
              Scenario Demos
            </p>
          </div>

          <div className="py-1">
            {DEMOS.map((demo) => (
              <button
                key={demo.id}
                type="button"
                onClick={() => handleSelect(demo)}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-gray-500">
                  <Play className="h-2.5 w-2.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-200">{demo.label}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-gray-500">
                    {demo.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

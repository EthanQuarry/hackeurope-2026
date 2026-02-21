"use client"

import { useRef, useEffect } from "react"
import { useFrame } from "@react-three/fiber"
import { useGlobeStore } from "@/stores/globe-store"

/**
 * Central simulation clock. Runs at display refresh rate via useFrame.
 * Updates Zustand store at 4Hz for UI, uses refs for per-frame animation.
 */
export function AnimationDriver({
  simTimeRef,
  speedRef,
}: {
  simTimeRef: React.RefObject<number>
  speedRef: React.RefObject<number>
}) {
  const lastSyncRef = useRef(0)

  // Keep speedRef in sync with store
  const speed = useGlobeStore((s) => s.speed)
  const playing = useGlobeStore((s) => s.playing)

  useEffect(() => {
    ;(speedRef as React.MutableRefObject<number>).current = speed
  }, [speed, speedRef])

  useFrame((_, delta) => {
    if (!playing) return

    // Advance simulation time using ref (per-frame, no re-render)
    ;(simTimeRef as React.MutableRefObject<number>).current += delta * 1000 * speedRef.current

    // Sync to Zustand at 4Hz for UI display
    const now = performance.now()
    if (now - lastSyncRef.current > 250) {
      lastSyncRef.current = now
      useGlobeStore.getState().setSimTime(simTimeRef.current)
    }
  })

  return null
}

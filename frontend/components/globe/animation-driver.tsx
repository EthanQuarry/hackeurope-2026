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
  const prevSpeedRef = useRef(speed)

  useEffect(() => {
    ;(speedRef as React.MutableRefObject<number>).current = speed
  }, [speed, speedRef])

  // Bootstrap: ensure simTimeRef has a valid time on mount. Trajectories use Unix
  // seconds; simTimeRef must be in ms. Sync ref and store so satellites render.
  useEffect(() => {
    const now = Date.now()
    ;(simTimeRef as React.MutableRefObject<number>).current = now
    useGlobeStore.getState().setSimTime(now)
  }, [simTimeRef])

  // When speed transitions to 1 (Real Time), sync simTime to live wall-clock
  // so satellite positions show current orbital positions instead of propagated
  useEffect(() => {
    if (speed === 1 && prevSpeedRef.current !== 1) {
      const now = Date.now()
      ;(simTimeRef as React.MutableRefObject<number>).current = now
      useGlobeStore.getState().setSimTime(now)
    }
    prevSpeedRef.current = speed
  }, [speed, simTimeRef])

  useFrame((_, delta) => {
    if (!playing) return

    const speed = speedRef.current
    if (speed === 1) {
      // Real Time: stay synced to live wall-clock for current orbital positions
      ;(simTimeRef as React.MutableRefObject<number>).current = Date.now()
    } else {
      // Future speeds: advance at selected rate for propagated positions
      ;(simTimeRef as React.MutableRefObject<number>).current += delta * 1000 * speed
    }

    // Sync to Zustand at 4Hz for UI display
    const now = performance.now()
    if (now - lastSyncRef.current > 250) {
      lastSyncRef.current = now
      useGlobeStore.getState().setSimTime(simTimeRef.current)
    }
  })

  return null
}

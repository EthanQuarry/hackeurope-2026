"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Sync a ref value to React state at a throttled interval.
 * Used for bridging per-frame 3D animation (refs) to React UI (state).
 *
 * @param refValue - The React ref to read from
 * @param intervalMs - How often to sync (default 250ms = 4Hz)
 */
export function useThrottledSync<T>(
  refValue: React.RefObject<T>,
  intervalMs: number = 250
): T {
  const [state, setState] = useState<T>(refValue.current)
  const lastRef = useRef(refValue.current)

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = refValue.current
      if (current !== lastRef.current) {
        lastRef.current = current
        setState(current)
      }
    }, intervalMs)

    return () => window.clearInterval(interval)
  }, [refValue, intervalMs])

  return state
}

"use client"

import { useEffect, useRef, useState, useCallback } from "react"

interface UsePollingOptions<T> {
  url: string
  intervalMs: number
  enabled?: boolean
  onData?: (data: T) => void
  onError?: (error: Error) => void
}

/**
 * Generic polling hook with AbortController cleanup.
 * Falls back silently on network errors (keeps previous data).
 */
export function usePolling<T>({
  url,
  intervalMs,
  enabled = true,
  onData,
  onError,
}: UsePollingOptions<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)

  const fetchData = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const payload = (await res.json()) as T
      setData(payload)
      setError(null)
      onData?.(payload)
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        const err = e as Error
        setError(err)
        onError?.(err)
      }
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [url, onData, onError])

  useEffect(() => {
    if (!enabled) return

    // Initial fetch
    fetchData()

    // Polling interval
    const interval = window.setInterval(fetchData, intervalMs)

    return () => {
      window.clearInterval(interval)
      abortRef.current?.abort()
    }
  }, [enabled, intervalMs, fetchData])

  return { data, loading, error }
}

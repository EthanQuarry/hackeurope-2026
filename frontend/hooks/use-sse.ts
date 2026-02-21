"use client"

import { useCallback, useRef, useState } from "react"

interface SSEOptions {
  onEvent: (event: Record<string, unknown>) => void
  onError?: (error: Error) => void
  onDone?: () => void
}

export function useSSE() {
  const [connected, setConnected] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const connect = useCallback(async (url: string, options: SSEOptions) => {
    // Abort any existing connection
    abortRef.current?.abort()

    const ctrl = new AbortController()
    abortRef.current = ctrl
    setConnected(true)

    try {
      const res = await fetch(url, { signal: ctrl.signal })

      if (!res.ok || !res.body) {
        options.onError?.(new Error(`HTTP ${res.status}`))
        setConnected(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))
            options.onEvent(event)
          } catch {
            // Skip malformed lines
          }
        }
      }

      options.onDone?.()
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        options.onError?.(e as Error)
      }
    } finally {
      setConnected(false)
      abortRef.current = null
    }
  }, [])

  const disconnect = useCallback(() => {
    abortRef.current?.abort()
    setConnected(false)
  }, [])

  return { connect, disconnect, connected }
}

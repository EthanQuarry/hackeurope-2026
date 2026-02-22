/** API endpoints for backend integration */

const BASE = "/api/backend"

export const api = {
  satellites: `${BASE}/satellites`,
  debris: `${BASE}/debris`,
  threats: `${BASE}/threats`,
  proximityThreats: `${BASE}/threats/proximity`,
  signalThreats: `${BASE}/threats/signal`,
  anomalyThreats: `${BASE}/threats/anomaly`,
  orbitalSimilarityThreats: `${BASE}/threats/orbital-similarity`,
  analysisStream: `${BASE}/analysis/stream`,
  responses: `${BASE}/responses`,
  commsChat: `${BASE}/comms/chat`,
  commsStream: `${BASE}/comms/stream`,
  commsSend: `${BASE}/comms/send`,
} as const

/** Typed fetch with AbortController support */
export async function fetchJSON<T>(
  url: string,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

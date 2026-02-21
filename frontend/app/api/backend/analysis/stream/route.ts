const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const prompt = searchParams.get("prompt")

  let url = `${BACKEND_URL}/analysis/stream`
  if (prompt) url += `?prompt=${encodeURIComponent(prompt)}`

  const backendRes = await fetch(url, {
    headers: { Accept: "text/event-stream" },
    signal: request.signal,
  })

  if (!backendRes.ok || !backendRes.body) {
    return new Response("Backend unavailable", { status: 502 })
  }

  return new Response(backendRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

"""Threat response SSE endpoint — streams agent reasoning and decision."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.agents.response_agent import ThreatResponseAgent

logger = logging.getLogger(__name__)

router = APIRouter()


def _sse_line(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _response_generator(
    satellite_id: str,
    satellite_name: str,
    threat_satellite_id: str,
    threat_satellite_name: str,
    threat_score: float,
    miss_distance_km: float,
    approach_pattern: str,
    tca_minutes: int,
):
    """Run the ThreatResponseAgent and yield SSE events live as they happen."""

    yield _sse_line({
        "type": "response_start",
        "satellite_id": satellite_id,
        "satellite_name": satellite_name,
        "threat_satellite_id": threat_satellite_id,
        "threat_satellite_name": threat_satellite_name,
        "threat_score": threat_score,
    })
    await asyncio.sleep(0.1)

    # Async queue so progress events stream live during agent execution
    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    async def on_progress(text: str):
        if text.startswith("[Tool:"):
            await queue.put({"type": "response_tool", "text": text})
        else:
            await queue.put({"type": "response_progress", "text": text})

    agent = ThreatResponseAgent(on_progress=on_progress)

    # Run agent in background task so we can yield from queue concurrently
    async def run_agent():
        try:
            decision = await agent.run(
                satellite_id=satellite_id,
                satellite_name=satellite_name,
                threat_satellite_id=threat_satellite_id,
                threat_satellite_name=threat_satellite_name,
                threat_score=threat_score,
                miss_distance_km=miss_distance_km,
                approach_pattern=approach_pattern,
                tca_minutes=tca_minutes,
            )
            await queue.put({"type": "response_complete", "data": decision.model_dump()})
        except Exception as exc:
            logger.exception("Threat response agent failed")
            await queue.put({"type": "response_error", "message": str(exc)})
        finally:
            await queue.put(None)  # sentinel to stop yielding

    task = asyncio.create_task(run_agent())

    # Yield events from queue as they arrive — live streaming
    while True:
        event = await queue.get()
        if event is None:
            break
        yield _sse_line(event)

    await task  # ensure clean completion


@router.get("/response/stream")
async def response_stream(
    request: Request,
    satellite_id: str,
    satellite_name: str = "Unknown",
    threat_satellite_id: str = "",
    threat_satellite_name: str = "Unknown",
    threat_score: float = 90.0,
    miss_distance_km: float = 0.0,
    approach_pattern: str = "unknown",
    tca_minutes: int = 0,
):
    """SSE endpoint for threat response agent streaming."""
    async def event_generator():
        try:
            async for event in _response_generator(
                satellite_id=satellite_id,
                satellite_name=satellite_name,
                threat_satellite_id=threat_satellite_id,
                threat_satellite_name=threat_satellite_name,
                threat_score=threat_score,
                miss_distance_km=miss_distance_km,
                approach_pattern=approach_pattern,
                tca_minutes=tca_minutes,
            ):
                if await request.is_disconnected():
                    break
                yield event
        except Exception as exc:
            logger.exception("SSE response stream error")
            yield _sse_line({"type": "response_error", "message": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )

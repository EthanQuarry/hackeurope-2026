"""GET /comms/stream — SSE endpoint for Iridium SBD communication transcription."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.agents.iridium_agent import IridiumProtocolAgent
from app.models import CommsRequest

logger = logging.getLogger(__name__)

router = APIRouter()


def _sse_line(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _comms_generator(message: str, target_satellite_id: str | None = None):
    """Run the Iridium Protocol Agent and yield SSE events for each stage."""

    # Stage 0: Start
    yield _sse_line({"type": "comms_start", "message": message})
    await asyncio.sleep(0.2)

    # Stage 1: Echo human input
    yield _sse_line({
        "type": "comms_stage",
        "stage": "human_input",
        "data": {"text": message},
    })
    await asyncio.sleep(0.3)

    # Run the agent, collecting progress events
    progress_events: list[str] = []

    async def on_progress(text: str):
        progress_events.append(text)

    agent = IridiumProtocolAgent(on_progress=on_progress)

    try:
        transcription = await agent.run(message, target_satellite_id)
    except Exception as exc:
        logger.exception("Iridium agent failed")
        yield _sse_line({"type": "comms_error", "message": str(exc)})
        return

    # Emit agent reasoning / progress
    for ev in progress_events:
        yield _sse_line({
            "type": "comms_stage",
            "stage": "agent_reasoning",
            "data": {"text": ev},
        })
        await asyncio.sleep(0.05)

    await asyncio.sleep(0.3)

    # Stage 2: Parsed intent
    yield _sse_line({
        "type": "comms_stage",
        "stage": "parsed_intent",
        "data": transcription.parsed_intent.model_dump(),
    })
    await asyncio.sleep(0.4)

    # Stage 3: AT command sequence
    yield _sse_line({
        "type": "comms_stage",
        "stage": "at_commands",
        "data": transcription.at_commands.model_dump(),
    })
    await asyncio.sleep(0.4)

    # Stage 4: Binary SBD payload
    yield _sse_line({
        "type": "comms_stage",
        "stage": "sbd_payload",
        "data": transcription.sbd_payload.model_dump(),
    })
    await asyncio.sleep(0.4)

    # Stage 5: Gateway routing
    yield _sse_line({
        "type": "comms_stage",
        "stage": "gateway_routing",
        "data": transcription.gateway_routing.model_dump(),
    })
    await asyncio.sleep(0.3)

    # Complete — send full transcription
    yield _sse_line({
        "type": "comms_complete",
        "data": transcription.model_dump(),
    })


@router.get("/comms/stream")
async def comms_stream(
    request: Request,
    message: str,
    target_satellite_id: str | None = None,
):
    """SSE endpoint for Iridium SBD communication transcription."""

    async def event_generator():
        try:
            async for event in _comms_generator(message, target_satellite_id):
                if await request.is_disconnected():
                    break
                yield event
        except Exception as exc:
            logger.exception("SSE comms stream error")
            yield _sse_line({"type": "comms_error", "message": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/comms/send")
async def comms_send(body: CommsRequest):
    """Synchronous endpoint — runs the full pipeline and returns the transcription."""
    agent = IridiumProtocolAgent()
    transcription = await agent.run(body.message, body.target_satellite_id)
    return transcription.model_dump()

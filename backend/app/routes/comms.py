"""Iridium SBD communication routes — chat, stream, and send endpoints."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.agents.base_agent import _get_client, MODEL_ID, MAX_TOKENS
from app.agents.iridium_agent import (
    IridiumProtocolAgent,
    _handle_lookup_satellite,
    _handle_lookup_satellite_position,
    TOOLS as IRIDIUM_TOOLS,
)
from app.models import CommsRequest, CommsChatRequest, CommsChatResponse, ParsedIntent, SatelliteCommandType

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Chat system prompt ──────────────────────────────────────────────

CHAT_SYSTEM_PROMPT = """You are an Iridium satellite communications officer in the Orbital Shield space defense system. Operators chat with you in plain English to issue satellite commands.

Your job is to have a SHORT conversation to understand exactly what command they want to send, then present it for their approval.

RULES:
1. Keep responses brief (1-3 sentences). This is a military ops console, not a chatbot.
2. If the operator's intent is clear enough to build a command, DO NOT ask more questions — go straight to presenting the command.
3. If critical info is missing (which satellite? what action?), ask ONE focused clarifying question.
4. You have access to tools to look up satellites. Use them when the operator mentions a satellite by name.

WHEN YOU HAVE ENOUGH INFORMATION, respond with your conversational text FOLLOWED BY a JSON block wrapped in ```command markers like this:

Your conversational reply here.

```command
{
  "command_type": "orbit_adjust",
  "target_satellite_id": "sat-6",
  "target_satellite_name": "USA-245 (NROL-65)",
  "parameters": {"delta_v_ms": 0.15, "burn_direction": "retrograde", "reason": "collision_avoidance"},
  "urgency": "urgent",
  "summary": "Execute 0.15 m/s retrograde burn on USA-245 for collision avoidance against SJ-26"
}
```

Command types: orbit_adjust, attitude_control, telemetry_request, power_management, comm_relay_config, emergency_safe_mode
Urgency levels: normal, urgent, emergency

IMPORTANT: Only include the ```command block when you are confident you have enough information. The operator will review and approve before transmission."""


# ── POST /comms/chat ────────────────────────────────────────────────

@router.post("/comms/chat")
async def comms_chat(body: CommsChatRequest) -> CommsChatResponse:
    """Conversational endpoint — chat with the operator to build a command."""
    client = _get_client()

    # Convert to Claude message format
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    # Run with tools so the agent can look up satellites
    tools = [
        {
            "name": "lookup_satellite",
            "description": "Look up satellite metadata by name or catalog ID. Returns NORAD ID, name, nation, owner, purpose, and IMEI.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Satellite name or ID"}
                },
                "required": ["query"],
            },
        },
        {
            "name": "lookup_satellite_position",
            "description": "Get current position (lat, lon, altitude) of a satellite.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "satellite_id": {"type": "integer", "description": "Satellite catalog ID"}
                },
                "required": ["satellite_id"],
            },
        },
    ]

    tool_handlers = {
        "lookup_satellite": _handle_lookup_satellite,
        "lookup_satellite_position": _handle_lookup_satellite_position,
    }

    # Tool loop (same pattern as BaseAgent._run_with_tools but inline)
    current_messages = list(messages)
    final_text = ""

    for _ in range(5):
        response = await asyncio.to_thread(
            client.messages.create,
            model=MODEL_ID,
            max_tokens=MAX_TOKENS,
            system=CHAT_SYSTEM_PROMPT,
            messages=current_messages,
            tools=tools,
        )

        text_parts = []
        tool_uses = []

        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_uses.append({"id": block.id, "name": block.name, "input": block.input})

        if not tool_uses:
            final_text = "".join(text_parts)
            break

        # Build assistant message with tool_use blocks
        assistant_content = []
        for block in response.content:
            if block.type == "text":
                assistant_content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                assistant_content.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })
        current_messages.append({"role": "assistant", "content": assistant_content})

        # Execute tools
        tool_results = []
        for tu in tool_uses:
            handler = tool_handlers.get(tu["name"])
            if handler:
                try:
                    result = handler(tu["input"])
                    result_str = json.dumps(result) if not isinstance(result, str) else result
                except Exception as exc:
                    result_str = json.dumps({"error": str(exc)})
            else:
                result_str = json.dumps({"error": f"Unknown tool: {tu['name']}"})
            tool_results.append({"type": "tool_result", "tool_use_id": tu["id"], "content": result_str})

        current_messages.append({"role": "user", "content": tool_results})

    if not final_text:
        final_text = "".join(text_parts) if text_parts else "I couldn't process that request."

    # Check if the response contains a ```command block
    command_ready = False
    parsed_command = None
    parsed_intent = None
    reply_text = final_text

    if "```command" in final_text:
        parts = final_text.split("```command")
        reply_text = parts[0].strip()
        try:
            json_str = parts[1].split("```")[0].strip()
            cmd_data = json.loads(json_str)
            parsed_command = json_str
            parsed_intent = ParsedIntent(
                command_type=SatelliteCommandType(cmd_data["command_type"]),
                target_satellite_id=cmd_data["target_satellite_id"],
                target_satellite_name=cmd_data["target_satellite_name"],
                parameters=cmd_data.get("parameters", {}),
                urgency=cmd_data.get("urgency", "normal"),
                summary=cmd_data["summary"],
            )
            command_ready = True
        except (json.JSONDecodeError, KeyError, IndexError, ValueError) as exc:
            logger.warning("Failed to parse command block: %s", exc)

    return CommsChatResponse(
        reply=reply_text,
        command_ready=command_ready,
        parsed_command=parsed_command,
        parsed_intent=parsed_intent,
    )


# ── SSE helpers ─────────────────────────────────────────────────────

def _sse_line(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _comms_generator(message: str, target_satellite_id: str | None = None):
    """Run the Iridium Protocol Agent and yield SSE events for each stage."""

    yield _sse_line({"type": "comms_start", "message": message})
    await asyncio.sleep(0.2)

    yield _sse_line({
        "type": "comms_stage",
        "stage": "human_input",
        "data": {"text": message},
    })
    await asyncio.sleep(0.3)

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

    for ev in progress_events:
        yield _sse_line({
            "type": "comms_stage",
            "stage": "agent_reasoning",
            "data": {"text": ev},
        })
        await asyncio.sleep(0.05)

    await asyncio.sleep(0.3)

    yield _sse_line({"type": "comms_stage", "stage": "parsed_intent", "data": transcription.parsed_intent.model_dump()})
    await asyncio.sleep(0.4)

    yield _sse_line({"type": "comms_stage", "stage": "at_commands", "data": transcription.at_commands.model_dump()})
    await asyncio.sleep(0.4)

    yield _sse_line({"type": "comms_stage", "stage": "sbd_payload", "data": transcription.sbd_payload.model_dump()})
    await asyncio.sleep(0.4)

    yield _sse_line({"type": "comms_stage", "stage": "gateway_routing", "data": transcription.gateway_routing.model_dump()})
    await asyncio.sleep(0.3)

    yield _sse_line({"type": "comms_complete", "data": transcription.model_dump()})


@router.get("/comms/stream")
async def comms_stream(request: Request, message: str, target_satellite_id: str | None = None):
    """SSE endpoint for Iridium SBD protocol transcription."""
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
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/comms/send")
async def comms_send(body: CommsRequest):
    """Synchronous endpoint — runs the full pipeline and returns the transcription."""
    agent = IridiumProtocolAgent()
    transcription = await agent.run(body.message, body.target_satellite_id)
    return transcription.model_dump()

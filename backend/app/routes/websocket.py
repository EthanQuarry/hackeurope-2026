"""WebSocket endpoint — streams agent pipeline updates to connected clients."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models import SatelliteData, WSMessage, WSMessageType
from app.agents.pipeline import run_pipeline

logger = logging.getLogger(__name__)

router = APIRouter()

# Pending analyses from HTTP endpoint (analysis_id -> satellites)
pending_analyses: dict[str, list[SatelliteData]] = {}

# Active WebSocket connections
active_connections: list[WebSocket] = []


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    active_connections.append(ws)
    logger.info("WebSocket client connected (%d total)", len(active_connections))

    try:
        while True:
            # Wait for client messages
            data = await ws.receive_text()
            message = json.loads(data)

            if message.get("type") == "analyze":
                # Client sends satellite data directly over WS
                satellites_raw = message.get("satellites", [])
                satellites = [SatelliteData(**s) for s in satellites_raw]

                if not satellites:
                    await ws.send_json(
                        WSMessage(type=WSMessageType.ERROR, data="No satellite data provided").model_dump()
                    )
                    continue

                logger.info("WS analyze request: %d satellites", len(satellites))

                # Run pipeline, streaming updates back to this client
                async def ws_callback(msg: dict):
                    try:
                        await ws.send_json(msg)
                    except Exception:
                        logger.warning("Failed to send WS message")

                try:
                    await run_pipeline(satellites, ws_callback)
                except Exception as exc:
                    logger.exception("Pipeline failed")
                    await ws.send_json(
                        WSMessage(type=WSMessageType.ERROR, data=str(exc)).model_dump()
                    )

            elif message.get("type") == "analyze_by_id":
                # Client references a pending analysis from HTTP endpoint
                analysis_id = message.get("analysis_id")
                satellites = pending_analyses.pop(analysis_id, None)

                if not satellites:
                    await ws.send_json(
                        WSMessage(type=WSMessageType.ERROR, data=f"No pending analysis: {analysis_id}").model_dump()
                    )
                    continue

                async def ws_callback(msg: dict):
                    try:
                        await ws.send_json(msg)
                    except Exception:
                        logger.warning("Failed to send WS message")

                try:
                    await run_pipeline(satellites, ws_callback)
                except Exception as exc:
                    logger.exception("Pipeline failed")
                    await ws.send_json(
                        WSMessage(type=WSMessageType.ERROR, data=str(exc)).model_dump()
                    )

            elif message.get("type") == "ping":
                await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as exc:
        logger.exception("WebSocket error")
    finally:
        if ws in active_connections:
            active_connections.remove(ws)

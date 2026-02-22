"""Routes for adversary satellite research.

POST /api/adversary/research — trigger deep research on a satellite by NORAD ID
GET  /api/adversary/research/stream — SSE stream for research progress + results
GET  /api/adversary/catalog — list adversary satellites from Space-Track
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Body, Query, Request
from fastapi.responses import StreamingResponse

from agents.adversary_research_agent import AdversaryResearchAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/adversary", tags=["adversary"])


# ---------------------------------------------------------------------------
# SSE helper
# ---------------------------------------------------------------------------

def _sse_line(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# GET /api/adversary/catalog — list adversary nation satellites
# ---------------------------------------------------------------------------

_adversary_catalog_cache: list[dict] | None = None
_catalog_cache_time: float = 0


@router.get("/catalog")
async def get_adversary_catalog(
    country: str = Query(default="PRC,CIS", description="Comma-separated country codes (PRC, CIS, IR, NORK)"),
    limit: int = Query(default=200, le=500),
):
    """Fetch adversary nation payloads from Space-Track SATCAT."""
    import time
    global _adversary_catalog_cache, _catalog_cache_time

    now = time.time()
    if _adversary_catalog_cache and (now - _catalog_cache_time) < 3600:
        return {"satellites": _adversary_catalog_cache, "total": len(_adversary_catalog_cache)}

    try:
        from app.spacetrack import get_client
        st = get_client()
        st._login()

        countries = country.replace(" ", "")
        url = (
            f"https://www.space-track.org/basicspacedata/query"
            f"/class/gp/COUNTRY_CODE/{countries}"
            f"/OBJECT_TYPE/PAYLOAD/DECAY_DATE/null-val"
            f"/EPOCH/%3Enow-30"
            f"/orderby/NORAD_CAT_ID%20asc"
            f"/limit/{limit}"
            f"/format/json"
        )
        data = st._query(url)

        satellites = []
        for gp in data:
            norad_id = int(gp.get("NORAD_CAT_ID", 0))
            name = (gp.get("OBJECT_NAME") or f"OBJ-{norad_id}").strip()
            sma = float(gp.get("SEMIMAJOR_AXIS", 0))
            alt = sma - 6378.137 if sma > 0 else 0
            inc = float(gp.get("INCLINATION", 0))
            ecc = float(gp.get("ECCENTRICITY", 0))
            period = float(gp.get("PERIOD", 0))

            # Classify orbit type
            if period > 1400:
                orbit_type = "GEO"
            elif period > 600:
                orbit_type = "MEO"
            elif abs(inc - 97) < 5:
                orbit_type = "SSO"
            else:
                orbit_type = "LEO"

            satellites.append({
                "norad_id": norad_id,
                "name": name,
                "cospar_id": gp.get("OBJECT_ID", ""),
                "country_code": gp.get("COUNTRY_CODE", ""),
                "orbit_type": orbit_type,
                "altitude_km": round(alt, 1),
                "inclination_deg": round(inc, 2),
                "eccentricity": round(ecc, 6),
                "period_min": round(period, 2),
                "epoch": gp.get("EPOCH", ""),
                "launch_date": gp.get("LAUNCH_DATE", ""),
                "rcs_size": gp.get("RCS_SIZE", ""),
            })

        _adversary_catalog_cache = satellites
        _catalog_cache_time = now

        return {"satellites": satellites, "total": len(satellites)}

    except Exception as e:
        logger.exception("Failed to fetch adversary catalog")
        return {"satellites": [], "total": 0, "error": str(e)}


# ---------------------------------------------------------------------------
# GET /api/adversary/research/stream — SSE research stream
# ---------------------------------------------------------------------------

@router.get("/research/stream")
async def adversary_research_stream(
    request: Request,
    norad_id: int = Query(..., description="NORAD catalog number of the satellite to research"),
    name: str = Query(default="", description="Optional satellite name hint"),
    query: str = Query(default="", description="Optional follow-up research question"),
):
    """SSE endpoint that runs the adversary research agent and streams progress + results."""

    async def event_generator():
        progress_events: list[dict] = []

        async def on_progress(text: str):
            progress_events.append(text)

        try:
            # Initial scan event
            prefix = f'Follow-up: "{query}" — ' if query else ""
            yield _sse_line({
                "type": "scan",
                "text": f"{prefix}Initiating research on NORAD {norad_id}" + (f" ({name})" if name else ""),
            })
            await asyncio.sleep(0.1)

            # ── Phase 1: Quick brief (catalog + 1 search + quick Claude) ──
            yield _sse_line({
                "type": "context",
                "agent": "adversary-research",
                "text": "Generating preliminary brief from Space-Track catalog...",
            })

            brief_agent = AdversaryResearchAgent(on_progress=on_progress)
            try:
                brief_text = await brief_agent.brief(norad_id=norad_id, satellite_name=name)

                # Flush brief-phase progress
                while progress_events:
                    text = progress_events.pop(0)
                    if text.startswith("[Tool:"):
                        tool_name = text.split("]")[0].replace("[Tool: ", "")
                        yield _sse_line({"type": "tool_call", "agent": "adversary-research", "tools": [tool_name]})
                    else:
                        yield _sse_line({"type": "reasoning", "agent": "adversary-research", "text": text})

                # Emit the brief immediately so the frontend has something to show
                yield _sse_line({
                    "type": "brief",
                    "agent": "adversary-research",
                    "text": brief_text,
                })
            except Exception as exc:
                logger.warning("Brief generation failed, continuing to full research: %s", exc)
                yield _sse_line({
                    "type": "reasoning",
                    "agent": "adversary-research",
                    "text": f"Brief unavailable — proceeding to full research...",
                })

            if await request.is_disconnected():
                return

            # ── Phase 2: Full deep research ──
            yield _sse_line({
                "type": "context",
                "agent": "adversary-research",
                "text": "Starting full deep research — querying orbital history, running OSINT searches...",
            })

            agent = AdversaryResearchAgent(on_progress=on_progress)
            task = asyncio.create_task(agent.run(norad_id=norad_id, satellite_name=name, query=query))

            while not task.done():
                while progress_events:
                    text = progress_events.pop(0)
                    if text.startswith("[Tool:"):
                        tool_name = text.split("]")[0].replace("[Tool: ", "")
                        yield _sse_line({"type": "tool_call", "agent": "adversary-research", "tools": [tool_name]})
                    else:
                        yield _sse_line({"type": "reasoning", "agent": "adversary-research", "text": text})

                if await request.is_disconnected():
                    task.cancel()
                    return

                await asyncio.sleep(0.2)

            # Get full dossier (now a markdown string)
            dossier_text = task.result()

            # Flush remaining progress
            while progress_events:
                text = progress_events.pop(0)
                if text.startswith("[Tool:"):
                    tool_name = text.split("]")[0].replace("[Tool: ", "")
                    yield _sse_line({"type": "tool_call", "agent": "adversary-research", "tools": [tool_name]})
                else:
                    yield _sse_line({"type": "reasoning", "agent": "adversary-research", "text": text})

            # Emit the full dossier as plain text
            yield _sse_line({
                "type": "dossier",
                "agent": "adversary-research",
                "text": dossier_text,
            })

            yield _sse_line({"type": "complete"})

        except asyncio.CancelledError:
            yield _sse_line({"type": "complete"})
        except Exception as exc:
            logger.exception("Adversary research stream error")
            yield _sse_line({"type": "error", "message": str(exc)})
            yield _sse_line({"type": "complete"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# POST /api/adversary/research — simple JSON response (non-streaming)
# ---------------------------------------------------------------------------

@router.post("/research")
async def adversary_research(
    norad_id: int = Query(..., description="NORAD catalog number"),
    name: str = Query(default="", description="Optional satellite name"),
):
    """Run adversary research and return the full dossier as text."""
    agent = AdversaryResearchAgent()
    dossier = await agent.run(norad_id=norad_id, satellite_name=name)
    return {"dossier": dossier}


# ---------------------------------------------------------------------------
# POST /api/adversary/chat — AI chat about an adversary satellite
# ---------------------------------------------------------------------------

CHAT_SYSTEM_PROMPT = """You are a senior space-domain intelligence analyst. You answer questions about adversary satellites concisely and authoritatively.

If the user has provided an existing intelligence dossier as context, use it to inform your answers. Reference specific data points from the dossier when relevant.

If the question asks about something not covered in the dossier, say so and provide your best assessment based on general knowledge of the satellite program or operator.

Keep responses focused and under 300 words. Use military/intelligence terminology where appropriate."""


@router.post("/chat")
async def adversary_chat(
    norad_id: int = Query(..., description="NORAD catalog number"),
    name: str = Query(default="", description="Satellite name"),
    prompt: str = Query(..., description="User's question"),
    dossier_context: str = Body(default="", media_type="text/plain"),
):
    """Answer a question about an adversary satellite using Claude, with optional dossier context."""
    from app.agents.base_agent import _get_client, MODEL_ID, MAX_TOKENS

    user_content = f"Satellite: {name} (NORAD {norad_id})\n\n"
    if dossier_context:
        user_content += f"Existing intelligence dossier:\n{dossier_context}\n\n"
    user_content += f"Question: {prompt}"

    try:
        client = _get_client()
        response = await asyncio.to_thread(
            client.messages.create,
            model=MODEL_ID,
            max_tokens=MAX_TOKENS,
            system=CHAT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )

        text = "".join(
            block.text for block in response.content if block.type == "text"
        )
        return {"response": text}

    except Exception as exc:
        logger.exception("Adversary chat failed")
        return {"response": f"Error: {exc}"}

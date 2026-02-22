"""GET /analysis/stream — SSE endpoint that runs the 3-agent pipeline and streams events."""

from __future__ import annotations

import asyncio
import json
import logging
import time

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.models import SatelliteData, WSMessageType
from app.orbital_math import format_orbital_summary
from app.agents.threat_analyzer import PhysicalAttackAgent
from app.agents.research_agent import InterceptionAgent
from app.agents.assessment_agent import HistoricalThreatAgent

logger = logging.getLogger(__name__)

router = APIRouter()

# Map backend agent events → frontend terminal event types
# Frontend expects: scan, context, reasoning, tool_call, tool_result, intent, error, complete


def _sse_line(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _analysis_generator(prompt: str | None = None):
    """Run the 3-agent pipeline and yield SSE events."""

    # Step 1: Build satellite data from cache or fallback
    from app.routes.data import _satellites_cache, _generate_fallback_satellites
    sats_raw = _satellites_cache or _generate_fallback_satellites()

    # Convert to backend SatelliteData for orbital math
    backend_sats = []
    import math
    for i, s in enumerate(sats_raw[:25]):  # Cap for speed
        alt_km = s["altitude_km"]
        # Convert real km to simulation units (match frontend scale)
        a_sim = 2.0 + alt_km / 3000  # rough scale
        backend_sats.append(SatelliteData(
            id=i,
            name=s["name"],
            a=a_sim,
            inc=math.radians(s["inclination_deg"]),
            raan=math.radians(hash(s["name"]) % 360),
            e=0.001 + (i % 10) * 0.007,
            speed=0.01,
            anomaly=math.radians((i * 47) % 360),
        ))

    # --- SCAN PHASE ---
    yield _sse_line({
        "type": "scan",
        "text": f"initiating orbital scan — {len(sats_raw)} tracked objects in catalog",
    })
    await asyncio.sleep(0.3)

    yield _sse_line({
        "type": "scan",
        "text": "computing orbital positions and close approach distances...",
    })

    orbital_summary = await asyncio.to_thread(format_orbital_summary, backend_sats)

    # Prepend the user prompt so agents have additional context (adversary intel, questions, etc.)
    if prompt:
        orbital_summary = f"Operator prompt: {prompt}\n\n{orbital_summary}"

    await asyncio.sleep(0.2)

    yield _sse_line({
        "type": "scan",
        "text": f"orbital analysis complete — cross-referencing conjunction database",
    })

    # --- AGENT 1: Physical Attack ---
    yield _sse_line({
        "type": "context",
        "agent": "physical-attack-detector",
        "text": "evaluating kinetic threats — collision trajectories, debris impacts, ASAT vectors",
    })

    physical_events: list[dict] = []

    async def physical_progress(text: str):
        physical_events.append({
            "type": "reasoning",
            "agent": "physical-attack-detector",
            "text": text,
        })

    physical_agent = PhysicalAttackAgent(on_progress=physical_progress)

    # --- AGENT 2: Interception (run in parallel) ---
    interception_events: list[dict] = []

    async def interception_progress(text: str):
        interception_events.append({
            "type": "reasoning",
            "agent": "interception-detector",
            "text": text,
        })

    interception_agent = InterceptionAgent(on_progress=interception_progress)

    yield _sse_line({
        "type": "context",
        "agent": "interception-detector",
        "text": "scanning for proximity operations — orbital interception, shadowing, RPO events",
    })

    # Run both in parallel
    try:
        physical_threats, interception_threats = await asyncio.gather(
            physical_agent.run(orbital_summary=orbital_summary, satellites=backend_sats),
            interception_agent.run(orbital_summary=orbital_summary, satellites=backend_sats),
        )
    except Exception as exc:
        logger.exception("Agent phase failed")
        yield _sse_line({"type": "error", "message": str(exc)})
        physical_threats = []
        interception_threats = []

    # Emit accumulated progress events
    for ev in physical_events:
        yield _sse_line(ev)
        await asyncio.sleep(0.05)
    for ev in interception_events:
        yield _sse_line(ev)
        await asyncio.sleep(0.05)

    # Emit tool calls for physical
    if physical_threats:
        yield _sse_line({
            "type": "tool_call",
            "agent": "physical-attack-detector",
            "tools": ["orbital_position", "compute_closest_approaches", "kinetic_energy_calc"],
        })
        await asyncio.sleep(0.2)
        yield _sse_line({
            "type": "tool_result",
            "agent": "physical-attack-detector",
            "tool": "compute_closest_approaches",
            "summary": f"detected {len(physical_threats)} physical threats — "
                       + ", ".join(f"{t.satellite_name or f'SAT-{t.satellite_id}'} ({t.severity.value})" for t in physical_threats[:3]),
        })

    # Emit tool calls for interception
    if interception_threats:
        yield _sse_line({
            "type": "tool_call",
            "agent": "interception-detector",
            "tools": ["detect_rpo", "orbital_plane_match", "approach_trajectory_analysis"],
        })
        await asyncio.sleep(0.2)
        yield _sse_line({
            "type": "tool_result",
            "agent": "interception-detector",
            "tool": "detect_rpo",
            "summary": f"detected {len(interception_threats)} interception events — "
                       + ", ".join(f"{t.satellite_name or f'SAT-{t.satellite_id}'} ({t.threat_type.value})" for t in interception_threats[:3]),
        })

    # --- AGENT 3: Historical Threat Assessment ---
    all_threats = physical_threats + interception_threats

    yield _sse_line({
        "type": "context",
        "agent": "historical-threat-assessor",
        "text": f"researching {len(all_threats)} flagged satellites — querying NORAD catalog and threat intelligence databases",
    })

    async def historical_progress(text: str):
        yield_event = {
            "type": "reasoning",
            "agent": "historical-threat-assessor",
            "text": text,
        }
        # Can't yield from callback, so we'll collect and emit after
        historical_events.append(yield_event)

    historical_events: list[dict] = []

    try:
        assessor = HistoricalThreatAgent(on_progress=historical_progress)
        report = await assessor.run(
            physical_threats=physical_threats,
            interception_threats=interception_threats,
            orbital_summary=orbital_summary,
        )
    except Exception as exc:
        logger.exception("Historical assessment failed")
        yield _sse_line({"type": "error", "message": str(exc)})
        report = None

    # Emit historical agent progress
    for ev in historical_events:
        yield _sse_line(ev)
        await asyncio.sleep(0.05)

    if report:
        # Emit tool calls
        yield _sse_line({
            "type": "tool_call",
            "agent": "historical-threat-assessor",
            "tools": ["search_satellite_database", "search_threat_intelligence"],
        })
        await asyncio.sleep(0.2)

        # Emit results per assessed satellite
        for assessment in report.historical_assessments:
            yield _sse_line({
                "type": "tool_result",
                "agent": "historical-threat-assessor",
                "tool": "search_threat_intelligence",
                "summary": f"{assessment.name} ({assessment.nation}) — attack likelihood: {assessment.attack_likelihood:.0%}. {'; '.join(assessment.risk_factors[:2])}",
            })
            await asyncio.sleep(0.15)

        # Emit intent classifications
        for assessment in report.historical_assessments:
            classification = "Hostile" if assessment.attack_likelihood > 0.6 else (
                "Ambiguous" if assessment.attack_likelihood > 0.3 else "Benign"
            )
            yield _sse_line({
                "type": "intent",
                "classification": f"{assessment.name}: {classification} — {assessment.notes[:80] if assessment.notes else 'no additional notes'}",
                "confidence": assessment.attack_likelihood,
            })
            await asyncio.sleep(0.1)

        # Final summary
        yield _sse_line({
            "type": "reasoning",
            "agent": "historical-threat-assessor",
            "text": f"Overall risk level: {report.overall_risk_level.value.upper()}. {report.assessment_summary[:200]}",
        })
        await asyncio.sleep(0.1)

    yield _sse_line({"type": "complete"})


@router.get("/analysis/stream")
async def analysis_stream(request: Request, prompt: str | None = None):
    """SSE endpoint for the AI analysis terminal."""

    async def event_generator():
        try:
            async for event in _analysis_generator(prompt):
                # Check if client disconnected
                if await request.is_disconnected():
                    break
                yield event
        except Exception as exc:
            logger.exception("SSE stream error")
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

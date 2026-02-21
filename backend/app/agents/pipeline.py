"""Pipeline orchestrator — runs 3 agents (physical + interception in parallel, then historical)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Awaitable

from app.models import SatelliteData, ThreatReport, WSMessage, WSMessageType
from app.orbital_math import format_orbital_summary
from app.agents.threat_analyzer import PhysicalAttackAgent
from app.agents.research_agent import InterceptionAgent
from app.agents.assessment_agent import HistoricalThreatAgent

logger = logging.getLogger(__name__)

WSCallback = Callable[[dict], Awaitable[None]]


async def run_pipeline(
    satellites: list[SatelliteData],
    ws_callback: WSCallback,
) -> ThreatReport:
    """Run the 3-agent pipeline: physical + interception in parallel, then historical assessment."""

    async def send(msg_type: WSMessageType, agent_name: str | None = None, data: Any = None):
        msg = WSMessage(type=msg_type, agent_name=agent_name, data=data)
        await ws_callback(msg.model_dump())

    # --- Step 1: Orbital math (CPU-bound, offload to thread) ---
    await send(WSMessageType.AGENT_START, "orbital_math")
    try:
        orbital_summary = await asyncio.to_thread(format_orbital_summary, satellites)
    except Exception as exc:
        logger.exception("Orbital math failed")
        await send(WSMessageType.ERROR, "orbital_math", str(exc))
        raise
    await send(WSMessageType.AGENT_COMPLETE, "orbital_math", {"summary_length": len(orbital_summary)})

    # --- Step 2: Physical Attack + Interception (run in parallel) ---

    async def run_physical() -> list:
        await send(WSMessageType.AGENT_START, "physical_attack")

        async def progress(text: str):
            await send(WSMessageType.AGENT_PROGRESS, "physical_attack", {"text": text})

        agent = PhysicalAttackAgent(on_progress=progress)
        threats = await agent.run(orbital_summary=orbital_summary, satellites=satellites)
        threats_data = [t.model_dump() for t in threats]
        await send(WSMessageType.AGENT_COMPLETE, "physical_attack", {"threats": threats_data, "count": len(threats)})
        return threats

    async def run_interception() -> list:
        await send(WSMessageType.AGENT_START, "interception")

        async def progress(text: str):
            await send(WSMessageType.AGENT_PROGRESS, "interception", {"text": text})

        agent = InterceptionAgent(on_progress=progress)
        threats = await agent.run(orbital_summary=orbital_summary, satellites=satellites)
        threats_data = [t.model_dump() for t in threats]
        await send(WSMessageType.AGENT_COMPLETE, "interception", {"threats": threats_data, "count": len(threats)})
        return threats

    try:
        physical_threats, interception_threats = await asyncio.gather(
            run_physical(),
            run_interception(),
        )
    except Exception as exc:
        logger.exception("Parallel agent phase failed")
        await send(WSMessageType.ERROR, "parallel_agents", str(exc))
        raise

    # --- Step 3: Historical Threat Assessment (Agent 3) ---
    await send(WSMessageType.AGENT_START, "historical_threat")

    async def historical_progress(text: str):
        await send(WSMessageType.AGENT_PROGRESS, "historical_threat", {"text": text})

    try:
        assessor = HistoricalThreatAgent(on_progress=historical_progress)
        report = await assessor.run(
            physical_threats=physical_threats,
            interception_threats=interception_threats,
            orbital_summary=orbital_summary,
        )
    except Exception as exc:
        logger.exception("Historical threat assessment failed")
        await send(WSMessageType.ERROR, "historical_threat", str(exc))
        raise

    await send(WSMessageType.AGENT_COMPLETE, "historical_threat", {
        "risk_level": report.overall_risk_level.value,
        "assessments_count": len(report.historical_assessments),
    })

    # --- Done ---
    await send(WSMessageType.PIPELINE_COMPLETE, data=report.model_dump())
    return report

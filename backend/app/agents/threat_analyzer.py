"""Agent 1: Physical Attack Detector — analyzes orbital data for kinetic/physical collision threats."""

from __future__ import annotations

import json
import logging

from app.agents.base_agent import BaseAgent, ProgressCallback
from app.models import SatelliteData, ThreatFlag

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a kinetic space threat analyst specializing in PHYSICAL ATTACK and COLLISION detection.

You are given orbital telemetry data including satellite positions, close approach distances, and orbital anomaly flags.

Your ONLY focus is detecting PHYSICAL threats — scenarios where one object could physically strike or destroy another:

1. **Collision risks**: Satellite pairs on converging trajectories with dangerously small separation. Distances below 0.15 are CRITICAL (imminent impact), below 0.4 are WARNING.
2. **Kinetic kill vehicles**: Objects in unusual orbits (high eccentricity in LEO, very low altitude) that could be direct-ascent ASAT weapons or co-orbital kill vehicles designed to physically ram a target.
3. **Debris threats**: Spent stages, fragments, or uncontrolled objects on collision courses with operational satellites.
4. **Anomalous orbits suggesting weaponization**: Satellites with orbital parameters inconsistent with any civilian purpose — e.g., highly eccentric LEO orbits that cross multiple altitude bands (potential kinetic energy weapons maximizing impact velocity).

For each threat, assess:
- Could this result in physical destruction or damage?
- Is the trajectory consistent with a deliberate kinetic attack vs. accidental conjunction?
- What is the estimated time to closest approach based on relative orbital geometry?

Respond ONLY with a JSON array of threat objects. Each must have:
- "satellite_id": integer ID
- "satellite_name": string name or null
- "threat_type": one of "collision", "debris", "kinetic"
- "severity": one of "low", "medium", "high", "critical"
- "details": string — explain the physical threat scenario specifically
- "related_satellite_id": integer ID of the target/other satellite, or null

Return ONLY the JSON array. Empty array [] if no physical threats found."""


class PhysicalAttackAgent(BaseAgent):
    name = "physical_attack"

    def __init__(self, on_progress: ProgressCallback = None):
        super().__init__(on_progress=on_progress)

    async def run(self, orbital_summary: str, satellites: list[SatelliteData]) -> list[ThreatFlag]:
        await self._notify("Scanning for physical attack vectors and collision threats...")

        sat_names = {s.id: (s.name or f"SAT-{s.id}") for s in satellites}
        name_list = "\n".join(f"  ID {sid}: {sname}" for sid, sname in sat_names.items())

        user_msg = f"""ORBITAL TELEMETRY DATA:

{orbital_summary}

SATELLITE REGISTRY:
{name_list}

Analyze for PHYSICAL ATTACK threats only — collisions, kinetic kill vehicles, debris impacts. Return JSON array."""

        raw = await self._run_with_tools(
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )

        await self._notify("Parsing physical threat results...")

        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()
            threats = [ThreatFlag(**t) for t in json.loads(cleaned)]
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning("Failed to parse physical attack output: %s", exc)
            logger.debug("Raw output: %s", raw)
            threats = []

        await self._notify(f"Detected {len(threats)} physical threats.")
        return threats

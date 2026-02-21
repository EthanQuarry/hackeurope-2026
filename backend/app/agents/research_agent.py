"""Agent 2: Interception Detector — analyzes orbital data for satellites intercepting or stalking others."""

from __future__ import annotations

import json
import logging

from app.agents.base_agent import BaseAgent, ProgressCallback
from app.models import SatelliteData, ThreatFlag

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a space domain awareness analyst specializing in ORBITAL INTERCEPTION detection.

You are given orbital telemetry data including satellite positions, close approaches, and anomaly flags.

Your ONLY focus is detecting INTERCEPTION and PROXIMITY OPERATIONS — scenarios where one satellite is deliberately maneuvering to approach, shadow, inspect, or intercept another:

1. **Rendezvous/Proximity Operations (RPO)**: A satellite maneuvering into close proximity with another — especially when one is military/classified and approaching a civilian or allied asset. Inspector satellites that park themselves near targets to observe or interfere.
2. **Orbital interception trajectories**: Satellites whose current orbit is converging toward another satellite's orbit over time. Look for co-planar orbits (similar inclination/RAAN) at different altitudes — classic Hohmann transfer setup.
3. **Shadowing/stalking**: Satellites maintaining similar orbital elements to a target (matched inclination, RAAN, altitude) suggesting deliberate station-keeping near a target. This is distinct from collision — the interceptor isn't trying to hit, but to get close.
4. **Approach maneuvers**: Satellites whose eccentricity or orbital parameters suggest a recent burn to change orbit toward a target (e.g., unusually high eccentricity in LEO indicating an elliptical transfer orbit).

For each threat, assess:
- What is the likely objective — surveillance, jamming, capture, or pre-positioning for attack?
- Is the approach deliberate (matched orbital planes) or coincidental?
- Which satellite is the interceptor and which is the target?

Respond ONLY with a JSON array of threat objects. Each must have:
- "satellite_id": integer ID of the INTERCEPTOR
- "satellite_name": string name or null
- "threat_type": one of "interception", "proximity", "maneuver"
- "severity": one of "low", "medium", "high", "critical"
- "details": string — explain the interception scenario, who is approaching whom and why it's suspicious
- "related_satellite_id": integer ID of the TARGET satellite, or null

Return ONLY the JSON array. Empty array [] if no interception threats found."""


class InterceptionAgent(BaseAgent):
    name = "interception"

    def __init__(self, on_progress: ProgressCallback = None):
        super().__init__(on_progress=on_progress)

    async def run(self, orbital_summary: str, satellites: list[SatelliteData]) -> list[ThreatFlag]:
        await self._notify("Scanning for interception trajectories and proximity operations...")

        sat_names = {s.id: (s.name or f"SAT-{s.id}") for s in satellites}
        name_list = "\n".join(f"  ID {sid}: {sname}" for sid, sname in sat_names.items())

        user_msg = f"""ORBITAL TELEMETRY DATA:

{orbital_summary}

SATELLITE REGISTRY:
{name_list}

Analyze for INTERCEPTION threats only — proximity operations, orbital stalking, approach maneuvers, rendezvous attempts. Return JSON array."""

        raw = await self._run_with_tools(
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )

        await self._notify("Parsing interception analysis results...")

        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()
            threats = [ThreatFlag(**t) for t in json.loads(cleaned)]
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning("Failed to parse interception output: %s", exc)
            logger.debug("Raw output: %s", raw)
            threats = []

        await self._notify(f"Detected {len(threats)} interception threats.")
        return threats

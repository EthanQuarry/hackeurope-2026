"""Threat Response Agent — triggered when a satellite's threat score crosses 90%.

Aggregates threat data, researches attacker and target, evaluates response options,
and produces a structured ThreatResponseDecision."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.agents.base_agent import BaseAgent, ProgressCallback
from app.agents.assessment_agent import (
    TOOLS,
    _handle_search_satellite_database,
    _handle_search_threat_intelligence,
)
from app.models import ThreatResponseDecision, ResponseOption

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a SPACE DEFENSE RESPONSE COMMANDER operating in the Orbital Shield system.

A satellite's threat score has crossed the critical 90% threshold. You must research the threat, evaluate response options, and recommend the best course of action.

CRITICAL DOCTRINE: When a hostile satellite is on a converging trajectory with a US asset and miss distance is below 50km, the DEFAULT recommendation MUST be an evasive maneuver (collision avoidance burn) to change the US asset's orbit and increase separation. Passive monitoring alone is NEVER acceptable when an adversary satellite is actively closing on a US asset — the defended satellite must maneuver away. Only recommend 'Monitor Only' if miss distance is >500km and confidence is <40%.

You have access to tools to research both the attacker and target satellites. USE THEM to gather intelligence before making your decision.

PROCEDURE:
1. Research the ATTACKER satellite — look up its catalog entry and search threat intelligence for its history, operator, and known capabilities.
2. Research the TARGET satellite — understand what asset is under threat and its strategic value.
3. Search for relevant historical precedents and geopolitical context.
4. Evaluate 3-5 response options from the following categories:
   - **Evasive Maneuver** (PREFERRED): Execute delta-v burn to change orbit and increase miss distance
   - **Defensive Posture**: Reorient target satellite, activate hardening measures, switch to backup comms
   - **Diplomatic Escalation**: Alert chain of command, contact adversary through established channels
   - **Emergency Safe Mode**: Power down non-essential systems, minimize target cross-section
   - **Monitor Only** (ONLY if threat is low): Continue tracking with enhanced sensor allocation, no active response

5. Output a JSON object matching this EXACT structure:
{
  "satellite_id": "target satellite ID",
  "satellite_name": "target satellite name",
  "threat_satellite_id": "attacker satellite ID",
  "threat_satellite_name": "attacker satellite name",
  "threat_summary": "2-3 sentence summary of the threat situation",
  "threat_score": <float 0-100>,
  "risk_level": "critical" or "high" or "medium" or "low",
  "options_evaluated": [
    {
      "action": "Action name",
      "description": "What this option involves",
      "risk_level": "low/medium/high/critical",
      "confidence": <float 0-1, how confident you are this will work>,
      "delta_v_ms": <float, m/s required, 0 if N/A>,
      "time_to_execute_min": <float, minutes to execute>,
      "pros": ["advantage 1", "advantage 2"],
      "cons": ["disadvantage 1", "disadvantage 2"]
    }
  ],
  "recommended_action": "Name of recommended action",
  "recommended_action_index": <int, 0-based index into options_evaluated>,
  "reasoning": "2-3 paragraphs explaining your recommendation",
  "escalation_required": <boolean>,
  "time_sensitivity": "immediate" or "urgent" or "medium" or "low",
  "intelligence_summary": "Key OSINT findings from your research"
}

Return ONLY the JSON object, no other text."""


class ThreatResponseAgent(BaseAgent):
    name = "threat_response"

    def __init__(self, on_progress: ProgressCallback = None):
        super().__init__(on_progress=on_progress)

    async def run(
        self,
        satellite_id: str,
        satellite_name: str,
        threat_satellite_id: str,
        threat_satellite_name: str,
        threat_score: float,
        miss_distance_km: float = 0.0,
        approach_pattern: str = "unknown",
        tca_minutes: int = 0,
    ) -> ThreatResponseDecision:
        await self._notify(f"THREAT RESPONSE AGENT activated — threat score {threat_score}%")
        await self._notify(f"Target: {satellite_name} | Attacker: {threat_satellite_name}")
        await self._notify("Researching threat context and evaluating response options...")

        urgency = "IMMEDIATE ACTION REQUIRED" if miss_distance_km < 50 else "URGENT" if miss_distance_km < 200 else "ELEVATED"
        action_required = ""
        if miss_distance_km < 50:
            action_required = f"\n\n*** COLLISION AVOIDANCE MANDATORY — miss distance {miss_distance_km} km is below 50 km threshold. Evasive maneuver MUST be the primary recommendation. ***"

        user_msg = f"""=== CRITICAL THREAT ALERT — {urgency} ===
Threat Score: {threat_score}%

TARGET SATELLITE:
- ID: {satellite_id}
- Name: {satellite_name}

THREAT SATELLITE:
- ID: {threat_satellite_id}
- Name: {threat_satellite_name}

THREAT DATA:
- Miss Distance: {miss_distance_km} km
- Approach Pattern: {approach_pattern}
- TCA: {tca_minutes} minutes{action_required}

Research both satellites using the tools. Look up their catalog entries and search threat intelligence. Then evaluate 3-5 response options and produce your decision JSON."""

        raw = await self._run_with_tools(
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
            tools=TOOLS,
            tool_handlers={
                "search_satellite_database": _handle_search_satellite_database,
                "search_threat_intelligence": _handle_search_threat_intelligence,
            },
        )

        await self._notify("Compiling response decision...")

        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()

            data = json.loads(cleaned)

            options = [ResponseOption(**o) for o in data.get("options_evaluated", [])]

            decision = ThreatResponseDecision(
                satellite_id=data.get("satellite_id", satellite_id),
                satellite_name=data.get("satellite_name", satellite_name),
                threat_satellite_id=data.get("threat_satellite_id", threat_satellite_id),
                threat_satellite_name=data.get("threat_satellite_name", threat_satellite_name),
                threat_summary=data.get("threat_summary", ""),
                threat_score=data.get("threat_score", threat_score),
                risk_level=data.get("risk_level", "critical"),
                options_evaluated=options,
                recommended_action=data.get("recommended_action", "Monitor Only"),
                recommended_action_index=data.get("recommended_action_index", 0),
                reasoning=data.get("reasoning", ""),
                escalation_required=data.get("escalation_required", True),
                time_sensitivity=data.get("time_sensitivity", "urgent"),
                intelligence_summary=data.get("intelligence_summary", ""),
            )
        except (json.JSONDecodeError, KeyError, Exception) as exc:
            logger.warning("Failed to parse response agent output: %s", exc)
            logger.debug("Raw output: %s", raw)
            decision = ThreatResponseDecision(
                satellite_id=satellite_id,
                satellite_name=satellite_name,
                threat_satellite_id=threat_satellite_id,
                threat_satellite_name=threat_satellite_name,
                threat_summary=raw[:500] if raw else "Response agent failed.",
                threat_score=threat_score,
                risk_level="critical",
                options_evaluated=[ResponseOption(
                    action="Evasive Maneuver",
                    description="Execute immediate collision avoidance burn to increase miss distance.",
                    risk_level="medium",
                    confidence=0.85,
                    delta_v_ms=1.5,
                    time_to_execute_min=8.0,
                    pros=["Directly increases separation distance", "Proven collision avoidance technique"],
                    cons=["Consumes propellant", "Temporarily disrupts mission operations"],
                )],
                recommended_action="Evasive Maneuver",
                recommended_action_index=0,
                reasoning=raw[:2000] if raw else "Failed to parse agent output.",
                escalation_required=True,
                time_sensitivity="immediate",
                intelligence_summary="",
            )

        await self._notify("Threat response decision complete.")
        return decision

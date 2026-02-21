"""Agent 3: Historical Threat Assessor — researches satellite backgrounds and computes attack likelihood."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.agents.base_agent import BaseAgent, ProgressCallback
from app.mock_data import lookup_satellite
from app.models import ThreatFlag, HistoricalRecord, ThreatReport, RiskLevel

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior space intelligence analyst specializing in HISTORICAL THREAT ASSESSMENT.

You receive threat flags from two prior analysis stages (physical attacks and interception operations) plus access to databases for researching each satellite's background.

Your job is to assess HOW LIKELY each flagged satellite is to actually carry out an attack, based on:

1. **Operator history**: Has this nation/operator conducted ASAT tests before? (Russia: Cosmos 2542/2543 inspector tests, Nudol DA-ASAT test 2021. China: SC-19 ASAT test 2007, SJ-21 grappling demo. US: Operation Burnt Frost 2008.)
2. **Satellite lineage**: Does this satellite belong to a known weapons program or dual-use platform?
3. **Behavioral precedents**: Has this specific satellite or its siblings performed suspicious maneuvers before?
4. **Geopolitical context**: Current tensions between the satellite's nation and the target's nation.
5. **Stated vs. actual purpose**: Does the satellite's behavior match its publicly stated mission?

For each satellite, you MUST use the tools to look up its catalog entry and search for historical context before making your assessment.

After researching, produce a JSON object with:
- "historical_assessments": array of objects, each with:
  - "satellite_id": integer ID
  - "name": string name
  - "owner": string operator
  - "nation": string nation
  - "purpose": string stated purpose
  - "source": string data source
  - "attack_likelihood": float 0.0-1.0 (probability of hostile intent — 0.0=benign, 0.5=ambiguous, 0.8+=likely hostile)
  - "historical_precedents": array of strings citing relevant past incidents
  - "risk_factors": array of strings listing specific reasons for the likelihood score
  - "notes": string with your analytical assessment

- "overall_risk_level": one of "low", "medium", "high", "critical"
- "assessment_summary": 2-4 paragraph intelligence briefing synthesizing all findings — reference specific satellites, their attack likelihoods, and the overall threat picture
- "recommended_actions": array of specific action strings for decision-makers
- "geopolitical_notes": paragraph on geopolitical implications

Return ONLY the JSON object, no other text."""

TOOLS = [
    {
        "name": "search_satellite_database",
        "description": "Look up a satellite in the NORAD/space catalog by its simulation ID. Returns official metadata: name, nation, owner, stated purpose, orbit type, launch year, and any known threat intelligence notes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "satellite_id": {
                    "type": "integer",
                    "description": "The simulation ID of the satellite to look up",
                }
            },
            "required": ["satellite_id"],
        },
    },
    {
        "name": "search_threat_intelligence",
        "description": "Search threat intelligence databases and open-source reporting for historical information about a satellite, operator, or space weapons program. Returns relevant intelligence reports and news articles.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query — e.g., 'Russia ASAT test history', 'COSMOS-2558 inspector satellite incidents'",
                }
            },
            "required": ["query"],
        },
    },
]


def _handle_search_satellite_database(input_data: dict) -> dict:
    sat_id = input_data["satellite_id"]
    entry = lookup_satellite(sat_id)
    if entry:
        return {"found": True, "satellite_id": sat_id, **entry}
    return {"found": False, "satellite_id": sat_id, "message": "No catalog entry found — unregistered object."}


def _handle_search_threat_intelligence(input_data: dict) -> dict:
    """Simulated threat intelligence search — returns pre-canned OSINT for demo satellites."""
    query = input_data["query"].lower()
    results = []

    if "russia" in query and ("asat" in query or "anti-satellite" in query or "history" in query):
        results.append({
            "title": "Timeline: Russian Anti-Satellite Weapons Program",
            "snippet": "Russia has conducted multiple ASAT tests: Cosmos 2542/2543 inspector satellite tests (2019-2020), Nudol DA-ASAT kinetic kill test destroying Cosmos 1408 (Nov 2021, created 1500+ debris), Burevestnik program. Pattern shows escalating capability development.",
            "source": "CSIS Aerospace Security Project",
            "date": "2024-03",
        })
    if "kosmos-2562" in query or "cosmos-2562" in query:
        results.append({
            "title": "KOSMOS-2562 exhibits inspector satellite behavior near US asset",
            "snippet": "KOSMOS-2562 performed a series of orbital maneuvers closing distance with USA-245 (NRO reconnaissance satellite). Behavior matches Cosmos 2542/2543 precedent — approach, loiter, withdraw, re-approach. Assessed as latest Russian co-orbital ASAT/inspector test.",
            "source": "SpaceNews / 18th Space Defense Squadron",
            "date": "2024-11",
        })
    if "sj-21" in query or "shijian-21" in query:
        results.append({
            "title": "SJ-21 demonstrates satellite grappling in GEO — dual-use concerns",
            "snippet": "China's Shijian-21 approached and physically relocated a defunct BeiDou navigation satellite to a graveyard orbit. While stated purpose is debris remediation, the grappling capability is directly applicable to disabling adversary GEO satellites. SJ-21 has since been observed approaching Western SATCOM assets.",
            "source": "The Space Review / ExoAnalytic Solutions",
            "date": "2024-06",
        })
    if "china" in query and ("asat" in query or "anti-satellite" in query or "history" in query):
        results.append({
            "title": "Timeline: Chinese Anti-Satellite Weapons Program",
            "snippet": "China's ASAT history: SC-19 kinetic kill test destroying FY-1C (Jan 2007, 3000+ debris — worst debris event in history), DN-2 mid-course interceptor tests (2013-2014), SJ-17 robotic arm in GEO (2016), SJ-21 grappling demo (2022). Pattern shows progression from brute-force kinetic to sophisticated proximity operations.",
            "source": "Secure World Foundation",
            "date": "2024-08",
        })
    if "object 2024-117a" in query or "unidentified" in query or "unknown satellite" in query:
        results.append({
            "title": "Unidentified LEO object defies classification — no launch notification",
            "snippet": "Object 2024-117A appeared without launch detection or UN registration. Its retrograde, highly eccentric orbit is inconsistent with any known commercial or scientific mission profile. Retrograde orbits maximize closing velocity with targets in prograde orbits, a characteristic of kinetic kill vehicles. No nation has claimed ownership.",
            "source": "ArsTechnica / LeoLabs tracking data",
            "date": "2024-12",
        })
    if "luch" in query or "olymp" in query:
        results.append({
            "title": "Russian Luch/Olymp satellite: pattern of SIGINT collection against Western SATCOM",
            "snippet": "Luch (Olymp-K2) has repositioned itself at least 5 times since launch, each time parking near a different Western military/government communication satellite in GEO. Targets include Intelsat, SES, and WGS military broadband. Pattern is consistent with signals interception — pre-positioning for intelligence collection or potential electronic attack.",
            "source": "BBC News / CSIS",
            "date": "2024-09",
        })
    if "usa-245" in query or "nrol-65" in query:
        results.append({
            "title": "USA-245 (NROL-65) — KH-11 electro-optical reconnaissance satellite",
            "snippet": "Launched 2013 by NRO. Widely assessed as KH-11/CRYSTAL class — high-resolution electro-optical imaging satellite. One of the US's most valuable space-based intelligence assets. Any threat to USA-245 would represent a significant escalation.",
            "source": "Wikipedia / Federation of American Scientists",
            "date": "2023-01",
        })

    if not results:
        results.append({
            "title": f"Search: {input_data['query']}",
            "snippet": "No specific threat intelligence found. The satellite/operator has no known history of hostile space activity.",
            "source": "General OSINT search",
            "date": "2025-01",
        })

    return {"results": results, "query": input_data["query"]}


class HistoricalThreatAgent(BaseAgent):
    name = "historical_threat"

    def __init__(self, on_progress: ProgressCallback = None):
        super().__init__(on_progress=on_progress)

    async def run(
        self,
        physical_threats: list[ThreatFlag],
        interception_threats: list[ThreatFlag],
        orbital_summary: str,
    ) -> ThreatReport:
        all_threats = physical_threats + interception_threats

        if not all_threats:
            await self._notify("No threats flagged — producing baseline assessment.")

        await self._notify(f"Researching historical context for {len(all_threats)} flagged threats...")

        # Build threat summary for the LLM
        physical_text = "\n".join(
            f"  - [{t.severity.value.upper()}] SAT {t.satellite_id} "
            f"({t.satellite_name or 'unknown'}): {t.threat_type.value} — {t.details}"
            + (f" (target: SAT {t.related_satellite_id})" if t.related_satellite_id is not None else "")
            for t in physical_threats
        ) or "  None detected."

        interception_text = "\n".join(
            f"  - [{t.severity.value.upper()}] SAT {t.satellite_id} "
            f"({t.satellite_name or 'unknown'}): {t.threat_type.value} — {t.details}"
            + (f" (target: SAT {t.related_satellite_id})" if t.related_satellite_id is not None else "")
            for t in interception_threats
        ) or "  None detected."

        # Collect unique satellite IDs to research
        sat_ids = list({t.satellite_id for t in all_threats})
        target_ids = [t.related_satellite_id for t in all_threats if t.related_satellite_id is not None]
        all_ids = list(set(sat_ids + target_ids))

        user_msg = f"""=== PHYSICAL ATTACK THREATS (Agent 1) ===
{physical_text}

=== INTERCEPTION THREATS (Agent 2) ===
{interception_text}

=== SATELLITE IDs TO RESEARCH ===
{all_ids}

=== ORBITAL CONTEXT ===
{orbital_summary}

Research each flagged satellite (and their targets) using the tools. Look up catalog entries and search threat intelligence for historical precedents. Then produce your historical threat assessment JSON."""

        raw = await self._run_with_tools(
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
            tools=TOOLS,
            tool_handlers={
                "search_satellite_database": _handle_search_satellite_database,
                "search_threat_intelligence": _handle_search_threat_intelligence,
            },
        )

        await self._notify("Compiling final threat report...")

        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()

            data = json.loads(cleaned)

            assessments = [HistoricalRecord(**a) for a in data.get("historical_assessments", [])]

            report = ThreatReport(
                overall_risk_level=RiskLevel(data["overall_risk_level"]),
                physical_threats=physical_threats,
                interception_threats=interception_threats,
                historical_assessments=assessments,
                assessment_summary=data.get("assessment_summary", ""),
                recommended_actions=data.get("recommended_actions", []),
                geopolitical_notes=data.get("geopolitical_notes", ""),
            )
        except (json.JSONDecodeError, KeyError, Exception) as exc:
            logger.warning("Failed to parse historical assessment output: %s", exc)
            logger.debug("Raw output: %s", raw)
            report = ThreatReport(
                overall_risk_level=RiskLevel.MEDIUM,
                physical_threats=physical_threats,
                interception_threats=interception_threats,
                historical_assessments=[],
                assessment_summary=raw[:2000] if raw else "Historical assessment failed.",
                recommended_actions=["Review raw agent output manually"],
            )

        await self._notify("Historical threat assessment complete.")
        return report

"""Adversary Satellite Research Agent — deep research on a single adversary satellite.

Uses Perplexity AI for web intelligence and Space-Track for real orbital/catalog data.
Select an adversary satellite by NORAD ID, and this agent will:
1. Pull real orbital data and catalog metadata from Space-Track
2. Fetch historical TLE data to detect maneuvers
3. Search Perplexity for OSINT on the satellite, its operator, and its program
4. Synthesise everything into a structured intelligence dossier
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.agents.base_agent import BaseAgent, ProgressCallback

logger = logging.getLogger(__name__)

MU = 398600.4418       # km³/s²  Earth gravitational parameter
R_EARTH = 6378.137     # km

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a senior space-domain intelligence analyst conducting deep research on an adversary satellite.

You have access to THREE tools:

1. **search_perplexity** — Search the internet via Perplexity AI for open-source intelligence (OSINT). Use this to find:
   - News articles about the satellite or its program
   - Academic papers and defense analyses
   - Operator history and organizational structure
   - Launch manifest details and co-launched payloads
   - Technical specifications and satellite bus information
   - Historical incidents involving this satellite or related assets

2. **query_spacetrack_catalog** — Look up a satellite in the official US Space Force catalog (Space-Track SATCAT). Returns: name, NORAD ID, country, object type, RCS size, launch date/site, orbital period, inclination, apogee, perigee.

3. **query_spacetrack_history** — Fetch historical TLE (orbital element) data for a satellite over the past year. Returns a time series of orbital elements. Use this to detect maneuvers — look for sudden changes in semi-major axis (altitude changes), inclination (plane changes), or eccentricity.

## Research Protocol

For the given satellite, you MUST:

1. First, call **query_spacetrack_catalog** to get official catalog data.
2. Then, call **query_spacetrack_history** to get orbital history.
3. Analyze the history data for maneuvers:
   - Look at the `maneuvers_detected` array in the response
   - Note maneuver frequency, types, and dates
   - Identify any patterns (regular station-keeping vs. active repositioning)
4. Make AT LEAST 3 Perplexity searches to build a comprehensive picture:
   - Search for the satellite name + mission
   - Search for the satellite program/series (e.g., "Shijian program" or "Cosmos inspector satellites")
   - Search for the operator + ASAT/space weapons capability
   - Optionally search for related satellites or specific incidents
5. Synthesize ALL findings into a comprehensive intelligence dossier.

## Output Format

Return a JSON object with this EXACT structure:
{
  "norad_id": <integer>,
  "name": "<satellite name>",
  "cospar_id": "<international designator>",
  "owner_country": "<country code>",
  "operator": "<operating organization>",
  "launch_date": "<YYYY-MM-DD>",
  "orbit_type": "<LEO|MEO|GEO|HEO|SSO>",

  "declared_mission": "<officially stated mission>",
  "assessed_mission": "<your intelligence assessment of the real mission>",
  "confidence": <float 0.0-1.0>,

  "capabilities": {
    "maneuverable": <boolean>,
    "has_robotic_arm": <boolean>,
    "has_proximity_ops": <boolean>,
    "estimated_delta_v_remaining": "<high|medium|low|unknown>",
    "sensors": ["<sensor types>"],
    "satellite_bus": "<bus platform name or null>",
    "mass_kg": <number or null>,
    "power_watts": <number or null>
  },

  "behavioral_history": {
    "total_maneuvers_detected": <integer>,
    "last_maneuver_date": "<ISO date or null>",
    "maneuver_frequency_days": <float or null>,
    "maneuver_types": {"<type>": <count>},
    "behavioral_pattern": "<summary of behavior>"
  },

  "program_context": {
    "program_name": "<satellite series/program>",
    "related_satellites": ["<names of related satellites>"],
    "program_history": "<brief history of the program>",
    "military_significance": "<assessment of military relevance>"
  },

  "threat_assessment": {
    "threat_level": "<low|medium|high|critical>",
    "threat_score": <integer 0-100>,
    "reasoning": "<detailed reasoning for the threat level>",
    "key_concerns": ["<specific concerns>"],
    "recommended_monitoring": ["<specific monitoring actions>"]
  },

  "intelligence_sources": [
    {"type": "<news|academic|defense|orbital_data|catalog>", "title": "<source title>", "summary": "<key finding>"}
  ]
}

Return ONLY the JSON object, no other text."""

# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "search_perplexity",
        "description": (
            "Search the internet via Perplexity AI for open-source intelligence. "
            "Use specific queries like 'Shijian-21 satellite grappling capability' "
            "or 'Russia Cosmos inspector satellite ASAT program'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query for Perplexity AI",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "query_spacetrack_catalog",
        "description": (
            "Look up a satellite in the US Space Force SATCAT catalog by NORAD ID. "
            "Returns official metadata: name, country, object type, RCS size, "
            "launch date, launch site, orbital parameters."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "norad_id": {
                    "type": "integer",
                    "description": "The NORAD catalog number of the satellite",
                },
            },
            "required": ["norad_id"],
        },
    },
    {
        "name": "query_spacetrack_history",
        "description": (
            "Fetch historical orbital element (TLE) data for a satellite over "
            "the past year. Returns orbital parameters over time plus detected "
            "maneuvers (sudden changes in altitude, inclination, or eccentricity)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "norad_id": {
                    "type": "integer",
                    "description": "The NORAD catalog number of the satellite",
                },
                "days_back": {
                    "type": "integer",
                    "description": "How many days of history to fetch (default 365, max 730)",
                },
            },
            "required": ["norad_id"],
        },
    },
]


# ---------------------------------------------------------------------------
# Tool handlers
# ---------------------------------------------------------------------------

def _handle_search_perplexity(input_data: dict) -> dict:
    """Call the Perplexity AI Sonar API for web research."""
    query = input_data["query"]
    api_key = os.getenv("PERPLEXITY_API_KEY", "")

    if not api_key:
        return {
            "error": "PERPLEXITY_API_KEY not set in environment",
            "query": query,
        }

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                "https://api.perplexity.ai/chat/completions",
                json={
                    "model": "sonar",
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a space domain awareness researcher. "
                                "Provide factual, detailed information about satellites, "
                                "space programs, and military space capabilities. "
                                "Include specific dates, organizations, and technical details. "
                                "Cite your sources."
                            ),
                        },
                        {"role": "user", "content": query},
                    ],
                },
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()

            content = data["choices"][0]["message"]["content"]
            citations = data.get("citations", [])

            return {
                "query": query,
                "content": content,
                "citations": citations,
                "model": data.get("model", "sonar"),
            }

    except httpx.HTTPStatusError as e:
        logger.error("Perplexity API error: %s %s", e.response.status_code, e.response.text[:200])
        return {"error": f"Perplexity API returned {e.response.status_code}", "query": query}
    except Exception as e:
        logger.exception("Perplexity search failed")
        return {"error": str(e), "query": query}


def _handle_query_spacetrack_catalog(input_data: dict) -> dict:
    """Query Space-Track SATCAT for satellite catalog metadata."""
    from app.spacetrack import get_client

    norad_id = input_data["norad_id"]
    st = get_client()

    try:
        st._login()
        # Query SATCAT for metadata
        satcat_url = (
            f"https://www.space-track.org/basicspacedata/query"
            f"/class/satcat/NORAD_CAT_ID/{norad_id}/format/json"
        )
        satcat_data = st._query(satcat_url)

        # Also get current GP data for orbital elements
        gp_url = (
            f"https://www.space-track.org/basicspacedata/query"
            f"/class/gp/NORAD_CAT_ID/{norad_id}/format/json"
        )
        gp_data = st._query(gp_url)

        result: dict[str, Any] = {"norad_id": norad_id, "found": False}

        if satcat_data:
            sat = satcat_data[0]
            result.update({
                "found": True,
                "name": sat.get("SATNAME", "").strip(),
                "object_id": sat.get("INTLDES", ""),
                "country": sat.get("COUNTRY", ""),
                "object_type": sat.get("OBJECT_TYPE", ""),
                "launch_date": sat.get("LAUNCH", ""),
                "launch_site": sat.get("SITE", ""),
                "decay_date": sat.get("DECAY"),
                "rcs_size": sat.get("RCS_SIZE", ""),
                "period_min": sat.get("PERIOD", ""),
                "inclination_deg": sat.get("INCLINATION", ""),
                "apogee_km": sat.get("APOGEE", ""),
                "perigee_km": sat.get("PERIGEE", ""),
                "current_status": "on-orbit" if not sat.get("DECAY") else "decayed",
            })

        if gp_data:
            gp = gp_data[0]
            result.update({
                "epoch": gp.get("EPOCH", ""),
                "mean_motion": gp.get("MEAN_MOTION", ""),
                "eccentricity": gp.get("ECCENTRICITY", ""),
                "semi_major_axis_km": gp.get("SEMIMAJOR_AXIS", ""),
                "bstar": gp.get("BSTAR", ""),
                "country_code": gp.get("COUNTRY_CODE", ""),
                "classification": gp.get("CLASSIFICATION_TYPE", ""),
            })

        return result

    except Exception as e:
        logger.exception("Space-Track catalog query failed for NORAD %d", norad_id)
        return {"norad_id": norad_id, "found": False, "error": str(e)}


def _handle_query_spacetrack_history(input_data: dict) -> dict:
    """Fetch GP_History from Space-Track and detect maneuvers."""
    from app.spacetrack import get_client

    norad_id = input_data["norad_id"]
    days_back = min(input_data.get("days_back", 365), 730)
    st = get_client()

    try:
        st._login()
        url = (
            f"https://www.space-track.org/basicspacedata/query"
            f"/class/gp_history/NORAD_CAT_ID/{norad_id}"
            f"/EPOCH/%3Enow-{days_back}"
            f"/orderby/EPOCH%20asc"
            f"/format/json"
        )
        records = st._query(url)

        if not records:
            return {
                "norad_id": norad_id,
                "records_found": 0,
                "error": "No historical data found",
            }

        # Parse and detect maneuvers
        parsed = _parse_history(records)
        maneuvers = _detect_maneuvers(parsed)

        # Build summary
        first = parsed[0] if parsed else {}
        last = parsed[-1] if parsed else {}

        return {
            "norad_id": norad_id,
            "records_found": len(records),
            "date_range": {
                "start": first.get("epoch", ""),
                "end": last.get("epoch", ""),
            },
            "current_orbit": {
                "altitude_km": round(last.get("altitude_km", 0), 1),
                "inclination_deg": round(last.get("inclination", 0), 2),
                "eccentricity": round(last.get("eccentricity", 0), 6),
                "period_min": round(last.get("period", 0), 2),
            },
            "maneuvers_detected": maneuvers,
            "total_maneuvers": len(maneuvers),
            "maneuver_summary": _maneuver_summary(maneuvers),
        }

    except Exception as e:
        logger.exception("Space-Track history query failed for NORAD %d", norad_id)
        return {"norad_id": norad_id, "records_found": 0, "error": str(e)}


# ---------------------------------------------------------------------------
# Maneuver detection (simplified from the full maneuver_detector)
# ---------------------------------------------------------------------------

SMA_THRESHOLD = 1.0     # km
INC_THRESHOLD = 0.01    # degrees
ECC_THRESHOLD = 0.001


def _parse_history(records: list[dict]) -> list[dict]:
    """Parse Space-Track GP_History JSON into a usable time series."""
    parsed = []
    for rec in records:
        try:
            epoch_str = rec.get("EPOCH", "")
            if not epoch_str:
                continue
            mean_motion = float(rec.get("MEAN_MOTION", 0))
            if mean_motion <= 0:
                continue

            sma = float(rec["SEMIMAJOR_AXIS"]) if rec.get("SEMIMAJOR_AXIS") else 0
            if sma <= 0:
                n_rad = mean_motion * 2 * math.pi / 86400.0
                sma = (MU / (n_rad ** 2)) ** (1.0 / 3.0)

            parsed.append({
                "epoch": epoch_str,
                "sma_km": sma,
                "altitude_km": sma - R_EARTH,
                "eccentricity": float(rec.get("ECCENTRICITY", 0)),
                "inclination": float(rec.get("INCLINATION", 0)),
                "raan": float(rec.get("RA_OF_ASC_NODE", 0)),
                "mean_motion": mean_motion,
                "period": float(rec["PERIOD"]) if rec.get("PERIOD") else 1440.0 / mean_motion,
                "bstar": float(rec.get("BSTAR", 0)),
            })
        except (ValueError, KeyError, TypeError):
            continue
    return parsed


def _detect_maneuvers(parsed: list[dict]) -> list[dict]:
    """Detect maneuvers from consecutive TLE records."""
    if len(parsed) < 2:
        return []

    maneuvers = []
    for i in range(1, len(parsed)):
        prev, curr = parsed[i - 1], parsed[i]

        d_sma = curr["sma_km"] - prev["sma_km"]
        d_inc = curr["inclination"] - prev["inclination"]
        d_ecc = curr["eccentricity"] - prev["eccentricity"]

        if abs(d_sma) <= SMA_THRESHOLD and abs(d_inc) <= INC_THRESHOLD and abs(d_ecc) <= ECC_THRESHOLD:
            continue

        maneuver_type = "unknown"
        if abs(d_inc) > INC_THRESHOLD:
            maneuver_type = "plane_change"
        elif d_sma > SMA_THRESHOLD:
            maneuver_type = "altitude_raise"
        elif d_sma < -SMA_THRESHOLD:
            maneuver_type = "altitude_lower"
        elif abs(d_ecc) > ECC_THRESHOLD:
            maneuver_type = "eccentricity_change"

        # Estimate delta-v
        v_before = math.sqrt(MU / prev["sma_km"]) * 1000 if prev["sma_km"] > 0 else 0
        v_after = math.sqrt(MU / curr["sma_km"]) * 1000 if curr["sma_km"] > 0 else 0
        delta_v = abs(v_after - v_before)

        maneuvers.append({
            "date": curr["epoch"],
            "type": maneuver_type,
            "delta_sma_km": round(d_sma, 3),
            "delta_inc_deg": round(d_inc, 4),
            "delta_ecc": round(d_ecc, 6),
            "estimated_delta_v_ms": round(delta_v, 2),
            "altitude_after_km": round(curr["altitude_km"], 1),
        })

    return maneuvers


def _maneuver_summary(maneuvers: list[dict]) -> str:
    """Produce a human-readable maneuver summary."""
    if not maneuvers:
        return "No maneuvers detected in the analysis period."

    types: dict[str, int] = {}
    for m in maneuvers:
        t = m["type"]
        types[t] = types.get(t, 0) + 1

    total_dv = sum(m["estimated_delta_v_ms"] for m in maneuvers)
    last = maneuvers[-1]

    parts = [f"{len(maneuvers)} maneuvers detected"]
    parts.append(f"Types: {', '.join(f'{t}({c})' for t, c in types.items())}")
    parts.append(f"Total estimated delta-v: {total_dv:.1f} m/s")
    parts.append(f"Most recent: {last['type']} on {last['date']}")
    return ". ".join(parts)


# ---------------------------------------------------------------------------
# Agent class
# ---------------------------------------------------------------------------

class AdversaryResearchAgent(BaseAgent):
    """Deep research agent for a single adversary satellite."""

    name = "adversary_research"

    def __init__(self, on_progress: ProgressCallback = None):
        super().__init__(on_progress=on_progress)

    async def run(self, norad_id: int, satellite_name: str = "") -> dict:
        """
        Run deep research on a single adversary satellite.

        Args:
            norad_id: NORAD catalog number of the satellite to research
            satellite_name: Optional name hint (used in the prompt)

        Returns:
            Parsed intelligence dossier as a dict, or raw text on parse failure
        """
        name_str = f" ({satellite_name})" if satellite_name else ""
        await self._notify(
            f"Initiating deep research on NORAD {norad_id}{name_str}..."
        )

        user_msg = (
            f"Conduct a comprehensive intelligence research dossier on the "
            f"adversary satellite with NORAD catalog number {norad_id}"
            f"{name_str}.\n\n"
            f"Follow the research protocol: query the Space-Track catalog, "
            f"fetch orbital history, then conduct at least 3 Perplexity "
            f"searches to build a complete picture. Synthesize everything "
            f"into the required JSON format."
        )

        raw = await self._run_with_tools(
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
            tools=TOOLS,
            tool_handlers={
                "search_perplexity": _handle_search_perplexity,
                "query_spacetrack_catalog": _handle_query_spacetrack_catalog,
                "query_spacetrack_history": _handle_query_spacetrack_history,
            },
            max_iterations=15,  # More iterations — this agent does many tool calls
        )

        await self._notify("Compiling intelligence dossier...")

        # Parse the JSON output
        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()

            dossier = json.loads(cleaned)
            await self._notify("Research complete — dossier compiled.")
            return dossier

        except (json.JSONDecodeError, Exception) as exc:
            logger.warning("Failed to parse research output: %s", exc)
            logger.debug("Raw output: %s", raw[:500])
            await self._notify("Research complete — returning raw analysis.")
            return {
                "norad_id": norad_id,
                "name": satellite_name,
                "raw_analysis": raw,
                "parse_error": str(exc),
            }

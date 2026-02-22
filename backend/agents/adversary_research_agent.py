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

Write the dossier as a well-structured Markdown document with the following sections. Use natural prose — NOT JSON. Write like an intelligence analyst writing a briefing document.

## Intelligence Dossier: <satellite name>

**NORAD ID:** ...
**COSPAR ID:** ...
**Operator:** ...
**Country:** ...
**Orbit:** ...
**Launch Date:** ...

### Declared Mission
<What the operator officially says it does>

### Assessed Mission
<Your intelligence assessment of the real mission, with confidence level>

### Capabilities
<Describe maneuverability, sensors, robotic arms, proximity ops capability, estimated delta-v budget, satellite bus, mass, power>

### Behavioral History
<Total maneuvers detected, frequency, types, patterns. Reference specific dates and delta-v values from the TLE analysis.>

### Program Context
<Which satellite program/series this belongs to, related satellites, brief program history, military significance>

### Threat Assessment
<Threat level (LOW/MEDIUM/HIGH/CRITICAL) with a score out of 100. Detailed reasoning. Key concerns. Recommended monitoring actions.>

### Intelligence Sources
<List each source used with a brief note on what it contributed>

Write ONLY the Markdown dossier, no preamble or commentary."""


# ---------------------------------------------------------------------------
# Brief generation prompt — fast 1-paragraph summary from catalog data
# ---------------------------------------------------------------------------

BRIEF_SYSTEM_PROMPT = """You are a space-domain intelligence analyst. Given Space-Track catalog data and a single search result about an adversary satellite, write a brief 3-5 sentence intelligence summary.

Include: satellite identity, operator, orbit, assessed mission, and any immediate concerns. Write in a direct military intelligence style. This is a preliminary brief — a full dossier will follow.

Write ONLY the brief paragraph, no headers or markdown formatting."""

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

    async def run(self, norad_id: int, satellite_name: str = "", query: str = "") -> str:
        """
        Run deep research on a single adversary satellite.

        Args:
            norad_id: NORAD catalog number of the satellite to research
            satellite_name: Optional name hint (used in the prompt)
            query: Optional follow-up question to focus the research on

        Returns:
            Markdown intelligence dossier as a string
        """
        name_str = f" ({satellite_name})" if satellite_name else ""
        await self._notify(
            f"Initiating deep research on NORAD {norad_id}{name_str}..."
        )

        if query:
            user_msg = (
                f"The user has a specific follow-up question about the "
                f"adversary satellite NORAD {norad_id}{name_str}:\n\n"
                f'"{query}"\n\n'
                f"Conduct targeted research to answer this question. "
                f"Query the Space-Track catalog and orbital history, then "
                f"run at least 3 Perplexity searches focused on the user's "
                f"question. Synthesize everything into the Markdown dossier format."
            )
        else:
            user_msg = (
                f"Conduct a comprehensive intelligence research dossier on the "
                f"adversary satellite with NORAD catalog number {norad_id}"
                f"{name_str}.\n\n"
                f"Follow the research protocol: query the Space-Track catalog, "
                f"fetch orbital history, then conduct at least 3 Perplexity "
                f"searches to build a complete picture. Synthesize everything "
                f"into the Markdown dossier format."
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

        await self._notify("Research complete — dossier compiled.")
        return raw.strip()

    async def brief(self, norad_id: int, satellite_name: str = "") -> str:
        """
        Generate a fast preliminary brief using catalog data + 1 Perplexity search.

        Much faster than a full run() — typically 5-10 seconds vs 30-60.
        Returns a short markdown brief string.
        """
        name_str = f" ({satellite_name})" if satellite_name else ""
        await self._notify(f"Generating preliminary brief for NORAD {norad_id}{name_str}...")

        # Gather catalog data and one search in parallel (via threads)
        import concurrent.futures

        catalog_data = {}
        search_result = {}

        def _get_catalog():
            return _handle_query_spacetrack_catalog({"norad_id": norad_id})

        def _get_search():
            search_query = f"{satellite_name} satellite mission capabilities" if satellite_name else f"NORAD {norad_id} satellite"
            return _handle_search_perplexity({"query": search_query})

        loop = asyncio.get_event_loop()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            cat_future = loop.run_in_executor(pool, _get_catalog)
            search_future = loop.run_in_executor(pool, _get_search)
            catalog_data = await cat_future
            search_result = await search_future

        # Build a context string for Claude
        context_parts = []
        if catalog_data.get("found"):
            context_parts.append(f"Space-Track catalog data: {json.dumps(catalog_data, indent=2)}")
        if search_result.get("content"):
            context_parts.append(f"Perplexity search result: {search_result['content'][:1500]}")

        if not context_parts:
            return f"## Preliminary Brief: {satellite_name or f'NORAD {norad_id}'}\n\nUnable to retrieve catalog data. Full research in progress..."

        user_msg = (
            f"Write a preliminary intelligence brief for {satellite_name or f'NORAD {norad_id}'}.\n\n"
            + "\n\n".join(context_parts)
        )

        brief_text = await self._run_with_tools(
            system=BRIEF_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
            tools=[],
            tool_handlers={},
            max_iterations=1,
        )

        # Format as a brief header + paragraph
        name_display = catalog_data.get("name", satellite_name) or f"NORAD {norad_id}"
        country = catalog_data.get("country_code") or catalog_data.get("country", "Unknown")
        orbit_info = ""
        if catalog_data.get("period_min"):
            period = float(catalog_data["period_min"]) if catalog_data["period_min"] else 0
            if period > 1400:
                orbit_info = "GEO"
            elif period > 600:
                orbit_info = "MEO"
            else:
                orbit_info = "LEO"
            alt = catalog_data.get("apogee_km", "")
            if alt:
                orbit_info += f" ~{alt} km"

        header = f"## Preliminary Brief: {name_display}\n\n"
        header += f"**NORAD ID:** {norad_id}  \n"
        if catalog_data.get("object_id"):
            header += f"**COSPAR ID:** {catalog_data['object_id']}  \n"
        header += f"**Country:** {country}  \n"
        if orbit_info:
            header += f"**Orbit:** {orbit_info}  \n"
        if catalog_data.get("launch_date"):
            header += f"**Launch Date:** {catalog_data['launch_date']}  \n"
        header += "\n"

        return header + brief_text.strip()

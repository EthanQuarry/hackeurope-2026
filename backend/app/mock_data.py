"""Satellite catalog & lookup functions.

Provides lookup_satellite() and search_catalog() used by the AI agent pipeline.
Data comes from the live satellite cache (populated by Space-Track polling).
Falls back to a minimal built-in catalog for scenario-critical satellites only
(USA-245, SJ-26) so the demo works even if Space-Track is unreachable.
"""

from __future__ import annotations

# Minimal catalog — only scenario-critical entries that may not be in public TLE data
SATELLITE_CATALOG: dict[int, dict] = {
    6: {
        "norad_id": 39232,
        "name": "USA-245 (NROL-65)",
        "nation": "United States",
        "owner": "NRO (National Reconnaissance Office)",
        "purpose": "Classified — believed to be KH-11 electro-optical reconnaissance",
        "orbit_type": "LEO",
        "launch_year": 2013,
    },
    25: {
        "norad_id": 99910,
        "name": "SJ-26 (SHIJIAN-26)",
        "nation": "China",
        "owner": "CNSA",
        "purpose": "Earth observation and atmospheric research",
        "orbit_type": "LEO",
        "launch_year": 2025,
    },
}


def _get_live_satellites() -> list[dict]:
    """Get satellites from the live cache if available."""
    try:
        from app.routes.data import _satellites_cache
        return _satellites_cache or []
    except Exception:
        return []


def lookup_satellite(satellite_id: int) -> dict | None:
    """Look up a satellite by its simulation catalog ID.

    Checks the live Space-Track cache first, falls back to the minimal catalog.
    For SJ-26, returns the dynamic scenario entry.
    """
    if satellite_id == 25:
        from app.scenario import sj26_catalog_entry
        return sj26_catalog_entry()

    # Check live satellite data
    live = _get_live_satellites()
    for sat in live:
        # Match by catalog ID pattern (sat-{id})
        if sat.get("id") == f"sat-{satellite_id}":
            return {
                "norad_id": sat.get("noradId", 0),
                "name": sat.get("name", "Unknown"),
                "nation": _infer_nation(sat),
                "status": sat.get("status", "nominal"),
                "altitude_km": sat.get("altitude_km", 0),
                "orbit_type": _infer_orbit_type(sat.get("altitude_km", 0)),
            }

    # Fall back to minimal catalog
    return SATELLITE_CATALOG.get(satellite_id)


def search_catalog(query: str) -> list[dict]:
    """Search satellites by keyword. Checks live data first, then minimal catalog."""
    from app.scenario import sj26_catalog_entry, SJ26_CATALOG_ID

    query_lower = query.lower()
    results = []

    # Search live satellites
    live = _get_live_satellites()
    for sat in live:
        name = sat.get("name", "")
        if query_lower in name.lower() or query_lower in str(sat.get("noradId", "")):
            results.append({
                "id": sat.get("id", ""),
                "norad_id": sat.get("noradId", 0),
                "name": name,
                "status": sat.get("status", "nominal"),
            })

    # Also search minimal catalog for scenario satellites
    for sat_id, entry in SATELLITE_CATALOG.items():
        effective = sj26_catalog_entry() if sat_id == SJ26_CATALOG_ID else entry
        searchable = " ".join(str(v) for v in effective.values()).lower()
        if query_lower in searchable:
            # Avoid duplicates
            eid = f"sat-{sat_id}"
            if not any(r.get("id") == eid for r in results):
                results.append({"id": eid, **effective})

    return results


def _infer_nation(sat: dict) -> str:
    """Infer nation from satellite status."""
    status = sat.get("status", "")
    if status in ("allied", "friendly"):
        return "Allied"
    if status == "watched":
        return "Adversary"
    if status == "threatened":
        return "Hostile"
    return "Unknown"


def _infer_orbit_type(alt_km: float) -> str:
    if alt_km < 2000:
        return "LEO"
    if alt_km < 35000:
        return "MEO"
    return "GEO"

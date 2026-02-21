"""REST endpoints matching frontend API: /satellites, /debris, /threats, /responses."""

from __future__ import annotations

import logging
import math
import random
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.spacetrack import get_client, gp_to_satellite, gp_to_debris

logger = logging.getLogger(__name__)

router = APIRouter()

# Well-known NORAD IDs to fetch as our "fleet"
FLEET_NORAD_IDS = [
    25544,  # ISS
    43013,  # NOAA-20
    27424,  # AQUA
    36508,  # CRYOSAT-2
    44238,  # STARLINK-1007
    39232,  # USA-245
    48274,  # COSMOS-2558
    43600,  # ICEYE-X1
    49260,  # TIANHE (CSS)
    25994,  # TERRA
    41240,  # SENTINEL-2A
    28474,  # GPS IIR-M
    40258,  # ASTRA 2G
    41866,  # INTELSAT 36
    43435,  # WGS-10
]

# Cached results
_satellites_cache: list[dict] | None = None
_satellites_cache_time: float = 0
_debris_cache: list[dict] | None = None
_debris_cache_time: float = 0


def _generate_fallback_satellites() -> list[dict]:
    """Fallback mock data if Space-Track is unavailable."""
    from app.mock_data import SATELLITE_CATALOG
    base_t = time.time()
    sats = []
    for idx, (sat_id, entry) in enumerate(SATELLITE_CATALOG.items()):
        alt_km = {
            "LEO": 400 + random.random() * 400,
            "MEO": 2000 + random.random() * 18000,
            "GEO": 35786,
        }.get(entry.get("orbit_type", "LEO"), 500)

        inc_deg = 51.6 + random.random() * 40
        raan_deg = random.random() * 360
        period_min = 2 * math.pi * math.sqrt((6378.137 + alt_km) ** 3 / 398600.4418) / 60
        v_kms = math.sqrt(398600.4418 / (6378.137 + alt_km))

        nation = entry.get("nation", "Unknown")
        status = "friendly"
        if "Russia" in nation or "China" in nation:
            status = "watched"
        if entry.get("suspicious"):
            status = "threatened"

        trajectory = []
        period_sec = period_min * 60
        inc_rad = math.radians(inc_deg)
        raan_rad = math.radians(raan_deg)
        for i in range(180):
            step = period_sec / 180
            t = base_t + i * step
            ta = (2 * math.pi / period_sec) * (i * step)
            x, y = math.cos(ta), math.sin(ta)
            xe = x * math.cos(raan_rad) - y * math.cos(inc_rad) * math.sin(raan_rad)
            ye = x * math.sin(raan_rad) + y * math.cos(inc_rad) * math.cos(raan_rad)
            ze = y * math.sin(inc_rad)
            lat = math.degrees(math.asin(max(-1, min(1, ze))))
            lon = math.degrees(math.atan2(ye, xe))
            trajectory.append({"t": t, "lat": round(lat, 2), "lon": round(lon, 2), "alt_km": round(alt_km, 1)})

        sats.append({
            "id": f"sat-{idx}",
            "name": entry.get("name", f"SAT-{sat_id}"),
            "noradId": entry.get("norad_id", 99000 + idx),
            "status": status,
            "altitude_km": round(alt_km, 1),
            "velocity_kms": round(v_kms, 2),
            "inclination_deg": round(inc_deg, 1),
            "period_min": round(period_min, 1),
            "trajectory": trajectory,
            "health": {
                "power": 60 + (sat_id * 7) % 35,
                "comms": 70 + (sat_id * 11) % 30,
                "propellant": 20 + (sat_id * 13) % 70,
            },
        })
    return sats


def _generate_fallback_debris(count: int = 2500) -> list[dict]:
    """Fallback random debris."""
    debris = []
    for i in range(count):
        debris.append({
            "noradId": 90000 + i,
            "lat": round((random.random() - 0.5) * 160, 2),
            "lon": round((random.random() - 0.5) * 360, 2),
            "altKm": round(200 + random.random() * 1800, 1),
        })
    return debris


@router.get("/satellites")
async def get_satellites():
    global _satellites_cache, _satellites_cache_time
    now = time.time()
    if _satellites_cache and (now - _satellites_cache_time) < 3600:
        return _satellites_cache

    try:
        client = get_client()
        gp_data = client.fetch_satellites(FLEET_NORAD_IDS)
        sats = [gp_to_satellite(gp, i) for i, gp in enumerate(gp_data)]
        logger.info("Fetched %d satellites from Space-Track", len(sats))
    except Exception as exc:
        logger.warning("Space-Track fetch failed, using fallback: %s", exc)
        sats = _generate_fallback_satellites()

    _satellites_cache = sats
    _satellites_cache_time = now
    return sats


@router.get("/debris")
async def get_debris():
    global _debris_cache, _debris_cache_time
    now = time.time()
    if _debris_cache and (now - _debris_cache_time) < 86400:
        return _debris_cache

    try:
        client = get_client()
        gp_data = client.fetch_debris(limit=500)
        debris = [gp_to_debris(gp) for gp in gp_data]
        # Pad to 2500 with random scatter if we got fewer
        while len(debris) < 2500:
            base = debris[len(debris) % len(debris)] if debris else {"noradId": 90000, "lat": 0, "lon": 0, "altKm": 500}
            debris.append({
                "noradId": 90000 + len(debris),
                "lat": round(base["lat"] + (random.random() - 0.5) * 20, 2),
                "lon": round(base["lon"] + (random.random() - 0.5) * 20, 2),
                "altKm": round(base["altKm"] + (random.random() - 0.5) * 200, 1),
            })
        logger.info("Fetched %d debris from Space-Track (padded to %d)", len(gp_data), len(debris))
    except Exception as exc:
        logger.warning("Debris fetch failed, using fallback: %s", exc)
        debris = _generate_fallback_debris()

    _debris_cache = debris
    _debris_cache_time = now
    return debris


@router.get("/threats")
async def get_threats():
    """Return conjunction/threat events. Uses satellite data to compute proximity."""
    sats = _satellites_cache or _generate_fallback_satellites()

    threats = []
    now_ms = int(time.time() * 1000)

    # Generate threats from close pairs
    for i in range(len(sats)):
        for j in range(i + 1, len(sats)):
            a = sats[i]
            b = sats[j]
            alt_diff = abs(a["altitude_km"] - b["altitude_km"])
            inc_diff = abs(a["inclination_deg"] - b["inclination_deg"])

            # Satellites in similar orbits = potential conjunction
            if alt_diff < 50 and inc_diff < 15:
                miss_km = alt_diff + random.random() * 5
                severity = "threatened" if miss_km < 5 else ("watched" if miss_km < 30 else "nominal")
                tca_min = int(10 + random.random() * 110)

                a_traj = a["trajectory"][0] if a["trajectory"] else {"lat": 0, "lon": 0, "altKm": a["altitude_km"]}
                b_traj = b["trajectory"][0] if b["trajectory"] else {"lat": 0, "lon": 0, "altKm": b["altitude_km"]}

                intent = "Uncontrolled debris"
                confidence = 0.85 + random.random() * 0.1
                if a["status"] == "watched" or b["status"] == "watched":
                    intent = "Maneuvering — intent unclear"
                    confidence = 0.5 + random.random() * 0.2
                if a["status"] == "threatened" or b["status"] == "threatened":
                    intent = "Possible hostile approach"
                    confidence = 0.6 + random.random() * 0.3

                threats.append({
                    "id": f"threat-{len(threats) + 1}",
                    "primaryId": a["id"],
                    "secondaryId": b["id"],
                    "primaryName": a["name"],
                    "secondaryName": b["name"],
                    "severity": severity,
                    "missDistanceKm": round(miss_km, 1),
                    "tcaTime": now_ms + tca_min * 60 * 1000,
                    "tcaInMinutes": tca_min,
                    "primaryPosition": {"lat": a_traj.get("lat", 0), "lon": a_traj.get("lon", 0), "altKm": a["altitude_km"]},
                    "secondaryPosition": {"lat": b_traj.get("lat", 0), "lon": b_traj.get("lon", 0), "altKm": b["altitude_km"]},
                    "intentClassification": intent,
                    "confidence": round(confidence, 2),
                })

    # Sort by severity
    severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
    threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), t["tcaInMinutes"]))
    return threats[:10]  # Cap at 10 for UI


@router.get("/responses")
async def get_responses():
    """Return AI-generated response recommendations based on current threats."""
    threats_data = await get_threats()
    responses = []

    for threat in threats_data[:5]:
        if threat["severity"] == "threatened":
            responses.append({
                "id": f"resp-{len(responses) + 1}",
                "threatId": threat["id"],
                "type": "maneuver",
                "description": f"Execute avoidance burn for {threat['primaryName']} — miss distance {threat['missDistanceKm']} km, TCA T+{threat['tcaInMinutes']} min.",
                "deltaV": round(0.05 + random.random() * 0.2, 2),
                "confidence": round(0.85 + random.random() * 0.1, 2),
                "timestamp": int(time.time() * 1000),
            })
        elif threat["severity"] == "watched":
            responses.append({
                "id": f"resp-{len(responses) + 1}",
                "threatId": threat["id"],
                "type": "monitor",
                "description": f"Continue tracking {threat['secondaryName']}. Reassess if miss distance drops below 5 km.",
                "confidence": round(0.7 + random.random() * 0.15, 2),
                "timestamp": int(time.time() * 1000),
            })

    return responses

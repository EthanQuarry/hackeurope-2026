"""REST endpoints matching frontend API: /satellites, /debris, /threats, /responses."""

from __future__ import annotations

import logging
import math
import random
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.spacetrack import get_client, gp_to_satellite, gp_to_debris
from app import scenario

logger = logging.getLogger(__name__)

router = APIRouter()

# Well-known NORAD IDs — key satellites across all orbit types
FLEET_NORAD_IDS = [
    # --- Crewed / Space Stations ---
    25544,  # ISS (ZARYA)
    48274,  # COSMOS-2558 (Russian inspector)
    49260,  # TIANHE (Chinese Space Station)
    # --- Earth Observation ---
    43013,  # NOAA-20
    27424,  # AQUA
    25994,  # TERRA
    36508,  # CRYOSAT-2
    41240,  # SENTINEL-2A
    39084,  # LANDSAT 8
    43602,  # SENTINEL-3B
    43600,  # ICEYE-X1
    # --- Military / Reconnaissance ---
    39232,  # USA-245 (NRO KH-11)
    43232,  # USA-281 (NRO)
    28884,  # USA-184 (NROL)
    40258,  # ASTRA 2G (comms near military)
    # --- Navigation (MEO) ---
    28474,  # GPS IIR-M 3
    32260,  # GPS IIF-1
    40534,  # GPS III-1
    36585,  # GLONASS-M
    38857,  # GALILEO-IOV PFM
    44204,  # BEIDOU-3 M17
    # --- Communications (GEO & LEO) ---
    41866,  # INTELSAT 36
    43435,  # WGS-10 (US mil SATCOM)
    40874,  # MUOS-4 (US Navy)
    # --- Starlink constellation (sample) ---
    44238,  # STARLINK-1007
    44240,  # STARLINK-1008
    44914,  # STARLINK-1032
    45044,  # STARLINK-1180
    45189,  # STARLINK-1305
    45386,  # STARLINK-1436
    45535,  # STARLINK-1564
    45715,  # STARLINK-1680
    46080,  # STARLINK-1902
    47181,  # STARLINK-2415
    48601,  # STARLINK-2737
    # --- OneWeb ---
    56700,  # ONEWEB-0453
    49445,  # ONEWEB-0198
    48078,  # ONEWEB-0131
    # --- Science ---
    20580,  # HUBBLE SPACE TELESCOPE
    27386,  # ENVISAT (defunct, large debris risk)
    43205,  # TESS (exoplanet hunter)
    # --- Weather ---
    29155,  # GOES 13
    35491,  # GOES 14
    36411,  # GOES 15
    41882,  # GOES 16
    43226,  # GOES 17
    # --- Russian military ---
    41032,  # COSMOS-2510
    43063,  # COSMOS-2524
    44398,  # COSMOS-2535
    47719,  # COSMOS-2551
    # --- Chinese military / dual-use ---
    49492,  # YAOGAN-34
    50258,  # YAOGAN-35C
    41838,  # TIANLIAN-1-04
    # --- Other notable ---
    37820,  # TIANGONG-1 successor
    28654,  # IRIDIUM 33 (collision remnant)
    22675,  # COSMOS 2251 (collision remnant)
]

# Cached results
_satellites_cache: list[dict] | None = None
_satellites_cache_time: float = 0
_scenario_phase_at_cache: int = -1
_debris_cache: list[dict] | None = None
_debris_cache_time: float = 0


def _generate_fallback_satellites() -> list[dict]:
    """Fallback mock data if Space-Track is unavailable.

    Uses seeded RNG for deterministic orbits across cache rebuilds.
    USA-245 (sat-6) has a fixed orbit.  SJ-26 (sat-25) is generated
    dynamically from the scenario engine.
    """
    from app.mock_data import SATELLITE_CATALOG
    rng = random.Random(42)
    base_t = time.time()
    sats = []
    for idx, (sat_id, entry) in enumerate(SATELLITE_CATALOG.items()):
        # --- SJ-26: fully dynamic from scenario engine ---
        if sat_id == scenario.SJ26_CATALOG_ID:
            dynamic_entry = scenario.sj26_catalog_entry()
            alt_km = scenario.sj26_altitude_km()
            inc_deg = scenario.TARGET_INC_DEG + scenario.sj26_inclination_offset()
            raan_deg = scenario.TARGET_RAAN_DEG + scenario.sj26_raan_offset()
            status = scenario.sj26_status()
        # --- USA-245: fixed deterministic orbit ---
        elif sat_id == scenario.TARGET_CATALOG_ID:
            dynamic_entry = None
            alt_km = scenario.TARGET_ALT_KM
            inc_deg = scenario.TARGET_INC_DEG
            raan_deg = scenario.TARGET_RAAN_DEG
            nation = entry.get("nation", "Unknown")
            status = "friendly"
            if "Russia" in nation or "China" in nation:
                status = "watched"
            if entry.get("suspicious"):
                status = "threatened"
        else:
            dynamic_entry = None
            alt_km = {
                "LEO": 400 + rng.random() * 400,
                "MEO": 2000 + rng.random() * 18000,
                "GEO": 35786,
            }.get(entry.get("orbit_type", "LEO"), 500)
            inc_deg = 51.6 + rng.random() * 40
            raan_deg = rng.random() * 360
            nation = entry.get("nation", "Unknown")
            status = "friendly"
            if "Russia" in nation or "China" in nation:
                status = "watched"
            if entry.get("suspicious"):
                status = "threatened"

        period_min = 2 * math.pi * math.sqrt((6378.137 + alt_km) ** 3 / 398600.4418) / 60
        v_kms = math.sqrt(398600.4418 / (6378.137 + alt_km))

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

        eff = dynamic_entry or entry
        sats.append({
            "id": f"sat-{sat_id}",
            "name": eff.get("name", f"SAT-{sat_id}"),
            "noradId": eff.get("norad_id", 99000 + idx),
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
    global _satellites_cache, _satellites_cache_time, _scenario_phase_at_cache
    now = time.time()
    phase = scenario.current_phase()

    # Invalidate cache on phase transitions so SJ-26 data evolves
    cache_valid = (
        _satellites_cache
        and (now - _satellites_cache_time) < 30  # shorter TTL for scenario responsiveness
        and _scenario_phase_at_cache == phase
    )
    if cache_valid:
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
    _scenario_phase_at_cache = phase
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

    # Compute realistic 3D distances between satellites at their current positions
    # and generate conjunction events for close pairs
    for i in range(len(sats)):
        for j in range(i + 1, len(sats)):
            a = sats[i]
            b = sats[j]

            # Use first trajectory point as current position
            a_traj = a["trajectory"][0] if a["trajectory"] else None
            b_traj = b["trajectory"][0] if b["trajectory"] else None
            if not a_traj or not b_traj:
                continue

            # Compute 3D Euclidean distance in km using geodetic coords
            r_a = 6378.137 + a["altitude_km"]
            r_b = 6378.137 + b["altitude_km"]
            lat_a, lon_a = math.radians(a_traj["lat"]), math.radians(a_traj["lon"])
            lat_b, lon_b = math.radians(b_traj["lat"]), math.radians(b_traj["lon"])

            xa = r_a * math.cos(lat_a) * math.cos(lon_a)
            ya = r_a * math.cos(lat_a) * math.sin(lon_a)
            za = r_a * math.sin(lat_a)
            xb = r_b * math.cos(lat_b) * math.cos(lon_b)
            yb = r_b * math.cos(lat_b) * math.sin(lon_b)
            zb = r_b * math.sin(lat_b)

            dist_km = math.sqrt((xa - xb)**2 + (ya - yb)**2 + (za - zb)**2)

            # Flag conjunctions within 2000 km (snapshot distance)
            # Real CDMs propagate forward — TCA miss distance will be much smaller
            if dist_km > 2000:
                continue

            miss_km = round(dist_km, 2)

            if miss_km < 50:
                severity = "threatened"
            elif miss_km < 500:
                severity = "watched"
            else:
                severity = "nominal"

            tca_min = int(5 + random.random() * 175)  # 5 min to ~3 hours out

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
                "missDistanceKm": round(miss_km, 2),
                "tcaTime": now_ms + tca_min * 60 * 1000,
                "tcaInMinutes": tca_min,
                "primaryPosition": {"lat": a_traj["lat"], "lon": a_traj["lon"], "altKm": a["altitude_km"]},
                "secondaryPosition": {"lat": b_traj["lat"], "lon": b_traj["lon"], "altKm": b["altitude_km"]},
                "intentClassification": intent,
                "confidence": round(confidence, 2),
            })

    # --- Inject deterministic SJ-26 → USA-245 conjunction in phases 2-3 ---
    phase = scenario.current_phase()
    if phase >= 2:
        # Remove any naturally-generated SJ-26↔USA-245 pair to avoid duplicates
        threats = [
            t for t in threats
            if not (
                {t["primaryId"], t["secondaryId"]}
                & {scenario.SJ26_SAT_ID, scenario.TARGET_SAT_ID}
            )
        ]
        miss_km = scenario.sj26_miss_distance_km()
        severity = "threatened" if miss_km < 10 else "watched"
        tca_min = max(1, int(15 - phase * 4))

        # Find SJ-26 and USA-245 positions from sat list
        sj26_pos = {"lat": 0, "lon": 0, "altKm": scenario.sj26_altitude_km()}
        target_pos = {"lat": 0, "lon": 0, "altKm": scenario.TARGET_ALT_KM}
        for s in sats:
            if s["id"] == scenario.SJ26_SAT_ID and s["trajectory"]:
                p = s["trajectory"][0]
                sj26_pos = {"lat": p["lat"], "lon": p["lon"], "altKm": s["altitude_km"]}
            elif s["id"] == scenario.TARGET_SAT_ID and s["trajectory"]:
                p = s["trajectory"][0]
                target_pos = {"lat": p["lat"], "lon": p["lon"], "altKm": s["altitude_km"]}

        threats.append({
            "id": "threat-sj26",
            "primaryId": scenario.TARGET_SAT_ID,
            "secondaryId": scenario.SJ26_SAT_ID,
            "primaryName": "USA-245 (NROL-65)",
            "secondaryName": "SJ-26 (SHIJIAN-26)",
            "severity": severity,
            "missDistanceKm": round(miss_km, 2),
            "tcaTime": now_ms + tca_min * 60 * 1000,
            "tcaInMinutes": tca_min,
            "primaryPosition": target_pos,
            "secondaryPosition": sj26_pos,
            "intentClassification": "Possible hostile approach" if phase == 2 else "Confirmed hostile — grappling deployment",
            "confidence": round(0.7 + phase * 0.1, 2),
        })

    # Sort by severity then TCA
    severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
    threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), t["tcaInMinutes"]))
    return threats[:15]


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

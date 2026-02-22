"""REST endpoints matching frontend API: /satellites, /debris, /threats, /responses."""

from __future__ import annotations

import logging
import math
import random
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.spacetrack import get_client, gp_to_satellite, gp_to_debris
from app import scenario, geo_loiter_demo

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
    # --- Chinese GEO (threat: loiter over Americas) ---
    40402,   # SHIJIAN-13 (Chinese GEO tech demo)
    42836,   # CHINASAT-16
    54066,   # CHINASAT-6E
    # --- Russian GEO (threat: Luch/Olymp approach pattern) ---
    55841,   # LUCH (OLYMP) 2 — approaches Western GEO sats
    40391,   # LUCH-5A
    37763,   # LUCH-5V
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


def _build_usa245_satellite(idx: int) -> dict:
    """Inject USA-245 (NRO KH-11) — classified, not in public Space-Track data."""
    from app.spacetrack import _generate_trajectory

    alt_km = scenario.TARGET_ALT_KM
    inc_deg = scenario.TARGET_INC_DEG
    raan_deg = scenario.TARGET_RAAN_DEG
    period_min = 2 * math.pi * math.sqrt((6378.137 + alt_km) ** 3 / 398600.4418) / 60
    v_kms = math.sqrt(398600.4418 / (6378.137 + alt_km))

    trajectory = _generate_trajectory(inc_deg, alt_km, raan_deg, 45.0, period_min)

    return {
        "id": scenario.TARGET_SAT_ID,
        "name": "USA-245 (NROL-65)",
        "noradId": 39232,
        "status": "allied",
        "country_code": "USA",
        "altitude_km": round(alt_km, 1),
        "velocity_kms": round(v_kms, 2),
        "inclination_deg": round(inc_deg, 1),
        "period_min": round(period_min, 1),
        "trajectory": trajectory,
        "health": {
            "power": 91,
            "comms": 96,
            "propellant": 68,
        },
    }


def _orbit_xyz(alt_km: float, inc_deg: float, raan_deg: float, ta: float):
    """Orbital elements → scene-space xyz (Earth radius = 1.0, Y=north, Z=-lon90).
    Same coordinate system as frontend's geodeticToSceneVec3."""
    r = 1.0 + alt_km / 6378.137
    inc = math.radians(inc_deg)
    raan = math.radians(raan_deg)
    xo, yo = math.cos(ta), math.sin(ta)
    # ECI
    xe = xo * math.cos(raan) - yo * math.cos(inc) * math.sin(raan)
    ye_eci = xo * math.sin(raan) + yo * math.cos(inc) * math.cos(raan)
    ze = yo * math.sin(inc)
    # ECI → scene (match geodeticToSceneVec3: x=cos(lat)cos(lon), y=sin(lat), z=-cos(lat)sin(lon))
    lat = math.asin(max(-1, min(1, ze)))
    lon = math.atan2(ye_eci, xe)
    return (
        r * math.cos(lat) * math.cos(lon),
        r * math.sin(lat),
        -r * math.cos(lat) * math.sin(lon),
    )


def _build_sj26_satellite(idx: int) -> dict:
    """Build SJ-26 on its OWN orbit, near but separate from USA-245.

    SJ-26 is on a nearby but different orbit (slightly different inclination).
    The two rings are close but visibly separate — they don't overlap.
    SJ-26 is positioned ahead of USA-245 in the direction of travel.

    Phase 0: SJ-26 goes straight on its own orbit ring. Green. Normal.
    Phase 1+: SJ-26 fires thrusters and arcs OFF its orbit INTO USA-245's
              orbit path. The maneuver arc is a curved line from SJ-26's
              ring to USA-245's ring, creating a collision course.
    """
    from app.spacetrack import _generate_trajectory

    phase = scenario.current_phase()
    progress = scenario.phase_progress()
    status = scenario.sj26_status()

    # USA-245's orbit
    TGT_ALT = scenario.TARGET_ALT_KM      # 500 km
    TGT_INC = scenario.TARGET_INC_DEG     # 63.4°
    TGT_RAAN = scenario.TARGET_RAAN_DEG   # 142°

    # SJ-26's OWN orbit — same altitude, slightly different inclination
    # This makes two rings that are close but tilted differently
    SJ_ALT = 505.0           # slightly higher
    SJ_INC = TGT_INC + 5.0   # 68.4° — 5° more tilted
    SJ_RAAN = TGT_RAAN + 3.0 # 145° — slightly rotated

    # SJ-26 is ahead of USA-245: USA-245 at ma=45°, SJ-26 at ma=65°
    SJ_MA = 65.0

    period_min = 2 * math.pi * math.sqrt((6378.137 + SJ_ALT) ** 3 / 398600.4418) / 60

    # SJ-26 always orbits on its own ring
    trajectory = _generate_trajectory(SJ_INC, SJ_ALT, SJ_RAAN, SJ_MA, period_min)

    # Maneuver arc: only appears in phase 2+ (when threat is actually detected)
    # Phase 0-1: no arc — SJ-26 is just being watched, no confirmed hostile maneuver yet
    # Phase 2+: arc shows the projected collision course from SJ-26's orbit to USA-245's
    maneuver_arc = None
    if phase >= 2:
        ta_depart = math.radians(SJ_MA + 30)
        p0 = _orbit_xyz(SJ_ALT, SJ_INC, SJ_RAAN, ta_depart)

        ta_arrive = math.radians(45 + 15)
        p2 = _orbit_xyz(TGT_ALT, TGT_INC, TGT_RAAN, ta_arrive)

        mx = (p0[0] + p2[0]) / 2
        my = (p0[1] + p2[1]) / 2
        mz = (p0[2] + p2[2]) / 2
        m_len = math.sqrt(mx*mx + my*my + mz*mz)
        bulge = 0.08
        p1 = (
            mx + (mx / m_len) * bulge,
            my + (my / m_len) * bulge,
            mz + (mz / m_len) * bulge,
        )

        arc_points = []
        for i in range(101):
            u = i / 100
            w0 = (1 - u) ** 2
            w1 = 2 * (1 - u) * u
            w2 = u * u
            arc_points.append([
                w0 * p0[0] + w1 * p1[0] + w2 * p2[0],
                w0 * p0[1] + w1 * p1[1] + w2 * p2[1],
                w0 * p0[2] + w1 * p1[2] + w2 * p2[2],
            ])
        maneuver_arc = arc_points

    period_sec = period_min * 60
    v_kms = math.sqrt(398600.4418 / (6378.137 + SJ_ALT))

    result = {
        "id": scenario.SJ26_SAT_ID,
        "name": "SJ-26 (SHIJIAN-26)",
        "noradId": scenario.SJ26_NORAD_ID,
        "status": status,
        "country_code": "PRC",
        "altitude_km": round(SJ_ALT, 1),
        "velocity_kms": round(v_kms, 2),
        "inclination_deg": round(SJ_INC, 1),
        "period_min": round(period_min, 1),
        "trajectory": trajectory,
        "health": {
            "power": 94,
            "comms": 97,
            "propellant": 82 if phase < 2 else max(30, 82 - phase * 15),
        },
    }
    if maneuver_arc:
        result["maneuverArc"] = maneuver_arc

    return result


def _generate_fallback_satellites() -> list[dict]:
    """Fallback when Space-Track is unavailable.

    Only generates scenario-critical satellites (USA-245 + SJ-26).
    Real satellite data should come from Space-Track.
    """
    sats = [
        _build_usa245_satellite(0),
        _build_sj26_satellite(1),
    ]
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
async def get_satellites(speed: float = 1.0):
    global _satellites_cache, _satellites_cache_time, _scenario_phase_at_cache
    # Sync sim speed so scenario timing matches frontend
    scenario.set_speed(speed)
    now = time.time()
    phase = scenario.current_phase()

    # Invalidate cache on phase transitions so SJ-26 data evolves
    # TTL scales inversely with sim speed (30s at 1x, 3s at 10x, 0.5s at 60x+)
    cache_valid = (
        _satellites_cache
        and (now - _satellites_cache_time) < scenario.scaled_ttl(30)
        and _scenario_phase_at_cache == phase
    )
    if cache_valid:
        return _satellites_cache

    try:
        client = get_client()
        gp_data = client.fetch_satellites(FLEET_NORAD_IDS)
        sats = [gp_to_satellite(gp, i) for i, gp in enumerate(gp_data)]
        logger.info("Fetched %d satellites from Space-Track", len(sats))
        # Inject classified/scenario satellites not in public Space-Track data
        sats = [s for s in sats if s["id"] not in (scenario.SJ26_SAT_ID, scenario.TARGET_SAT_ID)]
        sats.append(_build_usa245_satellite(len(sats)))
        sats.append(_build_sj26_satellite(len(sats)))
    except Exception as exc:
        logger.warning("Space-Track fetch failed, using fallback: %s", exc)
        sats = _generate_fallback_satellites()

    _satellites_cache = sats
    _satellites_cache_time = now
    _scenario_phase_at_cache = phase
    return sats


@router.post("/scenario/reset")
async def reset_scenario():
    """Reset the SJ-26 scenario clock back to phase 0."""
    scenario.reset()
    return {"status": "reset", "phase": 0}


@router.get("/scenario/sj26")
async def get_sj26_scenario(speed: float = 1.0):
    """Return SJ-26 scenario state for frontend trajectory computation."""
    scenario.set_speed(speed)
    return {
        "phase": scenario.current_phase(),
        "progress": round(scenario.phase_progress(), 3),
        "status": scenario.sj26_status(),
        "elapsed": round(scenario.elapsed(), 1),
        # Original orbit (benign)
        "originalOrbit": {
            "altKm": 520.0,
            "incDeg": scenario.TARGET_INC_DEG + 8.0,
            "raanDeg": scenario.TARGET_RAAN_DEG + 25.0,
        },
        # Current converged orbit (phase-dependent)
        "currentOrbit": {
            "altKm": round(scenario.sj26_altitude_km(), 1),
            "incDeg": round(scenario.TARGET_INC_DEG + scenario.sj26_inclination_offset(), 1),
            "raanDeg": round(scenario.TARGET_RAAN_DEG + scenario.sj26_raan_offset(), 1),
        },
        # USA-245 target orbit
        "targetOrbit": {
            "altKm": scenario.TARGET_ALT_KM,
            "incDeg": scenario.TARGET_INC_DEG,
            "raanDeg": scenario.TARGET_RAAN_DEG,
        },
        "missDistanceKm": round(scenario.sj26_miss_distance_km(), 1),
        # How much of the orbit is normal before maneuver
        "normalFraction": round(
            1.0 if scenario.current_phase() == 0 else
            max(0.05, {0: 1.0, 1: 0.7 - 0.25 * scenario.phase_progress(),
                       2: 0.45 - 0.25 * scenario.phase_progress(),
                       3: 0.2 - 0.15 * scenario.phase_progress()}.get(scenario.current_phase(), 0.5)),
            2
        ),
        "arcHeightKm": 40.0,  # Bezier control point altitude boost
    }


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


@router.post("/demo/geo-loiter/start")
async def start_geo_loiter_demo():
    """Activate the GEO US Loiter demo — injects Chinese/Russian satellites at GEO over US."""
    geo_loiter_demo.start()
    # Force immediate cache refresh in threats endpoint
    from app.routes import threats as threat_routes
    threat_routes._geo_cache_time = 0
    return {"status": "started", "active": True}


@router.post("/demo/geo-loiter/stop")
async def stop_geo_loiter_demo():
    """Deactivate the GEO US Loiter demo — returns to real satellite data."""
    geo_loiter_demo.stop()
    from app.routes import threats as threat_routes
    threat_routes._geo_cache_time = 0
    return {"status": "stopped", "active": False}


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

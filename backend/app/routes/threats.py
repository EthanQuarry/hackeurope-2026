"""Threat endpoints: /threats/proximity, /threats/signal, /threats/anomaly.

Generates threat data from real Space-Track satellite orbital data.
Uses Bayesian scoring from the threat_assessment pipeline for confidence values.
"""

from __future__ import annotations

import bisect
import math
import random
import time

from fastapi import APIRouter

from app.bayesian_scorer import score_satellite
from app.orbital_similarity_scorer import score_orbital_similarity

router = APIRouter()

CACHE_TTL = 30  # seconds

_prox_cache: list[dict] | None = None
_osim_cache: list[dict] | None = None
_prox_cache_time: float = 0
_osim_cache_time: float = 0


def _get_satellites() -> list[dict]:
    from app.routes.data import _satellites_cache, _generate_fallback_satellites
    return _satellites_cache or _generate_fallback_satellites()


THREAT_ACTOR_COUNTRIES = {"PRC", "RUS", "CIS"}

FRIENDLY_FORCE_EXCLUDE_NORAD = {25544}  # ISS (international, never a threat actor)
FRIENDLY_FORCE_EXCLUDE_NAMES = ("ISS",)


def _is_friendly_force_excluded(sat: dict) -> bool:
    norad = sat.get("noradId") or sat.get("norad_id")
    if norad is not None and int(norad) in FRIENDLY_FORCE_EXCLUDE_NORAD:
        return True
    name = (sat.get("name") or "").upper()
    return any(exc in name for exc in FRIENDLY_FORCE_EXCLUDE_NAMES)


def _get_adversarial_and_allied(sats: list[dict]) -> tuple[list[dict], list[dict]]:
    adversarial = [
        s for s in sats
        if s.get("country_code") in THREAT_ACTOR_COUNTRIES and not _is_friendly_force_excluded(s)
    ]
    allied = [s for s in sats if s["status"] in ("allied", "friendly")]
    return adversarial, allied


def _traj_ecef(pt: dict) -> tuple[float, float, float]:
    """Convert a trajectory point to ECEF coordinates (km)."""
    r = 6378.137 + pt["alt_km"]
    lat = math.radians(pt["lat"])
    lon = math.radians(pt["lon"])
    return (
        r * math.cos(lat) * math.cos(lon),
        r * math.cos(lat) * math.sin(lon),
        r * math.sin(lat),
    )


def _ecef_dist(a: tuple, b: tuple) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def _find_tca(
    a_traj: list[dict],
    b_traj: list[dict],
) -> tuple[float, float, int]:
    """Scan paired trajectories to find TCA miss distance, relative velocity, and TCA minutes.

    Both trajectory lists are time-stamped sequences of positions computed from real
    orbital elements.  We match trajectory points by absolute timestamp (binary search)
    so different orbital periods are handled correctly.

    Returns (miss_dist_km, approach_vel_kms, tca_min_from_now).
    """
    if not a_traj or not b_traj:
        return 9999.0, 0.0, 99

    # Sort B by timestamp once for binary-search matching
    b_sorted = sorted(b_traj, key=lambda pt: pt["t"])
    b_times = [pt["t"] for pt in b_sorted]

    # Estimate A's time step and period from its trajectory
    step_a = (a_traj[-1]["t"] - a_traj[0]["t"]) / max(1, len(a_traj) - 1)
    period_a = step_a * len(a_traj)

    min_dist = float("inf")
    tca_idx_a = 0
    tca_idx_b = 0

    for ia, pa in enumerate(a_traj):
        t_a = pa["t"]

        # Binary-search for the closest B timestamp
        pos = bisect.bisect_left(b_times, t_a)
        ib = pos if pos < len(b_times) else len(b_times) - 1
        if pos > 0 and abs(b_times[pos - 1] - t_a) < abs(b_times[ib] - t_a):
            ib = pos - 1

        ea = _traj_ecef(pa)
        eb = _traj_ecef(b_sorted[ib])
        d = _ecef_dist(ea, eb)

        if d < min_dist:
            min_dist = d
            tca_idx_a = ia
            tca_idx_b = ib

    # TCA time from now — use absolute timestamp of the TCA point.
    # If the trajectory was cached in the past the TCA may already be behind us;
    # in that case add the orbital period to get the next occurrence.
    now = time.time()
    tca_t = a_traj[tca_idx_a]["t"]
    tca_secs = tca_t - now
    if tca_secs < 0:
        tca_secs += period_a
    tca_min = max(1, int(tca_secs / 60))

    # Relative velocity at TCA via finite differences of consecutive trajectory points
    def vel_vec(traj: list[dict], idx: int) -> tuple[float, float, float]:
        i0 = max(0, idx - 1)
        i1 = min(len(traj) - 1, idx + 1)
        dt = traj[i1]["t"] - traj[i0]["t"]
        if dt == 0:
            return (0.0, 0.0, 0.0)
        p0 = _traj_ecef(traj[i0])
        p1 = _traj_ecef(traj[i1])
        return ((p1[0] - p0[0]) / dt, (p1[1] - p0[1]) / dt, (p1[2] - p0[2]) / dt)

    v_a = vel_vec(a_traj, tca_idx_a)
    v_b = vel_vec(b_sorted, tca_idx_b)
    rel_vel = math.sqrt(
        (v_a[0] - v_b[0]) ** 2 + (v_a[1] - v_b[1]) ** 2 + (v_a[2] - v_b[2]) ** 2
    )

    return min_dist, rel_vel, tca_min


@router.get("/threats/proximity")
async def get_proximity_threats():
    """ProximityThreat[] — foreign satellites approaching our assets."""
    global _prox_cache, _prox_cache_time
    now = time.time()
    if _prox_cache and (now - _prox_cache_time) < CACHE_TTL:
        return _prox_cache

    sats = _get_satellites()
    adversarial, allied = _get_adversarial_and_allied(sats)
    now_ms = int(now * 1000)
    threats = []

    for foreign in adversarial:
        for target in allied:
            ft0 = foreign["trajectory"][0] if foreign["trajectory"] else None
            tt0 = target["trajectory"][0] if target["trajectory"] else None
            if not ft0 or not tt0:
                continue

            # Quick snapshot distance cull — skip pairs that are clearly never going to
            # be close (different altitude shells, opposite sides of the orbit, etc.)
            r_f = 6378.137 + foreign["altitude_km"]
            r_t = 6378.137 + target["altitude_km"]
            lat_f, lon_f = math.radians(ft0["lat"]), math.radians(ft0["lon"])
            lat_t, lon_t = math.radians(tt0["lat"]), math.radians(tt0["lon"])
            snap_dist = math.sqrt(
                (r_f * math.cos(lat_f) * math.cos(lon_f) - r_t * math.cos(lat_t) * math.cos(lon_t)) ** 2 +
                (r_f * math.cos(lat_f) * math.sin(lon_f) - r_t * math.cos(lat_t) * math.sin(lon_t)) ** 2 +
                (r_f * math.sin(lat_f) - r_t * math.sin(lat_t)) ** 2
            )
            if snap_dist > 3000:
                continue

            # Scan full trajectories for true TCA miss distance and relative velocity
            miss_km, approach_vel, tca_min = _find_tca(
                foreign["trajectory"], target["trajectory"]
            )

            # Only surface operationally relevant conjunctions
            if miss_km > 500:
                continue

            # Severity based on propagated miss distance at TCA
            if miss_km < 10:
                severity = "threatened"
            elif miss_km < 100:
                severity = "watched"
            else:
                severity = "nominal"

            # Approach pattern derived from real orbital geometry
            alt_diff = abs(foreign["altitude_km"] - target["altitude_km"])
            inc_diff = abs(foreign["inclination_deg"] - target["inclination_deg"])
            if alt_diff < 30 and inc_diff < 5:
                pattern = "co-orbital"
            elif inc_diff > 40:
                pattern = "direct"
            elif alt_diff > 100:
                pattern = "drift"
            else:
                pattern = "co-orbital"

            # Bayesian posterior using the real TCA miss distance for confidence
            posterior = score_satellite(miss_km, foreign.get("country_code", "UNK"))

            threats.append({
                "id": f"prox-{len(threats) + 1}",
                "foreignSatId": foreign["id"],
                "foreignSatName": foreign["name"],
                "targetAssetId": target["id"],
                "targetAssetName": target["name"],
                "severity": severity,
                "missDistanceKm": round(miss_km, 2),
                "approachVelocityKms": round(approach_vel, 2),
                "tcaTime": now_ms + tca_min * 60 * 1000,
                "tcaInMinutes": tca_min,
                "primaryPosition": {"lat": ft0["lat"], "lon": ft0["lon"], "altKm": foreign["altitude_km"]},
                "secondaryPosition": {"lat": tt0["lat"], "lon": tt0["lon"], "altKm": target["altitude_km"]},
                "approachPattern": pattern,
                "sunHidingDetected": False,
                "confidence": round(posterior, 2),
            })

    severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
    threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), t["missDistanceKm"]))

    _prox_cache = threats[:15]
    _prox_cache_time = now
    return _prox_cache


@router.get("/threats/signal")
async def get_signal_threats():
    """SignalThreat[] — communication link interception risks."""
    return []


@router.get("/threats/anomaly")
async def get_anomaly_threats():
    """AnomalyThreat[] — satellites exhibiting anomalous behavior."""
    return []


@router.get("/threats/orbital-similarity")
async def get_orbital_similarity_threats():
    """OrbitalSimilarityThreat[] — foreign sats with suspiciously similar orbits to allied assets."""
    global _osim_cache, _osim_cache_time
    now = time.time()
    if _osim_cache and (now - _osim_cache_time) < CACHE_TTL:
        return _osim_cache

    sats = _get_satellites()
    adversarial, allied = _get_adversarial_and_allied(sats)
    threats = []

    for foreign in adversarial:
        for target in allied:
            div, posterior = score_orbital_similarity(
                foreign["altitude_km"], foreign["inclination_deg"],
                target["altitude_km"], target["inclination_deg"],
                "CIS",
            )

            if div > 0.8:
                continue

            if posterior > 0.3:
                severity = "threatened"
            elif posterior > 0.1:
                severity = "watched"
            else:
                severity = "nominal"

            d_alt = abs(foreign["altitude_km"] - target["altitude_km"])
            d_inc = abs(foreign["inclination_deg"] - target["inclination_deg"])

            if d_inc < 2 and d_alt < 20:
                pattern = "co-planar"
            elif d_alt < 30:
                pattern = "co-altitude"
            elif d_inc < 5:
                pattern = "co-inclination"
            else:
                pattern = "shadowing"

            ft = foreign["trajectory"][0] if foreign["trajectory"] else None

            threats.append({
                "id": f"osim-{len(threats) + 1}",
                "foreignSatId": foreign["id"],
                "foreignSatName": foreign["name"],
                "targetAssetId": target["id"],
                "targetAssetName": target["name"],
                "severity": severity,
                "inclinationDiffDeg": round(d_inc, 2),
                "altitudeDiffKm": round(d_alt, 1),
                "divergenceScore": round(div, 4),
                "pattern": pattern,
                "confidence": round(posterior, 3),
                "position": (
                    {"lat": ft["lat"], "lon": ft["lon"], "altKm": foreign["altitude_km"]}
                    if ft else {"lat": 0.0, "lon": 0.0, "altKm": foreign["altitude_km"]}
                ),
            })

    severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
    threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), t["divergenceScore"]))

    _osim_cache = threats[:15]
    _osim_cache_time = now
    return _osim_cache

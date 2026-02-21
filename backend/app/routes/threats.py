"""Threat endpoints: /threats/proximity, /threats/signal, /threats/anomaly.

Generates realistic threat data matching the frontend's ProximityThreat,
SignalThreat, and AnomalyThreat TypeScript interfaces. Uses Bayesian scoring
from the threat_assessment pipeline for confidence values.
"""

from __future__ import annotations

import math
import random
import time

from fastapi import APIRouter

from app.bayesian_scorer import score_satellite, ADVERSARIAL_COUNTRIES
from app.orbital_similarity_scorer import score_orbital_similarity
from app import scenario

router = APIRouter()

# Cache — each endpoint has its own time so they refresh independently
_prox_cache: list[dict] | None = None
_sig_cache: list[dict] | None = None
_anom_cache: list[dict] | None = None
_osim_cache: list[dict] | None = None
_prox_cache_time: float = 0
_sig_cache_time: float = 0
_anom_cache_time: float = 0
_osim_cache_time: float = 0
_prox_phase: int = -1
_sig_phase: int = -1
_anom_phase: int = -1
_osim_phase: int = -1
CACHE_TTL = 30  # seconds


def _get_satellites() -> list[dict]:
    from app.routes.data import _satellites_cache, _generate_fallback_satellites
    return _satellites_cache or _generate_fallback_satellites()


def _get_adversarial_and_allied(sats: list[dict]) -> tuple[list[dict], list[dict]]:
    adversarial = [s for s in sats if s["status"] == "watched"]
    allied = [s for s in sats if s["status"] in ("allied", "friendly")]
    return adversarial, allied


@router.get("/threats/proximity")
async def get_proximity_threats():
    """ProximityThreat[] — foreign satellites approaching our assets."""
    global _prox_cache, _prox_cache_time, _prox_phase
    now = time.time()
    phase = scenario.current_phase()
    if _prox_cache and (now - _prox_cache_time) < CACHE_TTL and _prox_phase == phase:
        return _prox_cache

    sats = _get_satellites()
    adversarial, allied = _get_adversarial_and_allied(sats)
    now_ms = int(now * 1000)
    threats = []

    for foreign in adversarial:
        for target in allied:
            # Compute 3D distance
            ft = foreign["trajectory"][0] if foreign["trajectory"] else None
            tt = target["trajectory"][0] if target["trajectory"] else None
            if not ft or not tt:
                continue

            r_f = 6378.137 + foreign["altitude_km"]
            r_t = 6378.137 + target["altitude_km"]
            lat_f, lon_f = math.radians(ft["lat"]), math.radians(ft["lon"])
            lat_t, lon_t = math.radians(tt["lat"]), math.radians(tt["lon"])

            dist = math.sqrt(
                (r_f * math.cos(lat_f) * math.cos(lon_f) - r_t * math.cos(lat_t) * math.cos(lon_t)) ** 2 +
                (r_f * math.cos(lat_f) * math.sin(lon_f) - r_t * math.cos(lat_t) * math.sin(lon_t)) ** 2 +
                (r_f * math.sin(lat_f) - r_t * math.sin(lat_t)) ** 2
            )

            if dist > 1500:
                continue

            miss_km = round(dist, 2)

            # Bayesian posterior as confidence
            posterior = score_satellite(miss_km, "CIS")

            # Determine severity from posterior
            if posterior > 0.3 or miss_km < 5:
                severity = "threatened"
            elif posterior > 0.1 or miss_km < 50:
                severity = "watched"
            else:
                severity = "nominal"

            # Approach pattern
            alt_diff = abs(foreign["altitude_km"] - target["altitude_km"])
            inc_diff = abs(foreign["inclination_deg"] - target["inclination_deg"])
            if alt_diff < 30 and inc_diff < 5:
                pattern = "co-orbital"
            elif inc_diff > 40:
                pattern = "direct"
            elif alt_diff > 100:
                pattern = "drift"
            else:
                pattern = "sun-hiding" if random.random() > 0.7 else "co-orbital"

            tca_min = int(5 + random.random() * 175)
            approach_vel = round(0.1 + random.random() * 2.5, 2)

            threats.append({
                "id": f"prox-{len(threats) + 1}",
                "foreignSatId": foreign["id"],
                "foreignSatName": foreign["name"],
                "targetAssetId": target["id"],
                "targetAssetName": target["name"],
                "severity": severity,
                "missDistanceKm": round(miss_km, 2),
                "approachVelocityKms": approach_vel,
                "tcaTime": now_ms + tca_min * 60 * 1000,
                "tcaInMinutes": tca_min,
                "primaryPosition": {"lat": ft["lat"], "lon": ft["lon"], "altKm": foreign["altitude_km"]},
                "secondaryPosition": {"lat": tt["lat"], "lon": tt["lon"], "altKm": target["altitude_km"]},
                "approachPattern": pattern,
                "sunHidingDetected": pattern == "sun-hiding",
                "confidence": round(posterior, 2),
            })

    # --- Inject SJ-26 → USA-245 proximity threat (phases 1-3) ---
    if phase >= 1:
        # Remove any naturally-generated SJ-26 pair
        threats = [
            t for t in threats
            if scenario.SJ26_SAT_ID not in (t.get("foreignSatId"), t.get("targetAssetId"))
        ]
        miss_km = scenario.sj26_miss_distance_km()
        p = scenario.phase_progress()
        if phase == 1:
            severity = "watched"
            pattern = "drift"
            approach_vel = round(0.3 + p * 0.5, 2)
            sun_hiding = False
        elif phase == 2:
            severity = "threatened" if miss_km < 10 else "watched"
            pattern = "co-orbital"
            approach_vel = round(0.8 + p * 0.7, 2)
            sun_hiding = False
        else:
            severity = "threatened"
            pattern = "co-orbital"
            approach_vel = round(1.5 + p * 0.5, 2)
            sun_hiding = True

        # Get positions from satellite data
        sats = _get_satellites()
        sj26_pos = {"lat": 0.0, "lon": 0.0, "altKm": scenario.sj26_altitude_km()}
        target_pos = {"lat": 0.0, "lon": 0.0, "altKm": scenario.TARGET_ALT_KM}
        for s in sats:
            if s["id"] == scenario.SJ26_SAT_ID and s["trajectory"]:
                tp = s["trajectory"][0]
                sj26_pos = {"lat": tp["lat"], "lon": tp["lon"], "altKm": s["altitude_km"]}
            elif s["id"] == scenario.TARGET_SAT_ID and s["trajectory"]:
                tp = s["trajectory"][0]
                target_pos = {"lat": tp["lat"], "lon": tp["lon"], "altKm": s["altitude_km"]}

        tca_min = max(1, int(20 - phase * 5))
        posterior = score_satellite(miss_km, "CIS")

        threats.append({
            "id": "prox-sj26",
            "foreignSatId": scenario.SJ26_SAT_ID,
            "foreignSatName": "SJ-26 (SHIJIAN-26)",
            "targetAssetId": scenario.TARGET_SAT_ID,
            "targetAssetName": "USA-245 (NROL-65)",
            "severity": severity,
            "missDistanceKm": round(miss_km, 2),
            "approachVelocityKms": approach_vel,
            "tcaTime": now_ms + tca_min * 60 * 1000,
            "tcaInMinutes": tca_min,
            "primaryPosition": sj26_pos,
            "secondaryPosition": target_pos,
            "approachPattern": pattern,
            "sunHidingDetected": sun_hiding,
            "confidence": round(max(posterior, 0.6 + phase * 0.1), 2),
        })

    severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
    threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), t["tcaInMinutes"]))

    _prox_cache = threats[:15]
    _prox_phase = phase
    _prox_cache_time = now
    return _prox_cache


@router.get("/threats/signal")
async def get_signal_threats():
    """SignalThreat[] — communication link interception risks."""
    global _sig_cache, _sig_cache_time, _sig_phase
    now = time.time()
    phase = scenario.current_phase()
    if _sig_cache and (now - _sig_cache_time) < CACHE_TTL and _sig_phase == phase:
        return _sig_cache

    sats = _get_satellites()
    adversarial, allied = _get_adversarial_and_allied(sats)
    now_ms = int(now * 1000)
    threats = []

    ground_stations = [
        "Pine Gap (AUS)", "Menwith Hill (UK)", "Buckley AFB (USA)",
        "Misawa (JPN)", "Bad Aibling (DEU)", "Waihopai (NZL)"
    ]

    for foreign in adversarial[:8]:
        for target in allied[:6]:
            # Only generate signal threats for satellites in similar orbital planes
            inc_diff = abs(foreign["inclination_deg"] - target["inclination_deg"])
            if inc_diff > 25:
                continue

            # Signal path geometry
            path_angle = round(5 + random.random() * 85, 1)
            intercept_prob = round(max(0, 0.6 - path_angle / 100 + random.random() * 0.2), 2)

            if intercept_prob < 0.05:
                continue

            if intercept_prob > 0.4:
                severity = "threatened"
            elif intercept_prob > 0.15:
                severity = "watched"
            else:
                severity = "nominal"

            total_windows = int(4 + random.random() * 12)
            windows_at_risk = max(1, int(total_windows * intercept_prob))
            tca_min = int(10 + random.random() * 120)

            ft = foreign["trajectory"][0] if foreign["trajectory"] else {"lat": 0, "lon": 0}

            threats.append({
                "id": f"sig-{len(threats) + 1}",
                "interceptorId": foreign["id"],
                "interceptorName": foreign["name"],
                "targetLinkAssetId": target["id"],
                "targetLinkAssetName": target["name"],
                "groundStationName": random.choice(ground_stations),
                "severity": severity,
                "interceptionProbability": intercept_prob,
                "signalPathAngleDeg": path_angle,
                "commWindowsAtRisk": windows_at_risk,
                "totalCommWindows": total_windows,
                "tcaTime": now_ms + tca_min * 60 * 1000,
                "tcaInMinutes": tca_min,
                "position": {"lat": ft["lat"], "lon": ft["lon"], "altKm": foreign["altitude_km"]},
                "confidence": round(0.5 + random.random() * 0.45, 2),
            })

    # --- Inject SJ-26 signal threat targeting USA-245 downlink (phases 2-3) ---
    if phase >= 2:
        threats = [
            t for t in threats
            if scenario.SJ26_SAT_ID not in (t.get("interceptorId"), t.get("targetLinkAssetId"))
        ]
        p = scenario.phase_progress()
        if phase == 2:
            intercept_prob = round(0.25 + p * 0.3, 2)
            severity = "watched" if intercept_prob < 0.4 else "threatened"
        else:
            intercept_prob = round(0.6 + p * 0.3, 2)
            severity = "threatened"

        sats = _get_satellites()
        sj26_pos = {"lat": 0.0, "lon": 0.0, "altKm": scenario.sj26_altitude_km()}
        for s in sats:
            if s["id"] == scenario.SJ26_SAT_ID and s["trajectory"]:
                tp = s["trajectory"][0]
                sj26_pos = {"lat": tp["lat"], "lon": tp["lon"], "altKm": s["altitude_km"]}
                break

        threats.append({
            "id": "sig-sj26",
            "interceptorId": scenario.SJ26_SAT_ID,
            "interceptorName": "SJ-26 (SHIJIAN-26)",
            "targetLinkAssetId": scenario.TARGET_SAT_ID,
            "targetLinkAssetName": "USA-245 (NROL-65)",
            "groundStationName": "Pine Gap (AUS)",
            "severity": severity,
            "interceptionProbability": intercept_prob,
            "signalPathAngleDeg": round(12.0 - phase * 3.0, 1),
            "commWindowsAtRisk": 3 + phase,
            "totalCommWindows": 8,
            "tcaTime": now_ms + 10 * 60 * 1000,
            "tcaInMinutes": 10,
            "position": sj26_pos,
            "confidence": round(0.65 + phase * 0.1, 2),
        })

    severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
    threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), t["tcaInMinutes"]))

    _sig_cache = threats[:10]
    _sig_phase = phase
    _sig_cache_time = now
    return _sig_cache


@router.get("/threats/anomaly")
async def get_anomaly_threats():
    """AnomalyThreat[] — satellites exhibiting anomalous behavior."""
    global _anom_cache, _anom_cache_time, _anom_phase
    now = time.time()
    phase = scenario.current_phase()
    if _anom_cache and (now - _anom_cache_time) < CACHE_TTL and _anom_phase == phase:
        return _anom_cache

    sats = _get_satellites()
    now_ms = int(now * 1000)
    threats = []

    anomaly_types = [
        "unexpected-maneuver", "orientation-change", "pointing-change",
        "orbit-raise", "orbit-lower", "rf-emission"
    ]

    # Only watched satellites exhibit anomalies (adversarial behavior)
    watched = [s for s in sats if s["status"] == "watched"]

    for sat in watched:
        # Not every watched sat has an anomaly
        if random.random() > 0.4:
            continue

        anomaly_type = random.choice(anomaly_types)
        deviation = round(0.15 + random.random() * 0.85, 2)

        if deviation > 0.7:
            severity = "threatened"
        elif deviation > 0.4:
            severity = "watched"
        else:
            severity = "nominal"

        # Description based on anomaly type
        descriptions = {
            "unexpected-maneuver": f"{sat['name']} executed an unscheduled orbit-change burn. Delta-V {round(random.random() * 3, 1)} m/s detected. Trajectory now intersects with allied asset orbital shell.",
            "orientation-change": f"{sat['name']} rotated 90° off nominal sun-pointing attitude. Possible sensor or antenna reorientation toward nearby allied satellite.",
            "pointing-change": f"{sat['name']} slewed primary payload antenna {round(15 + random.random() * 60)}° from nominal. New boresight direction aligns with allied ground station uplink.",
            "orbit-raise": f"{sat['name']} raised perigee by {round(1 + random.random() * 20, 1)} km. New orbit brings it closer to allied asset constellation at similar inclination.",
            "orbit-lower": f"{sat['name']} lowered apogee by {round(2 + random.random() * 30, 1)} km. Deorbit or rendezvous maneuver — could be approaching a lower-altitude target.",
            "rf-emission": f"{sat['name']} began transmitting on non-standard frequency bands. Signal characteristics inconsistent with declared mission profile.",
        }

        detected_min_ago = int(5 + random.random() * 180)
        ft = sat["trajectory"][0] if sat["trajectory"] else {"lat": 0, "lon": 0}

        threats.append({
            "id": f"anom-{len(threats) + 1}",
            "satelliteId": sat["id"],
            "satelliteName": sat["name"],
            "severity": severity,
            "anomalyType": anomaly_type,
            "baselineDeviation": deviation,
            "description": descriptions[anomaly_type],
            "detectedAt": now_ms - detected_min_ago * 60 * 1000,
            "confidence": round(0.5 + random.random() * 0.45, 2),
            "position": {"lat": ft["lat"], "lon": ft["lon"], "altKm": sat["altitude_km"]},
        })

    # --- Inject deterministic SJ-26 anomalies (phases 1-3) ---
    if phase >= 1:
        threats = [t for t in threats if t.get("satelliteId") != scenario.SJ26_SAT_ID]

        sats_list = _get_satellites()
        sj26_pos = {"lat": 0.0, "lon": 0.0, "altKm": scenario.sj26_altitude_km()}
        for s in sats_list:
            if s["id"] == scenario.SJ26_SAT_ID and s["trajectory"]:
                tp = s["trajectory"][0]
                sj26_pos = {"lat": tp["lat"], "lon": tp["lon"], "altKm": s["altitude_km"]}
                break

        # Phase 1: unexpected maneuver
        threats.append({
            "id": "anom-sj26-maneuver",
            "satelliteId": scenario.SJ26_SAT_ID,
            "satelliteName": "SJ-26 (SHIJIAN-26)",
            "severity": "watched" if phase == 1 else "threatened",
            "anomalyType": "unexpected-maneuver",
            "baselineDeviation": round(0.4 + phase * 0.2, 2),
            "description": (
                "SJ-26 executed an unscheduled inclination-change burn. "
                "Delta-V 1.8 m/s detected. New orbital plane converging toward USA-245."
            ),
            "detectedAt": now_ms - int(scenario.elapsed() * 1000) + 90 * 1000,
            "confidence": round(0.7 + phase * 0.08, 2),
            "position": sj26_pos,
        })

        # Phase 2+: RF emission
        if phase >= 2:
            threats.append({
                "id": "anom-sj26-rf",
                "satelliteId": scenario.SJ26_SAT_ID,
                "satelliteName": "SJ-26 (SHIJIAN-26)",
                "severity": "threatened",
                "anomalyType": "rf-emission",
                "baselineDeviation": round(0.6 + phase * 0.15, 2),
                "description": (
                    "SJ-26 began transmitting on non-standard S-band frequencies. "
                    "Signal characteristics match known Chinese military SATCOM protocols, "
                    "inconsistent with declared earth-observation mission."
                ),
                "detectedAt": now_ms - int((scenario.elapsed() - 180) * 1000),
                "confidence": round(0.75 + phase * 0.07, 2),
                "position": sj26_pos,
            })

        # Phase 3: orientation change (grappling arm)
        if phase >= 3:
            threats.append({
                "id": "anom-sj26-grapple",
                "satelliteId": scenario.SJ26_SAT_ID,
                "satelliteName": "SJ-26 (SHIJIAN-26)",
                "severity": "threatened",
                "anomalyType": "orientation-change",
                "baselineDeviation": 0.95,
                "description": (
                    "SJ-26 rotated 120° off nominal attitude. Infrared signature "
                    "consistent with deployment of articulated robotic arm — matches "
                    "SJ-21 grappling mechanism profile. Arm oriented toward USA-245."
                ),
                "detectedAt": now_ms - int((scenario.elapsed() - 300) * 1000),
                "confidence": 0.92,
                "position": sj26_pos,
            })

    severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
    threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), -t["baselineDeviation"]))

    _anom_cache = threats[:10]
    _anom_phase = phase
    _anom_cache_time = now
    return _anom_cache


@router.get("/threats/orbital-similarity")
async def get_orbital_similarity_threats():
    """OrbitalSimilarityThreat[] — foreign sats with suspiciously similar orbits to allied assets."""
    global _osim_cache, _osim_cache_time, _osim_phase
    now = time.time()
    phase = scenario.current_phase()
    if _osim_cache and (now - _osim_cache_time) < CACHE_TTL and _osim_phase == phase:
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

            # Skip pairs whose orbits are completely different — not operationally relevant
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

    # --- Inject SJ-26 scenario threat (phases 1-3) ---
    # SJ-26 is performing inclination burns converging toward USA-245's orbital plane
    if phase >= 1:
        threats = [
            t for t in threats
            if scenario.SJ26_SAT_ID not in (t.get("foreignSatId"), t.get("targetAssetId"))
        ]

        sj26_alt = scenario.sj26_altitude_km()
        sj26_inc = scenario.TARGET_INC_DEG + scenario.sj26_inclination_offset()
        target_alt = scenario.TARGET_ALT_KM
        target_inc = scenario.TARGET_INC_DEG

        div, posterior = score_orbital_similarity(
            sj26_alt, sj26_inc, target_alt, target_inc, "PRC"
        )

        d_alt = abs(sj26_alt - target_alt)
        d_inc = abs(sj26_inc - target_inc)

        if d_inc < 2 and d_alt < 20:
            pattern = "co-planar"
        elif d_alt < 30:
            pattern = "co-altitude"
        elif d_inc < 5:
            pattern = "co-inclination"
        else:
            pattern = "shadowing"

        severity = "watched" if phase == 1 else "threatened"
        confidence_floor = 0.5 + phase * 0.15

        sats_list = _get_satellites()
        sj26_pos = {"lat": 0.0, "lon": 0.0, "altKm": sj26_alt}
        for s in sats_list:
            if s["id"] == scenario.SJ26_SAT_ID and s["trajectory"]:
                tp = s["trajectory"][0]
                sj26_pos = {"lat": tp["lat"], "lon": tp["lon"], "altKm": s["altitude_km"]}
                break

        threats.append({
            "id": "osim-sj26",
            "foreignSatId": scenario.SJ26_SAT_ID,
            "foreignSatName": "SJ-26 (SHIJIAN-26)",
            "targetAssetId": scenario.TARGET_SAT_ID,
            "targetAssetName": "USA-245 (NROL-65)",
            "severity": severity,
            "inclinationDiffDeg": round(d_inc, 2),
            "altitudeDiffKm": round(d_alt, 1),
            "divergenceScore": round(div, 4),
            "pattern": pattern,
            "confidence": round(max(posterior, confidence_floor), 3),
            "position": sj26_pos,
        })

    severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
    threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), t["divergenceScore"]))

    _osim_cache = threats[:15]
    _osim_phase = phase
    _osim_cache_time = now
    return _osim_cache

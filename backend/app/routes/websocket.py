"""WebSocket endpoints — agent pipeline updates + scenario tick stream."""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import math
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models import SatelliteData, WSMessage, WSMessageType
from app.agents.pipeline import run_pipeline
from app import scenario
from app.bayesian_scorer import score_satellite, set_prior_adversarial

logger = logging.getLogger(__name__)

router = APIRouter()

# Pending analyses from HTTP endpoint (analysis_id -> satellites)
pending_analyses: dict[str, list[SatelliteData]] = {}

# Active WebSocket connections
active_connections: list[WebSocket] = []


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    active_connections.append(ws)
    logger.info("WebSocket client connected (%d total)", len(active_connections))

    try:
        while True:
            # Wait for client messages
            data = await ws.receive_text()
            message = json.loads(data)

            if message.get("type") == "analyze":
                # Client sends satellite data directly over WS
                satellites_raw = message.get("satellites", [])
                satellites = [SatelliteData(**s) for s in satellites_raw]

                if not satellites:
                    await ws.send_json(
                        WSMessage(type=WSMessageType.ERROR, data="No satellite data provided").model_dump()
                    )
                    continue

                logger.info("WS analyze request: %d satellites", len(satellites))

                # Run pipeline, streaming updates back to this client
                async def ws_callback(msg: dict):
                    try:
                        await ws.send_json(msg)
                    except Exception:
                        logger.warning("Failed to send WS message")

                try:
                    await run_pipeline(satellites, ws_callback)
                except Exception as exc:
                    logger.exception("Pipeline failed")
                    await ws.send_json(
                        WSMessage(type=WSMessageType.ERROR, data=str(exc)).model_dump()
                    )

            elif message.get("type") == "analyze_by_id":
                # Client references a pending analysis from HTTP endpoint
                analysis_id = message.get("analysis_id")
                satellites = pending_analyses.pop(analysis_id, None)

                if not satellites:
                    await ws.send_json(
                        WSMessage(type=WSMessageType.ERROR, data=f"No pending analysis: {analysis_id}").model_dump()
                    )
                    continue

                async def ws_callback(msg: dict):
                    try:
                        await ws.send_json(msg)
                    except Exception:
                        logger.warning("Failed to send WS message")

                try:
                    await run_pipeline(satellites, ws_callback)
                except Exception as exc:
                    logger.exception("Pipeline failed")
                    await ws.send_json(
                        WSMessage(type=WSMessageType.ERROR, data=str(exc)).model_dump()
                    )

            elif message.get("type") == "ping":
                await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as exc:
        logger.exception("WebSocket error")
    finally:
        if ws in active_connections:
            active_connections.remove(ws)


# ──────────────────────────────────────────────────────────────────────
# Scenario tick WebSocket — pushes fresh SJ-26 threats every tick
# ──────────────────────────────────────────────────────────────────────

# Golden ratio for well-distributed phase offsets
_PHI = 0.6180339887498949


def _wobble_threats(threats: list[dict], elapsed: float) -> list[dict]:
    """Apply smooth time-based drift to ALL threat values so scores evolve every tick.

    Each threat gets a unique oscillation phase (from its ID hash) so they
    don't move in lockstep.  Two overlapping sine waves (different periods)
    create organic-looking variation.
    SJ-26 threats are skipped (they already have fresh per-tick values).
    """
    out = []
    for t in threats:
        tid = t.get("id", "")
        if "sj26" in tid:
            out.append(t)
            continue

        t = copy.copy(t)  # shallow copy so we don't mutate the cached originals
        seed = hash(tid) & 0xFFFF
        p1 = (seed * _PHI) % (2 * math.pi)
        p2 = ((seed * 31) * _PHI) % (2 * math.pi)
        # Two sine waves at different periods for organic drift
        w = (math.sin(2 * math.pi * elapsed / 30.0 + p1) * 0.10
             + math.sin(2 * math.pi * elapsed / 13.0 + p2) * 0.07)

        if "confidence" in t:
            t["confidence"] = round(max(0.01, min(0.99, t["confidence"] + w)), 2)
        if "baselineDeviation" in t:
            t["baselineDeviation"] = round(max(0.10, min(0.99, t["baselineDeviation"] + w)), 2)
        if "missDistanceKm" in t:
            t["missDistanceKm"] = round(max(0.05, t["missDistanceKm"] * (1 + w)), 2)
        if "interceptionProbability" in t:
            t["interceptionProbability"] = round(max(0.01, min(0.99, t["interceptionProbability"] + w)), 2)
        out.append(t)
    return out


def _sj26_proximity(phase: int, progress: float, now_ms: int) -> dict | None:
    if phase < 1:
        return None
    miss_km = scenario.sj26_miss_distance_km()
    # Continuous phase+progress value for smooth interpolation (1.0 → 3.99)
    t = phase + progress
    if phase == 1:
        sev, pat, vel, sun = "watched", "drift", round(0.3 + progress * 0.5, 2), False
    elif phase == 2:
        sev = "threatened" if miss_km < 10 else "watched"
        pat, vel, sun = "co-orbital", round(0.8 + progress * 0.7, 2), False
    else:
        sev, pat, vel, sun = "threatened", "co-orbital", round(1.5 + progress * 0.5, 2), True
    posterior = score_satellite(miss_km, "CIS")
    tca_min = max(1, int(20 - phase * 5))
    # Confidence ramps smoothly with phase+progress (0.70 → 0.92)
    conf = round(max(posterior, 0.55 + t * 0.12), 2)
    return {
        "id": "prox-sj26",
        "foreignSatId": scenario.SJ26_SAT_ID,
        "foreignSatName": "SJ-26 (SHIJIAN-26)",
        "targetAssetId": scenario.TARGET_SAT_ID,
        "targetAssetName": "USA-245 (NROL-65)",
        "severity": sev,
        "missDistanceKm": round(miss_km, 2),
        "approachVelocityKms": vel,
        "tcaTime": now_ms + tca_min * 60_000,
        "tcaInMinutes": tca_min,
        "primaryPosition": {"lat": 0, "lon": 0, "altKm": scenario.sj26_altitude_km()},
        "secondaryPosition": {"lat": 0, "lon": 0, "altKm": scenario.TARGET_ALT_KM},
        "approachPattern": pat,
        "sunHidingDetected": sun,
        "confidence": conf,
    }


def _sj26_signal(phase: int, progress: float, now_ms: int) -> dict | None:
    if phase < 2:
        return None
    # Continuous ramp: phase 2 progress 0→1 maps to prob 0.25→0.55
    #                  phase 3 progress 0→1 maps to prob 0.60→0.90
    if phase == 2:
        prob = round(0.25 + progress * 0.30, 2)
        sev = "watched" if prob < 0.4 else "threatened"
    else:
        prob = round(0.60 + progress * 0.30, 2)
        sev = "threatened"
    return {
        "id": "sig-sj26",
        "interceptorId": scenario.SJ26_SAT_ID,
        "interceptorName": "SJ-26 (SHIJIAN-26)",
        "targetLinkAssetId": scenario.TARGET_SAT_ID,
        "targetLinkAssetName": "USA-245 (NROL-65)",
        "groundStationName": "Pine Gap (AUS)",
        "severity": sev,
        "interceptionProbability": prob,
        "signalPathAngleDeg": round(12.0 - phase * 3.0, 1),
        "commWindowsAtRisk": 3 + phase,
        "totalCommWindows": 8,
        "tcaTime": now_ms + 600_000,
        "tcaInMinutes": 10,
        "position": {"lat": 0, "lon": 0, "altKm": scenario.sj26_altitude_km()},
        "confidence": round(0.65 + phase * 0.1, 2),
    }


def _sj26_anomalies(phase: int, progress: float, now_ms: int) -> list[dict]:
    if phase < 1:
        return []
    el = scenario.elapsed()
    pos = {"lat": 0, "lon": 0, "altKm": scenario.sj26_altitude_km()}
    t = phase + progress  # continuous 1.0 → 3.99
    items = []
    # Maneuver (phase 1+) — deviation & confidence ramp with progress
    items.append({
        "id": "anom-sj26-maneuver",
        "satelliteId": scenario.SJ26_SAT_ID,
        "satelliteName": "SJ-26 (SHIJIAN-26)",
        "severity": "watched" if phase == 1 else "threatened",
        "anomalyType": "unexpected-maneuver",
        "baselineDeviation": round(0.3 + t * 0.18, 2),   # 0.48 → 0.84
        "description": "SJ-26 executed an unscheduled inclination-change burn. Delta-V 1.8 m/s. New plane converging toward USA-245.",
        "detectedAt": now_ms - int(el * 1000) + 90_000,
        "confidence": round(0.6 + t * 0.10, 2),           # 0.70 → 0.99
        "position": pos,
    })
    # RF emission (phase 2+)
    if phase >= 2:
        t2 = phase + progress  # 2.0 → 3.99
        items.append({
            "id": "anom-sj26-rf",
            "satelliteId": scenario.SJ26_SAT_ID,
            "satelliteName": "SJ-26 (SHIJIAN-26)",
            "severity": "threatened",
            "anomalyType": "rf-emission",
            "baselineDeviation": round(0.4 + t2 * 0.15, 2),  # 0.70 → 0.99
            "description": "SJ-26 transmitting on non-standard S-band. Matches Chinese military SATCOM protocols.",
            "detectedAt": now_ms - int((el - 180) * 1000),
            "confidence": round(0.6 + t2 * 0.10, 2),          # 0.80 → 0.99
            "position": pos,
        })
    # Grappling (phase 3)
    if phase >= 3:
        items.append({
            "id": "anom-sj26-grapple",
            "satelliteId": scenario.SJ26_SAT_ID,
            "satelliteName": "SJ-26 (SHIJIAN-26)",
            "severity": "threatened",
            "anomalyType": "orientation-change",
            "baselineDeviation": round(0.90 + progress * 0.09, 2),  # 0.90 → 0.99
            "description": "SJ-26 rotated 120° off nominal. IR signature consistent with grappling arm deployment.",
            "detectedAt": now_ms - int((el - 300) * 1000),
            "confidence": round(0.88 + progress * 0.10, 2),         # 0.88 → 0.98
            "position": pos,
        })
    return items


def _sj26_conjunction(phase: int, now_ms: int) -> dict | None:
    if phase < 2:
        return None
    miss_km = scenario.sj26_miss_distance_km()
    sev = "threatened" if miss_km < 10 else "watched"
    tca_min = max(1, int(15 - phase * 4))
    return {
        "id": "threat-sj26",
        "primaryId": scenario.TARGET_SAT_ID,
        "secondaryId": scenario.SJ26_SAT_ID,
        "primaryName": "USA-245 (NROL-65)",
        "secondaryName": "SJ-26 (SHIJIAN-26)",
        "severity": sev,
        "missDistanceKm": round(miss_km, 2),
        "tcaTime": now_ms + tca_min * 60_000,
        "tcaInMinutes": tca_min,
        "primaryPosition": {"lat": 0, "lon": 0, "altKm": scenario.TARGET_ALT_KM},
        "secondaryPosition": {"lat": 0, "lon": 0, "altKm": scenario.sj26_altitude_km()},
        "intentClassification": "Possible hostile approach" if phase == 2 else "Confirmed hostile — grappling deployment",
        "confidence": round(0.7 + phase * 0.1, 2),
    }


def _build_tick() -> dict:
    """Build a single scenario tick with fresh SJ-26 data (no caching)."""
    phase = scenario.current_phase()
    progress = scenario.phase_progress()
    now_ms = int(time.time() * 1000)

    tick: dict = {
        "type": "scenario_tick",
        "phase": phase,
        "phaseProgress": round(progress, 3),
        "elapsed": round(scenario.elapsed(), 1),
        "sj26": {
            "status": scenario.sj26_status(),
            "altitudeKm": round(scenario.sj26_altitude_km(), 1),
            "missDistanceKm": round(scenario.sj26_miss_distance_km(), 2),
        },
        "proximityThreats": [],
        "signalThreats": [],
        "anomalyThreats": [],
        "threats": [],
    }

    prox = _sj26_proximity(phase, progress, now_ms)
    if prox:
        tick["proximityThreats"].append(prox)
    sig = _sj26_signal(phase, progress, now_ms)
    if sig:
        tick["signalThreats"].append(sig)
    tick["anomalyThreats"] = _sj26_anomalies(phase, progress, now_ms)
    conj = _sj26_conjunction(phase, now_ms)
    if conj:
        tick["threats"].append(conj)

    return tick


@router.websocket("/ws/scenario")
async def scenario_tick_ws(ws: WebSocket):
    """Push fresh scenario state every tick. Speed-aware tick rate.

    Client sends: {"speed": 10} to update sim speed.
    Server sends: scenario_tick messages at max(0.1s, 1/speed).
    """
    await ws.accept()
    logger.info("Scenario WS client connected")

    send_task: asyncio.Task | None = None

    async def sender():
        from app.routes.threats import (
            get_proximity_threats,
            get_signal_threats,
            get_anomaly_threats,
        )
        from app.routes.data import get_threats as get_conjunctions

        SJ26_PROX = {"prox-sj26"}
        SJ26_SIG = {"sig-sj26"}
        SJ26_ANOM = {"anom-sj26-maneuver", "anom-sj26-rf", "anom-sj26-grapple"}
        SJ26_CONJ = {"threat-sj26"}

        try:
            tick_count = 0
            while True:
                # Fresh SJ-26 data (no caching)
                sj_tick = _build_tick()

                # General threats from cached endpoints
                gen_prox = await get_proximity_threats()
                gen_sig = await get_signal_threats()
                gen_anom = await get_anomaly_threats()
                gen_conj = await get_conjunctions()

                # Apply time-based wobble to general threats so ALL scores evolve
                el = sj_tick["elapsed"]
                gen_prox = _wobble_threats(gen_prox, el)
                gen_sig = _wobble_threats(gen_sig, el)
                gen_anom = _wobble_threats(gen_anom, el)
                gen_conj = _wobble_threats(gen_conj, el)

                # Merge: wobbled general (strip SJ-26 dupes) + fresh SJ-26
                sj_tick["proximityThreats"] = (
                    [t for t in gen_prox if t["id"] not in SJ26_PROX]
                    + sj_tick["proximityThreats"]
                )
                sj_tick["signalThreats"] = (
                    [t for t in gen_sig if t["id"] not in SJ26_SIG]
                    + sj_tick["signalThreats"]
                )
                sj_tick["anomalyThreats"] = (
                    [t for t in gen_anom if t["id"] not in SJ26_ANOM]
                    + sj_tick["anomalyThreats"]
                )
                sj_tick["threats"] = (
                    [t for t in gen_conj if t["id"] not in SJ26_CONJ]
                    + sj_tick["threats"]
                )

                await ws.send_json(sj_tick)
                tick_count += 1
                if tick_count % 10 == 1:
                    sj = sj_tick["sj26"]
                    logger.info(
                        "Scenario tick #%d: phase=%d prog=%.2f elapsed=%.1fs | "
                        "SJ-26 status=%s miss=%.1fkm | "
                        "total threats: prox=%d sig=%d anom=%d conj=%d",
                        tick_count, sj_tick["phase"], sj_tick["phaseProgress"],
                        sj_tick["elapsed"], sj["status"], sj["missDistanceKm"],
                        len(sj_tick["proximityThreats"]),
                        len(sj_tick["signalThreats"]),
                        len(sj_tick["anomalyThreats"]),
                        len(sj_tick["threats"]),
                    )
                interval = max(0.1, 1.0 / scenario.get_speed())
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            pass

    send_task = asyncio.create_task(sender())

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                if "speed" in msg:
                    new_speed = float(msg["speed"])
                    scenario.set_speed(new_speed)
                    logger.info("Scenario WS: speed set to %.1fx", new_speed)
                if "prior_adversarial" in msg:
                    new_prior = float(msg["prior_adversarial"])
                    set_prior_adversarial(new_prior)
                    from app.routes.threats import reset_caches
                    reset_caches()
                    logger.info("Scenario WS: prior_adversarial set to %.4f", new_prior)
            except (json.JSONDecodeError, ValueError):
                pass
    except WebSocketDisconnect:
        logger.info("Scenario WS client disconnected")
    except Exception as exc:
        logger.exception("Scenario WS error: %s", exc)
    finally:
        if send_task:
            send_task.cancel()

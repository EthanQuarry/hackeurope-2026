"""SJ-26 evolving threat scenario engine.

Tracks elapsed time since module import and drives a 4-phase "slow burn"
adversary scenario where SJ-26 (SHIJIAN-26) gradually reveals hostile intent
toward USA-245 (NRO KH-11 recon satellite).

Phase 0 (0-90s):   Friendly — benign earth-observation cover
Phase 1 (90-180s): Watched  — first orbital maneuver, inclination converging
Phase 2 (180-300s): Watched→Threatened — multiple anomalies, proximity alerts
Phase 3 (300s+):   Threatened — close approach, grappling mechanism detected
"""

from __future__ import annotations

import time

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SJ26_CATALOG_ID = 25
SJ26_SAT_ID = "sat-25"
SJ26_NORAD_ID = 99910

TARGET_CATALOG_ID = 6
TARGET_SAT_ID = "sat-6"

# USA-245 fixed orbit
TARGET_ALT_KM = 500.0
TARGET_INC_DEG = 63.4
TARGET_RAAN_DEG = 142.0

# Phase boundaries in seconds
_PHASE_BOUNDS = [0, 90, 180, 300]

# Module-level start time — resets on import / reload
_start_time: float = time.time()


def reset() -> None:
    """Reset the scenario clock (useful for testing)."""
    global _start_time
    _start_time = time.time()


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

def elapsed() -> float:
    """Seconds since scenario start."""
    return time.time() - _start_time


def current_phase() -> int:
    """Current phase 0-3."""
    t = elapsed()
    if t >= _PHASE_BOUNDS[3]:
        return 3
    if t >= _PHASE_BOUNDS[2]:
        return 2
    if t >= _PHASE_BOUNDS[1]:
        return 1
    return 0


def phase_progress() -> float:
    """Progress within the current phase, 0.0 → 1.0."""
    t = elapsed()
    phase = current_phase()
    if phase == 3:
        # Phase 3 is open-ended; clamp at 1.0 after 120s into phase 3
        return min(1.0, (t - _PHASE_BOUNDS[3]) / 120.0)
    start = _PHASE_BOUNDS[phase]
    end = _PHASE_BOUNDS[phase + 1]
    return min(1.0, (t - start) / (end - start))


def _lerp(a: float, b: float, t: float) -> float:
    """Linear interpolation."""
    return a + (b - a) * t


def _smoothstep(t: float) -> float:
    """Smooth Hermite interpolation for natural-looking transitions."""
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------
# SJ-26 orbital parameters (smooth interpolation per phase)
# ---------------------------------------------------------------------------

def sj26_status() -> str:
    """Dashboard status string for SJ-26."""
    phase = current_phase()
    if phase == 0:
        return "friendly"
    if phase == 1:
        return "watched"
    if phase == 2:
        p = phase_progress()
        return "threatened" if p > 0.6 else "watched"
    return "threatened"


def sj26_altitude_km() -> float:
    """SJ-26 altitude — converges toward USA-245's 500km."""
    phase = current_phase()
    p = _smoothstep(phase_progress())
    if phase == 0:
        return _lerp(520.0, 518.0, p)      # Benign, slightly different altitude
    if phase == 1:
        return _lerp(518.0, 510.0, p)      # Starting to close
    if phase == 2:
        return _lerp(510.0, 502.0, p)      # Nearly matched
    # Phase 3: extremely close approach
    return _lerp(502.0, 500.1, p)


def sj26_inclination_offset() -> float:
    """Inclination offset from USA-245's plane (degrees). Converges to 0."""
    phase = current_phase()
    p = _smoothstep(phase_progress())
    if phase == 0:
        return _lerp(8.0, 7.5, p)          # Different orbital plane
    if phase == 1:
        return _lerp(7.5, 3.0, p)          # First correction burn
    if phase == 2:
        return _lerp(3.0, 0.5, p)          # Plane change nearly complete
    return _lerp(0.5, 0.02, p)             # Co-planar


def sj26_raan_offset() -> float:
    """RAAN offset from USA-245 (degrees). Converges to 0."""
    phase = current_phase()
    p = _smoothstep(phase_progress())
    if phase == 0:
        return _lerp(25.0, 23.0, p)        # Different RAAN
    if phase == 1:
        return _lerp(23.0, 10.0, p)        # Drifting closer
    if phase == 2:
        return _lerp(10.0, 2.0, p)         # Nearly aligned
    return _lerp(2.0, 0.1, p)              # Virtually co-orbital


def sj26_miss_distance_km() -> float:
    """Projected miss distance to USA-245."""
    phase = current_phase()
    p = _smoothstep(phase_progress())
    if phase == 0:
        return _lerp(1200.0, 1000.0, p)
    if phase == 1:
        return _lerp(800.0, 200.0, p)
    if phase == 2:
        return _lerp(200.0, 5.0, p)
    return _lerp(5.0, 0.3, p)


# ---------------------------------------------------------------------------
# Dynamic catalog entry
# ---------------------------------------------------------------------------

def sj26_catalog_entry() -> dict:
    """Returns an evolving mock_data dict for SJ-26 with phase-appropriate fields."""
    phase = current_phase()

    base = {
        "norad_id": SJ26_NORAD_ID,
        "name": "SJ-26 (SHIJIAN-26)",
        "nation": "China",
        "owner": "CNSA",
        "orbit_type": "LEO",
        "launch_year": 2025,
    }

    if phase == 0:
        base["purpose"] = "Earth observation and atmospheric research"
        base["suspicious"] = False
    elif phase == 1:
        base["purpose"] = "Earth observation — recent orbital maneuver under review"
        base["suspicious"] = True
        base["threat_notes"] = (
            "Unexpected inclination-change maneuver detected. New orbital plane "
            "converging toward USA-245 (NRO reconnaissance). Monitoring."
        )
    elif phase == 2:
        base["purpose"] = "Officially 'earth observation' — assessed as dual-use proximity operations platform"
        base["suspicious"] = True
        base["threat_notes"] = (
            "Multiple maneuvers detected. RF emissions on non-standard frequencies. "
            "Trajectory clearly converging toward USA-245. Matches SJ-21 grappling "
            "program profile. Elevated threat."
        )
    else:
        base["purpose"] = "Assessed as successor to SJ-21 orbital grappling program — hostile intent confirmed"
        base["suspicious"] = True
        base["threat_notes"] = (
            "CRITICAL: SJ-26 in close approach (<1km) to USA-245. Grappling mechanism "
            "deployment detected via orientation change. RF jamming of USA-245 downlink "
            "suspected. Immediate defensive action recommended."
        )

    return base

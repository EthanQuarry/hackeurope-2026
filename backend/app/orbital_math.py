"""Orbital mechanics computations — ported from frontend SatelliteSimulation.jsx."""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.models import SatelliteData

EARTH_RADIUS = 2.0  # matches frontend constant

# Thresholds (in simulation units)
COLLISION_DISTANCE_THRESHOLD = 0.4   # close approach warning
CRITICAL_DISTANCE_THRESHOLD = 0.15   # collision risk
HIGH_ECCENTRICITY_THRESHOLD = 0.06   # suspicious for LEO
LEO_MAX_ALTITUDE = 2.3 + EARTH_RADIUS  # LEO ceiling in sim units


def orbital_position(a: float, inc: float, raan: float, e: float, anomaly: float) -> tuple[float, float, float]:
    """Compute 3D position from orbital elements. Direct port from frontend JS."""
    r = (a * (1 - e * e)) / (1 + e * math.cos(anomaly))
    xo = r * math.cos(anomaly)
    zo = r * math.sin(anomaly)
    xi = xo
    yi = zo * math.sin(inc)
    zi = zo * math.cos(inc)
    return (
        xi * math.cos(raan) + zi * math.sin(raan),
        yi,
        -xi * math.sin(raan) + zi * math.cos(raan),
    )


def distance(p1: tuple[float, float, float], p2: tuple[float, float, float]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(p1, p2)))


@dataclass
class CloseApproach:
    sat_a_id: int
    sat_b_id: int
    distance: float
    pos_a: tuple[float, float, float]
    pos_b: tuple[float, float, float]


@dataclass
class AnomalyFlag:
    satellite_id: int
    reason: str
    value: float


def compute_positions(satellites: list[SatelliteData]) -> dict[int, tuple[float, float, float]]:
    """Compute current 3D position for each satellite."""
    return {
        sat.id: orbital_position(sat.a, sat.inc, sat.raan, sat.e, sat.anomaly)
        for sat in satellites
    }


def compute_closest_approaches(satellites: list[SatelliteData]) -> list[CloseApproach]:
    """Find all satellite pairs within the collision distance threshold."""
    positions = compute_positions(satellites)
    approaches: list[CloseApproach] = []

    sat_list = list(satellites)
    for i in range(len(sat_list)):
        for j in range(i + 1, len(sat_list)):
            a = sat_list[i]
            b = sat_list[j]
            d = distance(positions[a.id], positions[b.id])
            if d < COLLISION_DISTANCE_THRESHOLD:
                approaches.append(CloseApproach(
                    sat_a_id=a.id,
                    sat_b_id=b.id,
                    distance=d,
                    pos_a=positions[a.id],
                    pos_b=positions[b.id],
                ))

    approaches.sort(key=lambda x: x.distance)
    return approaches


def detect_anomalies(satellites: list[SatelliteData]) -> list[AnomalyFlag]:
    """Flag satellites with unusual orbital characteristics."""
    flags: list[AnomalyFlag] = []

    for sat in satellites:
        # High eccentricity in LEO is unusual (most LEO sats are near-circular)
        if sat.a < LEO_MAX_ALTITUDE and sat.e > HIGH_ECCENTRICITY_THRESHOLD:
            flags.append(AnomalyFlag(
                satellite_id=sat.id,
                reason="high_eccentricity_in_leo",
                value=sat.e,
            ))

        # Very high inclination (near-polar or retrograde) can indicate reconnaissance
        if abs(sat.inc) > math.pi * 0.4:
            flags.append(AnomalyFlag(
                satellite_id=sat.id,
                reason="high_inclination",
                value=sat.inc,
            ))

        # Extremely low altitude (possible decay or deliberate low pass)
        altitude = sat.a - EARTH_RADIUS
        if altitude < 0.5:
            flags.append(AnomalyFlag(
                satellite_id=sat.id,
                reason="very_low_altitude",
                value=altitude,
            ))

    return flags


def format_orbital_summary(satellites: list[SatelliteData]) -> str:
    """Produce a text summary of orbital data for the LLM agents to consume."""
    positions = compute_positions(satellites)
    approaches = compute_closest_approaches(satellites)
    anomalies = detect_anomalies(satellites)

    lines = [f"=== Orbital Analysis: {len(satellites)} satellites ===\n"]

    # Per-satellite summary
    lines.append("--- Satellite Positions ---")
    for sat in satellites:
        pos = positions[sat.id]
        alt = sat.a - EARTH_RADIUS
        orbit_type = "LEO" if alt < 2.3 else ("MEO" if alt < 5 else "GEO")
        name = sat.name or f"SAT-{sat.id}"
        lines.append(
            f"  {name} (ID {sat.id}): alt={alt:.2f} ({orbit_type}), "
            f"ecc={sat.e:.4f}, inc={math.degrees(sat.inc):.1f}°, "
            f"pos=({pos[0]:.2f}, {pos[1]:.2f}, {pos[2]:.2f})"
        )

    # Close approaches
    if approaches:
        lines.append(f"\n--- Close Approaches ({len(approaches)} pairs within {COLLISION_DISTANCE_THRESHOLD} units) ---")
        for ca in approaches[:20]:  # cap for context length
            severity = "CRITICAL" if ca.distance < CRITICAL_DISTANCE_THRESHOLD else "WARNING"
            lines.append(
                f"  [{severity}] SAT {ca.sat_a_id} <-> SAT {ca.sat_b_id}: "
                f"distance={ca.distance:.4f}"
            )
    else:
        lines.append("\n--- No close approaches detected ---")

    # Anomalies
    if anomalies:
        lines.append(f"\n--- Orbital Anomalies ({len(anomalies)} flags) ---")
        for af in anomalies:
            lines.append(f"  SAT {af.satellite_id}: {af.reason} (value={af.value:.4f})")
    else:
        lines.append("\n--- No orbital anomalies detected ---")

    return "\n".join(lines)

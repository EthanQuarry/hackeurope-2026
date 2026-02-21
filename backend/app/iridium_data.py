"""Iridium satellite network reference data — ground stations, IMEI map, routing."""

from __future__ import annotations

import math

from app.models import IridiumGateway, GatewayRouting, SatelliteCommandType


# --- Iridium Ground Station / Gateway Definitions ---

IRIDIUM_GATEWAYS = [
    IridiumGateway(
        name="SNOC Tempe",
        location="Tempe, Arizona, USA",
        lat=33.4255,
        lon=-111.9400,
        region="North America",
    ),
    IridiumGateway(
        name="SNOC Svalbard",
        location="Svalbard, Norway",
        lat=78.2300,
        lon=15.6300,
        region="Europe / Arctic",
    ),
    IridiumGateway(
        name="TT&C Fairbanks",
        location="Fairbanks, Alaska, USA",
        lat=64.8378,
        lon=-147.7164,
        region="North America / Arctic",
    ),
]

# --- Mock IMEI mapping (satellite catalog ID -> 15-digit IMEI) ---

SATELLITE_IMEI_MAP: dict[int, str] = {
    0: "300234010000001",   # ISS
    1: "300234010000002",   # NOAA-20
    2: "300234010000003",   # AQUA
    3: "300234010000004",   # CRYOSAT-2
    4: "300234010000005",   # STARLINK-1007
    5: "300234010000006",   # ONEWEB-0453
    6: "300234010123456",   # USA-245 (NROL-65)
    7: "300234010234567",   # COSMOS-2558
    8: "300234010345678",   # YAOGAN-35C
    9: "300234010000010",   # KOSMOS-2562
    10: "300234010000011",  # SJ-21
    11: "300234010000012",  # OBJECT 2024-117A
    12: "300234010000013",  # GPS IIR-M 3
    13: "300234010000014",  # GALILEO-IOV 1
    14: "300234010000015",  # GLONASS-M 26
    15: "300234010000016",  # BEIDOU-3 M17
    16: "300234010000017",  # ASTRA 2G
    17: "300234010000018",  # INTELSAT 36
    18: "300234010000019",  # WGS-10
    19: "300234010000020",  # LUCH (OLYMP-K2)
    20: "300234010000021",  # ICEYE-X1
    21: "300234010000022",  # TIANHE (CSS)
    22: "300234010000023",  # TERRA
    23: "300234010000024",  # SENTINEL-2A
    24: "300234010000025",  # ELECTRON KICK STAGE DEB
    25: "300234010456789",  # SJ-26 (SHIJIAN-26)
}

# --- Command Opcodes (1 byte each, encoded in SBD payload) ---

COMMAND_OPCODES: dict[SatelliteCommandType, int] = {
    SatelliteCommandType.ORBIT_ADJUST: 0x10,
    SatelliteCommandType.ATTITUDE_CONTROL: 0x20,
    SatelliteCommandType.TELEMETRY_REQUEST: 0x30,
    SatelliteCommandType.POWER_MANAGEMENT: 0x40,
    SatelliteCommandType.COMM_RELAY_CONFIG: 0x50,
    SatelliteCommandType.EMERGENCY_SAFE_MODE: 0xFF,
}


def get_imei(catalog_id: int) -> str:
    """Get mock IMEI for a satellite. Falls back to generated IMEI."""
    if catalog_id in SATELLITE_IMEI_MAP:
        return SATELLITE_IMEI_MAP[catalog_id]
    # Generate a deterministic IMEI for unknown satellites
    return f"300234010{catalog_id:06d}"


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in km between two lat/lon points (degrees)."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def route_to_gateway(
    sat_lat: float, sat_lon: float, sat_alt_km: float = 500.0
) -> GatewayRouting:
    """Select optimal Iridium gateway based on satellite sub-point position.

    Uses haversine distance from the satellite's ground track point to each
    gateway. Picks the closest station. Estimates inter-satellite link hops
    and latency based on distance.
    """
    distances = []
    for gw in IRIDIUM_GATEWAYS:
        d = _haversine_km(sat_lat, sat_lon, gw.lat, gw.lon)
        distances.append((d, gw))

    distances.sort(key=lambda x: x[0])
    best_dist, best_gw = distances[0]

    # Estimate hops: Iridium LEO constellation has inter-satellite links
    # ~4000 km per hop, minimum 1 hop (up to satellite + down to gateway)
    hops = max(1, min(4, int(best_dist / 4000) + 1))

    # Latency: ~40ms per hop (inter-satellite) + ~120ms uplink/downlink
    latency_ms = 120 + hops * 40 + int(best_dist / 50)

    alternatives = [gw for _, gw in distances[1:]]

    return GatewayRouting(
        selected_gateway=best_gw,
        routing_reason=(
            f"Satellite sub-point ({sat_lat:.1f}N, {sat_lon:.1f}E) is "
            f"{best_dist:.0f} km from {best_gw.name} ({best_gw.location}). "
            f"Selected as nearest operational gateway via {hops} inter-satellite link hop(s)."
        ),
        satellite_position={"lat": sat_lat, "lon": sat_lon, "altKm": sat_alt_km},
        signal_hops=hops,
        estimated_latency_ms=latency_ms,
        alternative_gateways=alternatives,
    )

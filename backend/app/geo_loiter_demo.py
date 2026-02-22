"""GEO US Loiter demo state management.

When activated, this demo injects threats for the first 6 watched (adversarial)
satellites that the frontend is redirecting toward US positions. Uses real
satellite IDs/names to match the globe display. Severity is progressive based
on elapsed time (0-30s nominal, 30-60s watched, 60s+ threatened).
"""

from __future__ import annotations

import time

_active: bool = False
_start_time: float = 0.0

# Target (lat, lon) above continental US — must match frontend GEO_US_TARGETS order
GEO_US_TARGETS: list[tuple[float, float]] = [
    (34.0, -118.0),   # Los Angeles
    (33.0, -112.0),   # Phoenix
    (32.0, -97.0),    # Dallas
    (41.0, -87.0),    # Chicago
    (38.0, -77.0),    # Washington DC
    (42.0, -71.0),    # Boston
]


def get_demo_threat_config(satellites: list[dict]) -> list[dict]:
    """Build threat configs for the first 6 watched satellites, aligned with frontend."""
    watched = [
        s for s in satellites
        if s.get("status") == "watched"
    ]
    watched = sorted(watched, key=lambda s: s.get("altitude_km", 0))[: len(GEO_US_TARGETS)]
    configs = []
    for i, sat in enumerate(watched):
        target_lat, target_lon = GEO_US_TARGETS[i] if i < len(GEO_US_TARGETS) else GEO_US_TARGETS[0]
        country = sat.get("country_code", "PRC") or "PRC"
        configs.append({
            "id": sat["id"],
            "name": sat["name"],
            "norad_id": sat.get("noradId", 90000 + i),
            "country": country,
            "target_lat": target_lat,
            "target_lon": target_lon,
            "description": (
                f"{sat['name']} repositioned toward US sector — subsatellite point approaching "
                f"{target_lat:.0f}°N, {target_lon:.0f}°W. Adversarial asset loitering over "
                f"continental US territory. Country: {country}."
            ),
        })
    return configs


def start() -> None:
    """Activate the GEO US Loiter demo."""
    global _active, _start_time
    _active = True
    _start_time = time.time()


def stop() -> None:
    """Deactivate the GEO US Loiter demo."""
    global _active
    _active = False


def is_active() -> bool:
    return _active


def elapsed() -> float:
    """Seconds since demo was started."""
    return time.time() - _start_time if _active else 0.0

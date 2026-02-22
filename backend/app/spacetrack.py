"""Space-Track.org API client — fetches real satellite & debris GP data."""

from __future__ import annotations

import logging
import math
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

SPACETRACK_BASE = "https://www.space-track.org"
LOGIN_URL = f"{SPACETRACK_BASE}/ajaxauth/login"
GP_URL = f"{SPACETRACK_BASE}/basicspacedata/query/class/gp"

EARTH_RADIUS_KM = 6378.137
MU = 398600.4418  # km^3/s^2


class SpaceTrackClient:
    """Caching Space-Track client with session cookie auth."""

    def __init__(self):
        self.username = os.getenv("SPACETRACK_USER", "williamfahie@outlook.com")
        self.password = os.getenv("SPACETRACK_PASS", "powsuw-bagpiC-hywjo8")
        self._cookie: str | None = None
        self._cookie_time: float = 0
        self._client = httpx.Client(timeout=30, follow_redirects=True)
        # Cache
        self._sat_cache: list[dict] | None = None
        self._sat_cache_time: float = 0
        self._debris_cache: list[dict] | None = None
        self._debris_cache_time: float = 0

    def _login(self) -> None:
        if self._cookie and (time.time() - self._cookie_time) < 1800:
            return
        logger.info("Logging in to Space-Track...")
        resp = self._client.post(LOGIN_URL, data={
            "identity": self.username,
            "password": self.password,
        })
        resp.raise_for_status()
        self._cookie = resp.cookies.get("chocolatechip")
        self._cookie_time = time.time()
        logger.info("Space-Track login successful")

    def _query(self, url: str) -> list[dict]:
        self._login()
        resp = self._client.get(url, cookies={"chocolatechip": self._cookie or ""})
        resp.raise_for_status()
        return resp.json()

    def fetch_satellites(self, norad_ids: list[int] | None = None) -> list[dict]:
        """Fetch GP data for specific satellites or active payloads."""
        now = time.time()
        if self._sat_cache and (now - self._sat_cache_time) < 3600:
            return self._sat_cache

        if norad_ids:
            # Space-Track has URL length limits, batch if needed
            all_data: list[dict] = []
            batch_size = 50
            for i in range(0, len(norad_ids), batch_size):
                batch = norad_ids[i:i + batch_size]
                id_str = ",".join(str(n) for n in batch)
                url = f"{GP_URL}/NORAD_CAT_ID/{id_str}/orderby/NORAD_CAT_ID/format/json"
                all_data.extend(self._query(url))
            data = all_data
            self._sat_cache = data
            self._sat_cache_time = now
            return data
        else:
            # Get a broad selection of active payloads
            url = (
                f"{GP_URL}/OBJECT_TYPE/PAYLOAD/DECAY_DATE/null-val"
                f"/PERIOD/<128/orderby/NORAD_CAT_ID asc/limit/200/format/json"
            )

        data = self._query(url)
        self._sat_cache = data
        self._sat_cache_time = now
        return data

    def fetch_debris(self, limit: int = 1000) -> list[dict]:
        """Fetch GP data for debris objects in LEO."""
        now = time.time()
        if self._debris_cache and (now - self._debris_cache_time) < 86400:
            return self._debris_cache

        url = (
            f"{GP_URL}/OBJECT_TYPE/DEB/DECAY_DATE/null-val"
            f"/PERIOD/<128/orderby/NORAD_CAT_ID asc/limit/{limit}/format/json"
        )

        data = self._query(url)
        self._debris_cache = data
        self._debris_cache_time = now
        return data


# Singleton
_client: SpaceTrackClient | None = None


def get_client() -> SpaceTrackClient:
    global _client
    if _client is None:
        _client = SpaceTrackClient()
    return _client


# --- Conversion helpers ---

def gp_to_satellite(gp: dict, idx: int) -> dict:
    """Convert a GP record to the frontend SatelliteData format."""
    mean_motion = float(gp.get("MEAN_MOTION", 15))  # rev/day
    period_min = 1440.0 / mean_motion if mean_motion > 0 else 90
    semi_major_km = float(gp.get("SEMIMAJOR_AXIS", 6778))
    alt_km = semi_major_km - EARTH_RADIUS_KM
    ecc = float(gp.get("ECCENTRICITY", 0))
    inc_deg = float(gp.get("INCLINATION", 0))
    raan_deg = float(gp.get("RA_OF_ASC_NODE", 0))
    mean_anomaly_deg = float(gp.get("MEAN_ANOMALY", 0))
    country = gp.get("COUNTRY_CODE", "UNK")

    # Orbital velocity
    v_kms = math.sqrt(MU / semi_major_km) if semi_major_km > 0 else 7.5

    # Determine status: allied (ours), friendly (neutral), watched (adversary)
    ALLIED_COUNTRIES = {"USA", "UK", "FR", "GBR", "CA", "ESA", "EU", "JPN", "AUS", "NZ", "DE", "IT", "NOR"}
    ADVERSARY_COUNTRIES = {"PRC", "RUS", "CIS", "PRK", "IRN"}

    if country in ALLIED_COUNTRIES:
        status = "allied"
    elif country in ADVERSARY_COUNTRIES:
        status = "watched"
    else:
        status = "friendly"  # neutral / commercial / unknown

    if ecc > 0.05 and alt_km < 600:
        status = "watched"

    # Generate trajectory points
    trajectory = _generate_trajectory(inc_deg, alt_km, raan_deg, mean_anomaly_deg, period_min)

    norad_id = int(gp.get("NORAD_CAT_ID", 99000 + idx))
    name = (gp.get("OBJECT_NAME") or f"OBJ-{norad_id}").strip()

    return {
        "id": f"sat-{idx}",
        "name": name,
        "noradId": norad_id,
        "status": status,
        "country_code": country,
        "altitude_km": round(alt_km, 1),
        "velocity_kms": round(v_kms, 2),
        "inclination_deg": round(inc_deg, 1),
        "period_min": round(period_min, 1),
        "eccentricity": round(ecc, 6),
        "semi_major_axis_km": round(semi_major_km, 1),
        "trajectory": trajectory,
        "health": {
            "power": 70 + (norad_id % 30),
            "comms": 75 + (norad_id % 25),
            "propellant": 30 + (norad_id % 60),
        },
    }


def gp_to_debris(gp: dict) -> dict:
    """Convert a GP record to the frontend DebrisData format."""
    inc_deg = float(gp.get("INCLINATION", 0))
    raan_deg = float(gp.get("RA_OF_ASC_NODE", 0))
    mean_anomaly_deg = float(gp.get("MEAN_ANOMALY", 0))
    semi_major_km = float(gp.get("SEMIMAJOR_AXIS", 6778))
    alt_km = semi_major_km - EARTH_RADIUS_KM

    inc_rad = math.radians(inc_deg)
    raan_rad = math.radians(raan_deg)
    ma_rad = math.radians(mean_anomaly_deg)

    # Approximate geodetic position from orbital elements
    x = math.cos(ma_rad)
    y = math.sin(ma_rad)
    x_eci = x * math.cos(raan_rad) - y * math.cos(inc_rad) * math.sin(raan_rad)
    y_eci = x * math.sin(raan_rad) + y * math.cos(inc_rad) * math.cos(raan_rad)
    z_eci = y * math.sin(inc_rad)

    lat = math.degrees(math.asin(max(-1, min(1, z_eci))))
    lon = math.degrees(math.atan2(y_eci, x_eci))

    return {
        "noradId": int(gp.get("NORAD_CAT_ID", 0)),
        "lat": round(lat, 2),
        "lon": round(lon, 2),
        "altKm": round(max(alt_km, 200), 1),
    }


def _generate_trajectory(
    inc_deg: float, alt_km: float, raan_deg: float, ma_deg: float, period_min: float
) -> list[dict]:
    """Generate ~180 trajectory points for a full orbit."""
    points = []
    period_sec = period_min * 60
    num_points = 180
    step_sec = period_sec / num_points
    inc_rad = math.radians(inc_deg)
    raan_rad = math.radians(raan_deg)
    base_t = time.time()

    for i in range(num_points):
        t = base_t + i * step_sec
        true_anomaly = (2 * math.pi / period_sec) * (i * step_sec) + math.radians(ma_deg)

        x = math.cos(true_anomaly)
        y = math.sin(true_anomaly)

        x_eci = x * math.cos(raan_rad) - y * math.cos(inc_rad) * math.sin(raan_rad)
        y_eci = x * math.sin(raan_rad) + y * math.cos(inc_rad) * math.cos(raan_rad)
        z_eci = y * math.sin(inc_rad)

        lat = math.degrees(math.asin(max(-1, min(1, z_eci))))
        lon = math.degrees(math.atan2(y_eci, x_eci))

        points.append({"t": t, "lat": round(lat, 2), "lon": round(lon, 2), "alt_km": round(alt_km, 1)})

    return points

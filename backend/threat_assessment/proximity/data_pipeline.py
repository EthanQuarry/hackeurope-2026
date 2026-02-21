"""
Data pipeline for the satellite threat assessment system.

Responsibilities:
- Authenticate with Space-Track.org using SPACETRACK_USER / SPACETRACK_PASS
  environment variables (distinct from the legacy spacetrack_loader.py which
  uses SPACETRACK_IDENTITY / SPACETRACK_PASSWORD).
- Fetch GP orbital elements and SATCAT metadata with rate-limit-aware caching:
    GP data   → cache for 1 hour  (Space-Track GP class: max 1 request/hour)
    SATCAT    → cache for 1 day   (Space-Track SATCAT class: max 1 request/day)
- Propagate satellite positions over a rolling 30-day window at 10-minute
  intervals using the sgp4 library's SatrecArray batch API.
- Compute minimum separation distance (km) and time spent within 100 km for
  each assessed satellite against the target constellation.

Target constellation (hardcoded placeholder CubeSats — replace NORAD IDs with
your actual constellation when known):
    41994  LEMUR-2-SPIRE-MINIONS  (Spire Global, ~500 km SSO)
    40907  LEMUR-2 early batch    (Spire Global, ~500 km SSO)
    40379  DOVE PIONEER           (Planet Labs,  ~475 km SSO)
    43613  LEMUR-2-JAKEMOMENT     (Spire Global, ~500 km SSO)
    47942  FLOCK 4P-1             (Planet Labs,  ~500 km SSO)
"""

from __future__ import annotations

import json
import logging
import os
import pathlib
import random
import time
import warnings
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import numpy as np
from sgp4.api import Satrec, SatrecArray, jday
from spacetrack import SpaceTrackClient

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------

# Target constellation: 5 active Spire Lemur-2 / AeroCube CubeSats (US, SSO ~97°).
# Verified active in GP catalog as of Feb 2026. Replace with your actual constellation.
#   64535  UND ROADS 1          (2025-06-23, inc=97.45°)
#   64549  UND ROADS 2          (2025-06-23, inc=97.46°)
#   64561  LEMUR 2 KRISH        (2025-06-23, inc=97.76°)
#   63220  AEROCUBE 18A         (2025-03-15, inc=97.41°)
#   63222  AEROCUBE 18B         (2025-03-15, inc=97.41°)
TARGET_NORAD_IDS: list[int] = [64535, 64549, 64561, 63220, 63222]

# Country codes considered adversarial (assigned elevated base prior).
# The GP catalog uses "PRC" for China and "CIS" for Russia/former Soviet states.
ADVERSARIAL_COUNTRIES: frozenset[str] = frozenset({"PRC", "CIS"})

# Country codes considered benign (used to fit the empirical benign distribution).
# The GP catalog uses "US", "UK", "FR" (not "USA", "GBR", "FRA").
BENIGN_COUNTRIES: frozenset[str] = frozenset({"US", "UK", "JPN", "ESA", "FR"})

# Cache TTLs (seconds) — aligned with Space-Track API rate limits
GP_CACHE_TTL: int = 3_600       # 1 hour
SATCAT_CACHE_TTL: int = 86_400  # 1 day

# Local cache directory (created automatically)
CACHE_DIR: pathlib.Path = pathlib.Path("./cache")

# Propagation window and resolution
WINDOW_DAYS: int = 30
INTERVAL_MINUTES: int = 10

# Proximity threshold for dwell-time computation
PROXIMITY_THRESHOLD_KM: float = 100.0

# SGP4 batch size — governs peak memory during propagation
# 200 sats × 4320 steps × 3 coords × 8 bytes ≈ 20 MB per batch
PROPAGATION_BATCH_SIZE: int = 200

# Chunked distance computation — limits memory during the vectorised min-sep step
# 100 foreign × 5 targets × 4320 steps × 3 coords × 8 bytes ≈ 52 MB per chunk
DISTANCE_CHUNK_SIZE: int = 100


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class SatelliteGP:
    """Parsed GP record enriched with SATCAT metadata."""

    norad_cat_id: int
    object_name: str
    country_code: str
    rcs_size: str   # "SMALL", "MEDIUM", "LARGE", or "" if unknown
    tle_line1: str
    tle_line2: str
    object_type: str


@dataclass
class ProximityResult:
    """Proximity metrics for one satellite relative to the target constellation."""

    norad_cat_id: int
    object_name: str
    country_code: str
    rcs_size: str
    min_separation_km: float
    hours_within_100km: float
    propagation_failed: bool  # True if SGP4 returned errors for ALL timesteps


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


def get_credentials() -> tuple[str, str]:
    """
    Read Space-Track credentials from environment variables.

    Variables:
        SPACETRACK_USER   account e-mail
        SPACETRACK_PASS   account password

    Returns:
        (user, password)

    Raises:
        ValueError: if either variable is missing.
    """
    user = os.environ.get("SPACETRACK_USER")
    password = os.environ.get("SPACETRACK_PASS")
    if not user or not password:
        raise ValueError(
            "Space-Track credentials not found. "
            "Set SPACETRACK_USER and SPACETRACK_PASS environment variables.\n"
            "(Note: these are separate from SPACETRACK_IDENTITY / SPACETRACK_PASSWORD "
            "used by the legacy spacetrack_loader.py.)"
        )
    return user, password


# ---------------------------------------------------------------------------
# Caching helpers
# ---------------------------------------------------------------------------


def _cache_path(name: str) -> pathlib.Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{name}.json"


def _load_cache(name: str, max_age_seconds: int) -> list[dict] | None:
    """Return cached data if it exists and is younger than max_age_seconds."""
    path = _cache_path(name)
    if not path.exists():
        return None
    age = time.time() - path.stat().st_mtime
    if age > max_age_seconds:
        log.debug("Cache '%s' is stale (%.0fs old, TTL %ds).", name, age, max_age_seconds)
        return None
    log.info("Using cached '%s' (%.0fs old).", name, age)
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _save_cache(name: str, data: list[dict]) -> None:
    path = _cache_path(name)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    log.debug("Saved %d records to cache '%s'.", len(data), name)


# ---------------------------------------------------------------------------
# Space-Track API fetches
# ---------------------------------------------------------------------------


def fetch_gp_data(user: str, password: str) -> list[dict]:
    """
    Fetch current GP orbital elements for all active PAYLOAD objects.

    Caches the result for GP_CACHE_TTL seconds (1 hour) to respect the
    Space-Track rate limit of 1 request per hour for the GP class.

    Returns:
        list of raw GP dicts with uppercase keys (NORAD_CAT_ID, TLE_LINE1, etc.)
    """
    cached = _load_cache("gp_data", GP_CACHE_TTL)
    if cached is not None:
        return cached

    log.info("Fetching GP data from Space-Track (this may take a minute)...")
    with SpaceTrackClient(identity=user, password=password) as st:
        raw = st.gp(
            format="json",
            object_type="PAYLOAD",
            decay_date="null-val",
            epoch=">now-30",
        )

    data: list[dict] = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(data, list):
        data = [data]

    _save_cache("gp_data", data)
    log.info("Fetched %d GP records.", len(data))
    return data


def fetch_satcat_data(user: str, password: str) -> dict[int, str]:
    """
    Fetch SATCAT metadata and return a NORAD-ID-to-RCS_SIZE lookup dict.

    Caches the result for SATCAT_CACHE_TTL seconds (1 day) to respect the
    Space-Track rate limit of 1 request per day for the SATCAT class.

    Returns:
        dict mapping int(NORAD_CAT_ID) -> rcs_size string
    """
    cached = _load_cache("satcat_data", SATCAT_CACHE_TTL)
    if cached is not None:
        return {int(r["NORAD_CAT_ID"]): r.get("RCS_SIZE", "") for r in cached}

    log.info("Fetching SATCAT metadata from Space-Track...")
    with SpaceTrackClient(identity=user, password=password) as st:
        raw = st.satcat(
            format="json",
            current="Y",
        )

    data: list[dict] = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(data, list):
        data = [data]

    _save_cache("satcat_data", data)
    log.info("Fetched %d SATCAT records.", len(data))
    return {int(r["NORAD_CAT_ID"]): r.get("RCS_SIZE", "") for r in data}


# ---------------------------------------------------------------------------
# Record parsing and filtering
# ---------------------------------------------------------------------------


def parse_gp_records(
    raw_records: list[dict],
    rcs_lookup: dict[int, str],
) -> list[SatelliteGP]:
    """
    Convert raw GP dicts into SatelliteGP dataclasses.

    Skips records with missing or empty TLE lines (they cannot be propagated).
    Enriches each record with rcs_size from the SATCAT lookup (defaults to "").
    """
    satellites: list[SatelliteGP] = []
    skipped = 0
    for rec in raw_records:
        tle1 = rec.get("TLE_LINE1", "")
        tle2 = rec.get("TLE_LINE2", "")
        if not tle1 or not tle2:
            skipped += 1
            continue
        try:
            norad_id = int(rec["NORAD_CAT_ID"])
        except (KeyError, ValueError, TypeError):
            skipped += 1
            continue
        satellites.append(
            SatelliteGP(
                norad_cat_id=norad_id,
                object_name=rec.get("OBJECT_NAME", "UNKNOWN") or "UNKNOWN",
                country_code=rec.get("COUNTRY_CODE", "") or "",
                rcs_size=rcs_lookup.get(norad_id) or rec.get("RCS_SIZE") or "",
                tle_line1=tle1,
                tle_line2=tle2,
                object_type=rec.get("OBJECT_TYPE", "") or "",
            )
        )
    if skipped:
        log.debug("Skipped %d records with missing TLE data.", skipped)
    return satellites


def filter_targets(all_gp: list[SatelliteGP]) -> list[SatelliteGP]:
    """
    Return SatelliteGP records for the hardcoded target constellation.

    Warns for any target NORAD IDs not found in the GP data (stale TLE,
    decayed object, etc.). Raises RuntimeError if fewer than 2 targets
    are available (propagation requires at least one reference point).
    """
    by_id = {s.norad_cat_id: s for s in all_gp}
    targets: list[SatelliteGP] = []
    for nid in TARGET_NORAD_IDS:
        if nid in by_id:
            targets.append(by_id[nid])
        else:
            log.warning("Target NORAD %d not found in GP data (decayed or stale).", nid)
    if len(targets) < 2:
        raise RuntimeError(
            f"Only {len(targets)} target satellite(s) found; need at least 2. "
            "Update TARGET_NORAD_IDS in data_pipeline.py."
        )
    log.info("Target constellation: %d satellites.", len(targets))
    return targets


def filter_adversarial(all_gp: list[SatelliteGP]) -> list[SatelliteGP]:
    """
    Return PAYLOAD satellites from adversarial countries (PRC, RUS).

    Excludes target constellation NORAD IDs to avoid self-comparisons.
    """
    target_set = set(TARGET_NORAD_IDS)
    result = [
        s for s in all_gp
        if s.country_code in ADVERSARIAL_COUNTRIES
        and s.norad_cat_id not in target_set
    ]
    log.info("Adversarial satellites: %d (PRC/RUS PAYLOAD).", len(result))
    return result


def filter_benign_sample(
    all_gp: list[SatelliteGP],
    n: int = 500,
    seed: int = 42,
) -> list[SatelliteGP]:
    """
    Return a reproducible random sample of up to n benign-nation satellites.

    Benign nations: USA, GBR, JPN, ESA, FRA.
    Excludes target constellation NORAD IDs.
    Uses a fixed seed for reproducibility across runs with cached data.
    """
    target_set = set(TARGET_NORAD_IDS)
    pool = [
        s for s in all_gp
        if s.country_code in BENIGN_COUNTRIES
        and s.norad_cat_id not in target_set
    ]
    rng = random.Random(seed)
    sample = rng.sample(pool, min(n, len(pool)))
    log.info(
        "Benign sample: %d satellites from %d available (seed=%d).",
        len(sample), len(pool), seed,
    )
    return sample


# ---------------------------------------------------------------------------
# Time grid construction
# ---------------------------------------------------------------------------


def build_time_grid(
    window_days: int = WINDOW_DAYS,
    interval_minutes: int = INTERVAL_MINUTES,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Build Julian Date arrays covering a rolling forward window.

    The window runs from UTC now to (now + window_days) at interval_minutes
    cadence, giving 4320 steps for the default 30-day / 10-minute config.

    Returns:
        jd_arr: float64 array of Julian Date integer parts   shape (n_steps,)
        fr_arr: float64 array of Julian Date fractions        shape (n_steps,)
    """
    now = datetime.now(timezone.utc)
    n_steps = int(window_days * 24 * 60 / interval_minutes)
    jd_list: list[float] = []
    fr_list: list[float] = []
    for i in range(n_steps):
        dt = now + timedelta(minutes=i * interval_minutes)
        jd_val, fr_val = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second)
        jd_list.append(jd_val)
        fr_list.append(fr_val)
    return np.array(jd_list, dtype=np.float64), np.array(fr_list, dtype=np.float64)


# ---------------------------------------------------------------------------
# SGP4 propagation
# ---------------------------------------------------------------------------


def _check_sgp4_backend() -> None:
    """Warn if the C++ accelerated SGP4 backend is not available."""
    try:
        from sgp4.api import accelerated  # type: ignore[attr-defined]
        if not accelerated:
            warnings.warn(
                "The sgp4 C++ extension is not compiled. Propagation will be slow. "
                "Run: pip install sgp4 --upgrade",
                RuntimeWarning,
                stacklevel=3,
            )
    except ImportError:
        pass


def propagate_constellation(
    targets: list[SatelliteGP],
    jd: np.ndarray,
    fr: np.ndarray,
) -> np.ndarray:
    """
    Propagate target constellation positions over the full time grid.

    Returns:
        positions: float64 array shape (n_targets, n_times, 3) in km (TEME frame).
                   Failed propagation timesteps are set to NaN.
    """
    _check_sgp4_backend()
    satrecs = [Satrec.twoline2rv(t.tle_line1, t.tle_line2) for t in targets]
    sat_arr = SatrecArray(satrecs)
    e, r, _ = sat_arr.sgp4(jd, fr)
    # e shape: (n_targets, n_times); r shape: (n_targets, n_times, 3)
    fail_mask = e != 0
    r = r.astype(np.float64)
    r[fail_mask] = np.nan
    n_failures = int(np.sum(fail_mask))
    if n_failures:
        log.warning("Target propagation: %d timestep failures (set to NaN).", n_failures)
    return r


def propagate_satellites(
    satellites: list[SatelliteGP],
    jd: np.ndarray,
    fr: np.ndarray,
    batch_size: int = PROPAGATION_BATCH_SIZE,
) -> tuple[np.ndarray, list[tuple[int, bool]]]:
    """
    Propagate a list of satellites in batches using SatrecArray.

    Satellites with malformed TLEs are skipped entirely (logged as warnings).
    Satellites where ALL timesteps fail are flagged `fully_failed=True` but
    kept in the output so they can be scored with prior-only posteriors.

    Args:
        satellites: list of SatelliteGP records to propagate
        jd, fr:     Julian date arrays from build_time_grid()
        batch_size: number of satellites per SatrecArray call

    Returns:
        positions:   float64 array shape (n_valid, n_times, 3), NaN where failed
        valid_info:  list of (original_index, fully_failed) for each row in positions
    """
    _check_sgp4_backend()
    all_positions: list[np.ndarray] = []
    valid_info: list[tuple[int, bool]] = []

    for batch_start in range(0, len(satellites), batch_size):
        batch = satellites[batch_start: batch_start + batch_size]
        satrecs: list[Satrec] = []
        local_indices: list[int] = []

        for offset, sat in enumerate(batch):
            try:
                sr = Satrec.twoline2rv(sat.tle_line1, sat.tle_line2)
                satrecs.append(sr)
                local_indices.append(batch_start + offset)
            except Exception as exc:
                log.warning(
                    "Failed to parse TLE for NORAD %d (%s): %s",
                    sat.norad_cat_id, sat.object_name, exc,
                )

        if not satrecs:
            continue

        sat_arr = SatrecArray(satrecs)
        e, r, _ = sat_arr.sgp4(jd, fr)
        r = r.astype(np.float64)
        fail_mask = e != 0          # (n_batch, n_times)
        r[fail_mask] = np.nan

        fully_failed = np.all(fail_mask, axis=1)  # (n_batch,)

        for j, (orig_idx, is_failed) in enumerate(zip(local_indices, fully_failed)):
            all_positions.append(r[j])                   # (n_times, 3)
            valid_info.append((orig_idx, bool(is_failed)))

    if not all_positions:
        raise RuntimeError("No satellites could be propagated — check TLE data.")

    positions = np.stack(all_positions, axis=0)  # (n_valid, n_times, 3)
    n_failed = sum(1 for _, f in valid_info if f)
    log.info(
        "Propagated %d/%d satellites (%d fully failed).",
        len(all_positions), len(satellites), n_failed,
    )
    return positions, valid_info


# ---------------------------------------------------------------------------
# Separation computation
# ---------------------------------------------------------------------------


def compute_min_separations(
    foreign_positions: np.ndarray,
    target_positions: np.ndarray,
    chunk_size: int = DISTANCE_CHUNK_SIZE,
    interval_minutes: float = float(INTERVAL_MINUTES),
) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute minimum separation and dwell time for each foreign satellite vs
    the target constellation.

    Uses chunked vectorisation to keep peak memory within safe bounds:
        chunk_size × n_targets × n_times × 3 × 8 bytes
        (100 × 5 × 4320 × 3 × 8 ≈ 52 MB per chunk)

    Args:
        foreign_positions: shape (n_foreign, n_times, 3) — TEME km, NaN for failures
        target_positions:  shape (n_targets, n_times, 3) — TEME km, NaN for failures
        chunk_size:        number of foreign satellites to process per iteration
        interval_minutes:  timestep size (used to convert step counts to hours)

    Returns:
        min_separation_km:   shape (n_foreign,) — minimum distance over window, km
        hours_within_100km:  shape (n_foreign,) — hours any target within 100 km
    """
    n_foreign = foreign_positions.shape[0]
    all_min_sep: list[np.ndarray] = []
    all_hours: list[np.ndarray] = []

    # target_positions: (n_targets, n_times, 3) → (1, n_targets, n_times, 3)
    tp_exp = target_positions[np.newaxis, :, :, :]

    for start in range(0, n_foreign, chunk_size):
        chunk = foreign_positions[start: start + chunk_size]  # (C, n_times, 3)

        # Expand for broadcasting: (C, 1, n_times, 3) vs (1, n_targets, n_times, 3)
        fp_exp = chunk[:, np.newaxis, :, :]
        diffs = fp_exp - tp_exp                              # (C, n_targets, n_times, 3)
        dists = np.linalg.norm(diffs, axis=-1)               # (C, n_targets, n_times)

        # Minimum over constellation at each timestep: shape (C, n_times)
        # Suppress the expected all-NaN warning (occurs when a target has no valid
        # positions at a given timestep; the result is NaN which is handled by nanmin below)
        with np.errstate(all="ignore"):
            min_vs_constellation = np.nanmin(dists, axis=1)

        # Global minimum over the full window: shape (C,)
        min_sep = np.nanmin(min_vs_constellation, axis=1)

        # Hours where any target is within threshold: shape (C,)
        within = (min_vs_constellation < PROXIMITY_THRESHOLD_KM)
        hours = np.nansum(within.astype(np.float64), axis=1) * (interval_minutes / 60.0)

        all_min_sep.append(min_sep)
        all_hours.append(hours)

    return np.concatenate(all_min_sep), np.concatenate(all_hours)


# ---------------------------------------------------------------------------
# Main pipeline orchestrator
# ---------------------------------------------------------------------------


def run_pipeline(
    window_days: int = WINDOW_DAYS,
    interval_minutes: int = INTERVAL_MINUTES,
    benign_sample_size: int = 500,
) -> tuple[list[ProximityResult], list[ProximityResult]]:
    """
    End-to-end data pipeline.

    Fetches orbital data, propagates all relevant satellites, and computes
    proximity metrics for both adversarial and benign satellite sets.

    Returns:
        adversarial_results: ProximityResult list for PRC/RUS satellites
        benign_results:      ProximityResult list for benign-nation sample
                             (used to fit the empirical benign distribution)
    """
    # 1. Authenticate and fetch data
    user, password = get_credentials()
    raw_gp = fetch_gp_data(user, password)
    rcs_lookup = fetch_satcat_data(user, password)

    # 2. Parse and filter
    all_sats = parse_gp_records(raw_gp, rcs_lookup)
    log.info("Parsed %d valid PAYLOAD records.", len(all_sats))

    targets = filter_targets(all_sats)
    adversarial = filter_adversarial(all_sats)
    benign = filter_benign_sample(all_sats, n=benign_sample_size)

    # 3. Build time grid
    log.info(
        "Building %d-day propagation grid at %d-minute intervals (%d steps).",
        window_days, interval_minutes,
        int(window_days * 24 * 60 / interval_minutes),
    )
    jd, fr = build_time_grid(window_days, interval_minutes)

    # 4. Propagate target constellation
    log.info("Propagating target constellation (%d satellites)...", len(targets))
    target_pos = propagate_constellation(targets, jd, fr)  # (n_targets, n_times, 3)

    # 5. Propagate adversarial + benign together (one API call batch loop)
    combined = adversarial + benign
    n_adv = len(adversarial)
    log.info(
        "Propagating %d adversarial + %d benign satellites (%d total)...",
        n_adv, len(benign), len(combined),
    )
    combined_pos, combined_info = propagate_satellites(combined, jd, fr, PROPAGATION_BATCH_SIZE)

    # 6. Compute separations
    log.info("Computing minimum separations...")
    min_seps, hours = compute_min_separations(combined_pos, target_pos, DISTANCE_CHUNK_SIZE, float(interval_minutes))

    # 7. Build ProximityResult lists, splitting adversarial vs benign by original index
    def _make_result(sat: SatelliteGP, sep: float, hrs: float, failed: bool) -> ProximityResult:
        return ProximityResult(
            norad_cat_id=sat.norad_cat_id,
            object_name=sat.object_name,
            country_code=sat.country_code,
            rcs_size=sat.rcs_size,
            min_separation_km=float(sep) if not np.isnan(sep) else float("inf"),
            hours_within_100km=float(hrs) if not np.isnan(hrs) else 0.0,
            propagation_failed=failed,
        )

    adversarial_results: list[ProximityResult] = []
    benign_results: list[ProximityResult] = []

    for row_idx, (orig_idx, fully_failed) in enumerate(combined_info):
        sat = combined[orig_idx]
        sep = min_seps[row_idx]
        hrs = hours[row_idx]
        result = _make_result(sat, sep, hrs, fully_failed)
        if orig_idx < n_adv:
            adversarial_results.append(result)
        else:
            benign_results.append(result)

    log.info(
        "Pipeline complete: %d adversarial, %d benign proximity results.",
        len(adversarial_results), len(benign_results),
    )
    return adversarial_results, benign_results

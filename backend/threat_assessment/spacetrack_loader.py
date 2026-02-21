"""
Load satellite orbital data from Space-Track.

Data source: https://www.space-track.org
Requires free registration. Set SPACETRACK_IDENTITY and SPACETRACK_PASSWORD
environment variables, or pass them to the loader.

Rate limits: GP 1/hour, GP_HISTORY 1/lifetime per object (download once, cache).
"""

import json
import os
from typing import Any

import spacetrack.operators as op
from spacetrack import SpaceTrackClient


def _get_client(
    identity: str | None = None,
    password: str | None = None,
) -> SpaceTrackClient:
    """Create SpaceTrackClient with credentials from args or environment."""
    identity = identity or os.environ.get("SPACETRACK_IDENTITY")
    password = password or os.environ.get("SPACETRACK_PASSWORD")
    if not identity or not password:
        raise ValueError(
            "Space-Track credentials required. Set SPACETRACK_IDENTITY and "
            "SPACETRACK_PASSWORD environment variables, or pass identity= and password=."
        )
    return SpaceTrackClient(identity=identity, password=password)


def load_gp(
    format: str = "json",
    decay_date: str | None = "null-val",
    epoch: str = ">now-30",
    identity: str | None = None,
    password: str | None = None,
    **kwargs: Any,
) -> Any:
    """
    Fetch current GP (orbital element) data from Space-Track.

    Args:
        format: Output format ('json', 'tle', 'xml', 'kvn', 'csv', 'html')
        decay_date: Filter by decay - 'null-val' for on-orbit only (default)
        epoch: Epoch filter - '>now-30' gets propagable elements (default)
        **kwargs: Additional predicates (norad_cat_id, object_name, mean_motion, etc.)

    Returns:
        Parsed data for JSON, raw string for other formats.
    """
    with _get_client(identity, password) as st:
        data = st.gp(
            format=format,
            decay_date=decay_date,
            epoch=epoch,
            **kwargs,
        )
    if format == "json":
        return json.loads(data) if isinstance(data, str) else data
    return data


def load_active_satellites(
    identity: str | None = None,
    password: str | None = None,
) -> list[dict]:
    """Load on-orbit satellites (current propagable elements)."""
    with _get_client(identity, password) as st:
        data = st.gp(
            format="json",
            decay_date="null-val",
            epoch=">now-30",
        )
    result = json.loads(data) if isinstance(data, str) else data
    return result if isinstance(result, list) else [result]


def load_starlink(
    identity: str | None = None,
    password: str | None = None,
) -> list[dict]:
    """Load Starlink constellation data."""
    with _get_client(identity, password) as st:
        data = st.gp(
            format="json",
            decay_date="null-val",
            object_name=op.like("STARLINK"),
        )
    result = json.loads(data) if isinstance(data, str) else data
    return result if isinstance(result, list) else [result]


def load_iss(
    identity: str | None = None,
    password: str | None = None,
) -> list[dict]:
    """Load ISS (NORAD 25544) current elements."""
    with _get_client(identity, password) as st:
        data = st.gp(
            format="json",
            norad_cat_id=25544,
        )
    result = json.loads(data) if isinstance(data, str) else data
    return result if isinstance(result, list) else [result]


def load_gp_history(
    norad_cat_id: int | list[int],
    orderby: str = "epoch desc",
    limit: int = 100,
    format: str = "json",
    identity: str | None = None,
    password: str | None = None,
    **kwargs: Any,
) -> Any:
    """
    Load historical GP data for given satellite(s).

    Note: Space-Track limits GP_HISTORY to 1/lifetime per object - download once,
    store locally, and do not re-query. For bulk historical data, use their
    yearly zip files from cloud storage.

    Args:
        norad_cat_id: NORAD catalog number(s)
        orderby: Sort order (default: newest first)
        limit: Max records to return
        format: 'json', 'tle', 'xml', 'kvn', 'csv'
        **kwargs: Additional predicates (creation_date, etc.)
    """
    with _get_client(identity, password) as st:
        data = st.gp_history(
            norad_cat_id=norad_cat_id,
            orderby=orderby,
            limit=limit,
            format=format,
            **kwargs,
        )
    if format == "json":
        return json.loads(data) if isinstance(data, str) else data
    return data


def load_tle(
    decay_date: str | None = "null-val",
    epoch: str = ">now-30",
    identity: str | None = None,
    password: str | None = None,
    **kwargs: Any,
) -> str:
    """Load data as traditional Two-Line Element (TLE) format."""
    with _get_client(identity, password) as st:
        return st.gp(
            format="tle",
            decay_date=decay_date,
            epoch=epoch,
            **kwargs,
        )


if __name__ == "__main__":
    import sys

    if not os.environ.get("SPACETRACK_IDENTITY") or not os.environ.get("SPACETRACK_PASSWORD"):
        print("Set SPACETRACK_IDENTITY and SPACETRACK_PASSWORD environment variables.")
        sys.exit(1)

    print("Loading Space-Track data (on-orbit satellites)...\n")
    data = load_active_satellites()
    satellites = data if isinstance(data, list) else [data]
    print(f"Loaded {len(satellites)} satellites\n")
    count = 0
    for sat in satellites:
        if sat['COUNTRY_CODE'] == "PRC":
            count += 1
    print(f"Number of PCR satellites: {count}")
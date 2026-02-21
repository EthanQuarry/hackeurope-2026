"""Mock satellite catalog for demo — includes a mix of real-ish satellites and suspicious ones."""

from __future__ import annotations

SATELLITE_CATALOG: dict[int, dict] = {
    # --- LEO: Weather & Earth observation ---
    0: {
        "norad_id": 25544,
        "name": "ISS (ZARYA)",
        "nation": "International",
        "owner": "NASA / Roscosmos",
        "purpose": "Crewed space station, scientific research",
        "orbit_type": "LEO",
        "launch_year": 1998,
    },
    1: {
        "norad_id": 43013,
        "name": "NOAA-20 (JPSS-1)",
        "nation": "United States",
        "owner": "NOAA",
        "purpose": "Weather observation and climate monitoring",
        "orbit_type": "LEO",
        "launch_year": 2017,
    },
    2: {
        "norad_id": 27424,
        "name": "AQUA",
        "nation": "United States",
        "owner": "NASA",
        "purpose": "Earth science — water cycle, precipitation, oceans",
        "orbit_type": "LEO",
        "launch_year": 2002,
    },
    3: {
        "norad_id": 36508,
        "name": "CRYOSAT-2",
        "nation": "Europe (ESA)",
        "owner": "European Space Agency",
        "purpose": "Ice sheet and sea ice thickness monitoring",
        "orbit_type": "LEO",
        "launch_year": 2010,
    },
    # --- LEO: Communications constellations ---
    4: {
        "norad_id": 44238,
        "name": "STARLINK-1007",
        "nation": "United States",
        "owner": "SpaceX",
        "purpose": "Broadband internet constellation",
        "orbit_type": "LEO",
        "launch_year": 2019,
    },
    5: {
        "norad_id": 56700,
        "name": "ONEWEB-0453",
        "nation": "United Kingdom",
        "owner": "OneWeb",
        "purpose": "Broadband internet constellation",
        "orbit_type": "LEO",
        "launch_year": 2022,
    },
    # --- LEO: Military / Reconnaissance ---
    6: {
        "norad_id": 39232,
        "name": "USA-245 (NROL-65)",
        "nation": "United States",
        "owner": "NRO (National Reconnaissance Office)",
        "purpose": "Classified — believed to be KH-11 electro-optical reconnaissance",
        "orbit_type": "LEO",
        "launch_year": 2013,
    },
    7: {
        "norad_id": 48274,
        "name": "COSMOS-2558",
        "nation": "Russia",
        "owner": "Russian Aerospace Forces",
        "purpose": "Classified military satellite — suspected inspector satellite",
        "orbit_type": "LEO",
        "launch_year": 2022,
    },
    8: {
        "norad_id": 50258,
        "name": "YAOGAN-35C",
        "nation": "China",
        "owner": "PLA Strategic Support Force",
        "purpose": "Officially 'scientific experiment' — assessed as ELINT/SIGINT reconnaissance",
        "orbit_type": "LEO",
        "launch_year": 2022,
    },
    # --- SUSPICIOUS: Pre-seeded threats for demo ---
    9: {
        "norad_id": 99901,
        "name": "KOSMOS-2562",
        "nation": "Russia",
        "owner": "Russian Aerospace Forces",
        "purpose": "Classified — suspected co-orbital ASAT weapon test platform",
        "orbit_type": "LEO",
        "launch_year": 2024,
        "suspicious": True,
        "threat_notes": "Recently performed sudden orbital maneuver, closing distance to USA-245. Matches pattern of Russian inspector/ASAT tests (Cosmos 2542/2543 precedent).",
    },
    10: {
        "norad_id": 99902,
        "name": "SJ-21 (SHIJIAN-21)",
        "nation": "China",
        "owner": "CNSA / PLA",
        "purpose": "Officially 'space debris mitigation technology demonstration'",
        "orbit_type": "GEO",
        "launch_year": 2021,
        "suspicious": True,
        "threat_notes": "Demonstrated ability to grapple and relocate other satellites. Approached multiple GEO communication satellites at close range.",
    },
    11: {
        "norad_id": 99903,
        "name": "OBJECT 2024-117A",
        "nation": "Unknown",
        "owner": "Unknown",
        "purpose": "Unidentified — no TLE catalog match, no launch notification filed",
        "orbit_type": "LEO",
        "launch_year": 2024,
        "suspicious": True,
        "threat_notes": "Appeared without prior launch detection. Highly eccentric orbit in LEO with retrograde inclination. No nation has claimed ownership.",
    },
    # --- MEO: Navigation ---
    12: {
        "norad_id": 28474,
        "name": "GPS IIR-M 3 (USA-190)",
        "nation": "United States",
        "owner": "US Space Force",
        "purpose": "Global Positioning System navigation satellite",
        "orbit_type": "MEO",
        "launch_year": 2006,
    },
    13: {
        "norad_id": 37846,
        "name": "GALILEO-IOV 1",
        "nation": "Europe (ESA)",
        "owner": "European Union / ESA",
        "purpose": "Galileo navigation constellation",
        "orbit_type": "MEO",
        "launch_year": 2011,
    },
    14: {
        "norad_id": 32393,
        "name": "GLONASS-M 26",
        "nation": "Russia",
        "owner": "Roscosmos",
        "purpose": "GLONASS navigation constellation",
        "orbit_type": "MEO",
        "launch_year": 2008,
    },
    15: {
        "norad_id": 44204,
        "name": "BEIDOU-3 M17",
        "nation": "China",
        "owner": "CNSA",
        "purpose": "BeiDou navigation constellation",
        "orbit_type": "MEO",
        "launch_year": 2019,
    },
    # --- GEO: Communications ---
    16: {
        "norad_id": 40258,
        "name": "ASTRA 2G",
        "nation": "Luxembourg",
        "owner": "SES S.A.",
        "purpose": "Direct-to-home television broadcasting",
        "orbit_type": "GEO",
        "launch_year": 2014,
    },
    17: {
        "norad_id": 41866,
        "name": "INTELSAT 36",
        "nation": "United States",
        "owner": "Intelsat",
        "purpose": "Telecommunications and broadcast services",
        "orbit_type": "GEO",
        "launch_year": 2016,
    },
    18: {
        "norad_id": 43435,
        "name": "WGS-10 (USA-291)",
        "nation": "United States",
        "owner": "US Space Force",
        "purpose": "Wideband Global SATCOM — military broadband communications",
        "orbit_type": "GEO",
        "launch_year": 2019,
    },
    # --- SUSPICIOUS: GEO threat ---
    19: {
        "norad_id": 99904,
        "name": "LUCH (OLYMP-K2)",
        "nation": "Russia",
        "owner": "Russian Aerospace Forces",
        "purpose": "Officially 'data relay' — assessed as signals intelligence platform",
        "orbit_type": "GEO",
        "launch_year": 2023,
        "suspicious": True,
        "threat_notes": "Has repositioned itself multiple times between Western military/government GEO satellites. Pattern consistent with SIGINT collection against SATCOM.",
    },
    # --- More LEO variety ---
    20: {
        "norad_id": 43600,
        "name": "ICEYE-X1",
        "nation": "Finland",
        "owner": "ICEYE",
        "purpose": "SAR (Synthetic Aperture Radar) Earth imaging",
        "orbit_type": "LEO",
        "launch_year": 2018,
    },
    21: {
        "norad_id": 49260,
        "name": "TIANHE (CSS)",
        "nation": "China",
        "owner": "CMSA",
        "purpose": "Chinese Space Station core module",
        "orbit_type": "LEO",
        "launch_year": 2021,
    },
    22: {
        "norad_id": 25994,
        "name": "TERRA",
        "nation": "United States",
        "owner": "NASA",
        "purpose": "Earth observing — land, atmosphere, oceans",
        "orbit_type": "LEO",
        "launch_year": 1999,
    },
    23: {
        "norad_id": 41240,
        "name": "SENTINEL-2A",
        "nation": "Europe (ESA)",
        "owner": "European Space Agency / Copernicus",
        "purpose": "High-resolution optical imaging for Copernicus programme",
        "orbit_type": "LEO",
        "launch_year": 2015,
    },
    24: {
        "norad_id": 54321,
        "name": "ELECTRON KICK STAGE DEB",
        "nation": "United States / New Zealand",
        "owner": "Rocket Lab (debris)",
        "purpose": "Spent upper stage — space debris",
        "orbit_type": "LEO",
        "launch_year": 2023,
    },
    # --- SJ-26: Evolving threat scenario (static shell — runtime data from scenario.py) ---
    25: {
        "norad_id": 99910,
        "name": "SJ-26 (SHIJIAN-26)",
        "nation": "China",
        "owner": "CNSA",
        "purpose": "Earth observation and atmospheric research",
        "orbit_type": "LEO",
        "launch_year": 2025,
    },
}


def lookup_satellite(satellite_id: int) -> dict | None:
    """Look up a satellite by its simulation ID. Returns catalog entry or None."""
    if satellite_id == 25:
        from app.scenario import sj26_catalog_entry
        return sj26_catalog_entry()
    return SATELLITE_CATALOG.get(satellite_id)


def search_catalog(query: str) -> list[dict]:
    """Simple keyword search across satellite catalog entries."""
    from app.scenario import sj26_catalog_entry, SJ26_CATALOG_ID
    query_lower = query.lower()
    results = []
    for sat_id, entry in SATELLITE_CATALOG.items():
        # Use dynamic entry for SJ-26
        effective = sj26_catalog_entry() if sat_id == SJ26_CATALOG_ID else entry
        searchable = " ".join(str(v) for v in effective.values()).lower()
        if query_lower in searchable:
            results.append({"id": sat_id, **effective})
    return results

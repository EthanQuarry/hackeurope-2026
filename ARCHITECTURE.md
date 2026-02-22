# Adversary Satellite Tracking — System Architecture

## System Overview

The adversary tracking system extends the existing space defense platform with a multi-agent pipeline that maintains a catalog of adversary satellites, tracks their historical behavior, enriches them with open-source intelligence, and produces continuous threat assessments against US/allied assets.

```
                     +---------------------------+
                     |      Frontend (Next.js)    |
                     |  Adversary Dashboard Page  |
                     +------------+--------------+
                                  |
                          REST API / SSE / WS
                                  |
                     +------------+--------------+
                     |    FastAPI Backend         |
                     |  /api/adversary/*          |
                     +------------+--------------+
                                  |
               +------------------+------------------+
               |                  |                  |
        +------+------+   +------+------+   +-------+------+
        | Catalog      |   | History     |   | Threat       |
        | Agent        |   | Agent       |   | Agent        |
        +------+------+   +------+------+   +-------+------+
               |                  |                  |
        +------+------+   +------+------+   +-------+------+
        | Research     |   | Maneuver    |   | Proximity    |
        | Agent        |   | Detector    |   | Scorer       |
        +------+------+   +------+------+   +-------+------+
               |                  |                  |
               +------------------+------------------+
                                  |
                     +------------+--------------+
                     |     Data Layer             |
                     |  API Clients + Cache       |
                     +---------------------------+
                     | Space-Track | CelesTrak   |
                     | UCS DB      | GCAT        |
                     | SatNOGS     | SOCRATES    |
                     +---------------------------+
```

---

## Agent Roles

### 1. Catalog Agent (`catalog_agent.py`)

**Purpose:** Maintain the master list of adversary satellites.

**Data Flow:**
1. Query Space-Track SATCAT for all `PRC`, `CIS`, `IR` (Iran), `NORK` (DPRK) payloads
2. Cross-reference with UCS Database for mission/capability classification
3. Enrich with GCAT data for additional metadata
4. Use Claude to classify: declared mission vs. suspected mission
5. Store in-memory catalog with periodic refresh

**Output:** `AdversarySatellite` objects with full metadata

**Data Sources:**
- Space-Track SATCAT (primary catalog)
- Space-Track GP (current orbital elements)
- UCS Satellite Database (mission/capability)
- GCAT McDowell (cross-reference)

### 2. History Agent (`history_agent.py`)

**Purpose:** Analyze historical TLE data to detect maneuvers and behavioral patterns.

**Data Flow:**
1. For each adversary satellite, fetch GP_History from Space-Track
2. Parse TLE time series into orbital element DataFrames
3. Run maneuver detection algorithm (element discontinuity analysis)
4. Compute maneuver statistics: frequency, delta-v patterns, timing
5. Flag behavioral anomalies (dormant satellites becoming active, pattern changes)

**Output:** `BehavioralProfile` objects with maneuver history and anomaly flags

**Algorithm — Maneuver Detection:**
```
For consecutive TLE pairs (t_i, t_{i+1}):
  - delta_SMA = |SMA_{i+1} - SMA_i|
  - delta_INC = |INC_{i+1} - INC_i|
  - delta_ECC = |ECC_{i+1} - ECC_i|

  If delta_SMA > 1.0 km → altitude maneuver detected
  If delta_INC > 0.01 deg → plane change detected
  If delta_ECC > 0.001 → eccentricity change detected

  Classify: altitude_raise, altitude_lower, plane_change, orbit_circularization
  Estimate delta-v from Vis-viva equation
```

**Data Sources:**
- Space-Track GP_History (historical TLEs)

### 3. Research Agent (`research_agent.py`)

**Purpose:** Enrich satellite data with open-source intelligence.

**Data Flow:**
1. For each satellite, construct search queries (name + mission + capabilities)
2. Search academic papers, news articles, defense publications
3. Cross-reference launch manifests and co-launched payloads
4. Query SatNOGS for radio frequency data
5. Use Claude to synthesize findings into structured intelligence

**Output:** `IntelligenceReport` objects with sources and confidence levels

**Data Sources:**
- Web search (news, academic, defense journals)
- SatNOGS (radio frequencies)
- Gunter's Space Page (technical specifications)
- Launch manifests (GCAT)

### 4. Threat Agent (`threat_agent.py`)

**Purpose:** Combine all data into threat assessments against US/allied assets.

**Data Flow:**
1. Load current orbital elements for adversary satellites
2. Load current orbital elements for US/allied protected assets
3. Compute proximity metrics (current distance, predicted closest approach)
4. Pull SOCRATES conjunction data for additional context
5. Factor in behavioral history (recent maneuvers, approach patterns)
6. Apply Bayesian scoring (extending existing `bayesian_scorer.py`)
7. Generate threat scores with trend analysis

**Output:** `ThreatAssessment` objects with scores, trends, and reasoning

**Scoring Model:**
```
threat_score = w1 * proximity_score
             + w2 * maneuver_score
             + w3 * capability_score
             + w4 * intent_score
             + w5 * historical_approach_score

Where:
  proximity_score: Inverse distance to nearest US asset (Bayesian posterior)
  maneuver_score: Recent maneuver toward US asset? Frequency increasing?
  capability_score: RPO-capable? Has robotic arm? Maneuverable?
  intent_score: Military operator? Dual-use? Known proximity ops history?
  historical_approach_score: Past approaches to foreign satellites
```

---

## Data Models

### AdversarySatellite

```python
@dataclass
class AdversarySatellite:
    # Identity
    norad_id: int
    name: str
    cospar_id: str                    # International designator
    owner_country: str                # PRC, CIS, IR, NORK
    operator: str                     # PLA SSF, RFSA, etc.

    # Orbit
    orbit_type: str                   # LEO, MEO, GEO, HEO, SSO
    current_elements: OrbitalElements # Latest GP data

    # Classification
    object_type: str                  # PAYLOAD, R/B, DEB
    satellite_bus: str | None         # DFH-4, Yantar, etc.
    launch_date: date
    launch_vehicle: str | None

    # Mission
    declared_mission: str
    assessed_mission: str
    assessment_confidence: float      # 0.0 - 1.0
    mission_category: str             # recon, sigint, elint, comms, nav, inspector, etc.

    # Capabilities
    capabilities: SatelliteCapabilities

    # Analysis
    behavioral_profile: BehavioralProfile | None
    intelligence: IntelligenceReport | None
    threat_assessment: ThreatAssessment | None

    # Metadata
    last_updated: datetime
    data_sources: list[str]
```

### BehavioralProfile

```python
@dataclass
class BehavioralProfile:
    norad_id: int
    analysis_period: tuple[datetime, datetime]

    # Maneuver history
    total_maneuvers: int
    maneuvers: list[ManeuverEvent]
    maneuver_frequency_days: float    # Average days between maneuvers

    # Patterns
    is_station_keeping: bool          # Regular small maneuvers to maintain orbit
    is_active_maneuverer: bool        # Frequent large maneuvers
    was_dormant: bool                 # Period of no maneuvers
    dormant_period: tuple[datetime, datetime] | None
    recently_reactivated: bool        # Was dormant, now maneuvering

    # Approach history
    objects_approached: list[ApproachEvent]
    approach_frequency: float         # Approaches per year

    # Anomalies
    anomaly_flags: list[str]
    behavioral_pattern_summary: str   # Natural language summary
```

### ManeuverEvent

```python
@dataclass
class ManeuverEvent:
    epoch: datetime
    maneuver_type: str                # altitude_raise, altitude_lower, plane_change, etc.
    delta_sma_km: float
    delta_inc_deg: float
    delta_ecc: float
    estimated_delta_v_ms: float       # Estimated delta-v in m/s
    pre_orbit: OrbitalElements
    post_orbit: OrbitalElements
    possible_purpose: str | None      # e.g., "approaching NORAD 37348"
```

### ThreatAssessment

```python
@dataclass
class ThreatAssessment:
    norad_id: int
    timestamp: datetime

    # Scores
    overall_threat_score: int         # 0-100
    proximity_score: float
    maneuver_score: float
    capability_score: float
    intent_score: float

    # Trend
    trend: str                        # increasing, stable, decreasing
    score_history: list[tuple[datetime, int]]

    # Nearest US assets
    nearest_us_assets: list[ProximityRecord]

    # Reasoning
    reasoning: str                    # Natural language explanation
    contributing_factors: list[str]
    recommended_actions: list[str]
```

---

## API Endpoints

### New Routes (`/api/adversary/`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/adversary/catalog` | Full adversary satellite catalog |
| `GET` | `/api/adversary/catalog/{norad_id}` | Single satellite detail |
| `GET` | `/api/adversary/catalog?country=PRC` | Filter by country |
| `GET` | `/api/adversary/{norad_id}/history` | Behavioral history + maneuvers |
| `GET` | `/api/adversary/{norad_id}/intelligence` | Intelligence report |
| `GET` | `/api/adversary/{norad_id}/threat` | Current threat assessment |
| `GET` | `/api/adversary/threats` | All threat assessments, sorted by score |
| `GET` | `/api/adversary/threats/trending` | Satellites with increasing threat scores |
| `GET` | `/api/adversary/conjunctions` | Upcoming conjunctions with US assets |
| `POST` | `/api/adversary/analyze/{norad_id}` | Trigger full analysis pipeline |
| `GET` | `/api/adversary/analyze/stream` | SSE stream for analysis progress |
| `GET` | `/api/adversary/stats` | Summary stats (counts by country, orbit type, threat level) |

---

## Data Flow Architecture

```
Phase 1: Catalog Build (runs on startup + daily refresh)
  Space-Track SATCAT → filter adversary countries → enrich with UCS/GCAT → store catalog

Phase 2: History Analysis (runs on startup + 6-hour refresh)
  For each catalog entry:
    Space-Track GP_History → maneuver detection → behavioral profiling → store profiles

Phase 3: Intelligence Enrichment (runs on-demand + weekly refresh)
  For each catalog entry:
    Web research + SatNOGS + Gunter's → Claude synthesis → store reports

Phase 4: Threat Assessment (runs continuously, 30-min cycle)
  Catalog + Profiles + Intelligence + Current GP + SOCRATES + US asset list →
    Bayesian scoring → threat rankings → store assessments → push to frontend
```

---

## Storage Strategy

### In-Memory Cache (Phase 1 — Hackathon)

```python
class AdversaryStore:
    catalog: dict[int, AdversarySatellite]      # NORAD ID → satellite
    behavioral_profiles: dict[int, BehavioralProfile]
    intelligence_reports: dict[int, IntelligenceReport]
    threat_assessments: dict[int, ThreatAssessment]

    # Cache metadata
    catalog_last_refresh: datetime
    history_last_refresh: dict[int, datetime]    # Per-satellite
    threats_last_refresh: datetime

    # Static reference data
    ucs_database: dict[int, dict]               # Parsed UCS data
    us_protected_assets: list[ProtectedAsset]    # Our satellites to protect
```

### Future: SQLite/PostgreSQL (Phase 2+)

```sql
CREATE TABLE adversary_satellites (
    norad_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    cospar_id TEXT,
    owner_country TEXT NOT NULL,
    operator TEXT,
    orbit_type TEXT,
    declared_mission TEXT,
    assessed_mission TEXT,
    assessment_confidence REAL,
    capabilities JSONB,
    last_updated TIMESTAMP
);

CREATE TABLE maneuver_events (
    id SERIAL PRIMARY KEY,
    norad_id INTEGER REFERENCES adversary_satellites(norad_id),
    epoch TIMESTAMP NOT NULL,
    maneuver_type TEXT,
    delta_sma_km REAL,
    delta_inc_deg REAL,
    delta_ecc REAL,
    estimated_delta_v_ms REAL
);

CREATE TABLE threat_assessments (
    id SERIAL PRIMARY KEY,
    norad_id INTEGER REFERENCES adversary_satellites(norad_id),
    timestamp TIMESTAMP NOT NULL,
    overall_score INTEGER,
    proximity_score REAL,
    maneuver_score REAL,
    capability_score REAL,
    intent_score REAL,
    trend TEXT,
    reasoning TEXT
);
```

---

## Integration with Existing Codebase

### Reuse Existing Components

| Component | Location | How to Extend |
|-----------|----------|---------------|
| Space-Track client | `backend/app/spacetrack.py` | Add GP_History and SATCAT queries |
| Bayesian scorer | `backend/app/bayesian_scorer.py` | Add maneuver and capability priors |
| Orbital similarity | `backend/app/orbital_similarity_scorer.py` | Score adversary-vs-US-asset pairs |
| Agent base class | `backend/app/agents/base_agent.py` | Inherit for new agents |
| Pipeline pattern | `backend/app/agents/pipeline.py` | Extend with adversary pipeline |
| Threat models | `backend/app/models.py` | Add adversary-specific models |
| SGP4 propagation | `backend/threat_assessment/proximity/data_pipeline.py` | Reuse batch propagation |
| Frontend types | `frontend/types/index.ts` | Add adversary tracking types |
| Zustand stores | `frontend/stores/` | Add adversary store |

### New Dependencies

```
# Add to backend/requirements.txt
TLE-tools>=0.3.0          # TLE parsing into DataFrames
skyfield>=1.48             # Coordinate conversions
httpx>=0.27.0              # Already installed — for CelesTrak/SOCRATES
```

---

## Protected Asset List

The system needs a list of US/allied satellites to protect. Initial seed:

```python
US_PROTECTED_ASSETS = [
    # NRO Reconnaissance
    {"name": "USA-245", "norad_id": 39232, "type": "recon", "orbit": "LEO"},
    {"name": "USA-224", "norad_id": 37348, "type": "recon", "orbit": "LEO"},
    {"name": "USA-314", "norad_id": 54088, "type": "recon", "orbit": "LEO"},

    # GPS Constellation
    {"name": "GPS III SV01-06", "norad_ids": [...], "type": "navigation", "orbit": "MEO"},

    # SBIRS (Missile Warning)
    {"name": "SBIRS GEO-1 through GEO-6", "norad_ids": [...], "type": "missile_warning", "orbit": "GEO"},

    # AEHF (Comms)
    {"name": "AEHF-1 through AEHF-6", "norad_ids": [...], "type": "comms", "orbit": "GEO"},

    # WGS (Wideband Global SATCOM)
    {"name": "WGS-1 through WGS-12", "norad_ids": [...], "type": "comms", "orbit": "GEO"},

    # Allied assets
    {"name": "Skynet 5", "norad_ids": [...], "type": "comms", "orbit": "GEO", "country": "UK"},
]
```

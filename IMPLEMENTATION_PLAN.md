# Adversary Satellite Tracking — Implementation Plan

## Phase 1: Data Layer & API Clients (Foundation)

### 1.1 Space-Track Client Extensions
**Files:** `backend/app/adversary_tracking/api_clients/spacetrack_client.py`

- Extend existing `backend/app/spacetrack.py` with new query methods:
  - `get_adversary_catalog()` — SATCAT filtered by PRC, CIS, IR, NORK
  - `get_gp_history(norad_id, days_back)` — Historical TLE data
  - `get_current_gp(norad_ids)` — Batch current elements
  - `get_cdm_data()` — Conjunction Data Messages
  - `get_boxscore()` — Country-level object counts
- Implement tiered caching (SATCAT: 24hr, GP: 1hr, GP_History: 7 days per satellite)
- Add retry logic with exponential backoff for rate limit errors

### 1.2 CelesTrak Client
**File:** `backend/app/adversary_tracking/api_clients/celestrak_client.py`

- Implement GP data fetching (no-auth fallback to Space-Track)
- SOCRATES conjunction data parser
- SATCAT CSV download and parser
- Predefined group queries (MILITARY, ACTIVE, etc.)
- 2-hour cache aligned with CelesTrak update cycle

### 1.3 Static Data Parsers
**File:** `backend/app/adversary_tracking/api_clients/static_data.py`

- UCS Satellite Database Excel parser → structured dict by NORAD ID
- GCAT TSV parser (satcat, launch log)
- Bundle UCS Excel and GCAT TSVs as data files or fetch on startup

### 1.4 Data Models
**File:** `backend/app/adversary_tracking/models.py`

- Define all Pydantic models: AdversarySatellite, OrbitalElements, ManeuverEvent, BehavioralProfile, ApproachEvent, IntelligenceReport, ThreatAssessment, ProtectedAsset
- Define API response models for each endpoint

---

## Phase 2: Catalog Agent

### 2.1 Catalog Builder
**File:** `backend/app/adversary_tracking/catalog_agent.py`

- On startup: query Space-Track SATCAT for adversary countries
- Parse and store all active adversary payloads
- Cross-reference with UCS Database for mission classification
- Cross-reference with GCAT for additional metadata
- Use Claude (via existing Bedrock integration) to classify:
  - Declared mission vs. suspected mission
  - Satellite bus identification
  - Capability assessment from available data
- Implement catalog refresh (daily)

### 2.2 Adversary Country Definitions
**File:** `backend/app/adversary_tracking/countries.py`

- Define adversary country codes and operators:
  - PRC: PLA Strategic Support Force, CASC, etc.
  - CIS: Russian Aerospace Forces, Roscosmos, etc.
  - IR: Iranian Space Agency, IRGC
  - NORK: NADA (North Korea)
- Map Space-Track COUNTRY_CODE values to display names

---

## Phase 3: History Agent & Maneuver Detection

### 3.1 TLE History Fetcher
**File:** `backend/app/adversary_tracking/history_agent.py`

- For each catalog satellite, fetch GP_History from Space-Track
- Parse into pandas DataFrames using TLE-tools
- Compute derived elements (semi-major axis from mean motion)
- Store time-series in memory with per-satellite refresh tracking

### 3.2 Maneuver Detection Engine
**File:** `backend/app/adversary_tracking/maneuver_detector.py`

- Implement element discontinuity detection:
  - Delta SMA threshold: >1.0 km
  - Delta INC threshold: >0.01 deg
  - Delta ECC threshold: >0.001
- Account for natural perturbations:
  - J2 RAAN precession model
  - Atmospheric drag decay rate model
  - Subtract expected natural drift before threshold check
- Classify maneuver types: altitude_raise, altitude_lower, plane_change, eccentricity_change
- Estimate delta-v using vis-viva equation
- Compute maneuver statistics: frequency, timing patterns, total delta-v budget used
- Flag anomalies: dormant reactivation, frequency changes, coordinated maneuvers

### 3.3 Approach Detection
- Cross-reference maneuver timing with proximity events
- Detect: "satellite maneuvered toward target X"
- Track history of approaches to foreign (especially US) assets
- Compute closest approach distance for each proximity event

---

## Phase 4: Research Agent (Intelligence Enrichment)

### 4.1 Web Research Pipeline
**File:** `backend/app/adversary_tracking/research_agent.py`

- For each satellite, construct search queries:
  - `"{satellite_name}" mission capabilities`
  - `"{satellite_name}" {cospar_id} specifications`
  - `"{program_name}" satellite program PLA` (for Chinese sats)
- Use Claude to extract and synthesize findings
- Categorize sources: news, academic, defense journal, government report
- Assign confidence levels to assessments

### 4.2 SatNOGS Integration
**File:** `backend/app/adversary_tracking/api_clients/satnogs_client.py`

- Query SatNOGS for radio transmitter data per satellite
- Extract: frequencies, modes, last active date
- Flag satellites with unusual RF emissions or frequency changes

### 4.3 Knowledge Graph
- Link satellites by: same launch, same program, same orbit regime
- Identify constellation patterns (e.g., Yaogan NOSS-style triplets)
- Track co-launched objects and their relationships

---

## Phase 5: Threat Assessment Agent

### 5.1 Threat Scorer
**File:** `backend/app/adversary_tracking/threat_agent.py`

- Compute multi-factor threat score (0-100):
  - **Proximity** (40% weight): Distance to nearest US asset, closing rate
  - **Maneuver** (25% weight): Recent maneuvers toward US assets, increasing frequency
  - **Capability** (20% weight): RPO-capable, maneuverable, has sensors
  - **Intent** (15% weight): Military operator, known proxy ops history
- Extend existing Bayesian scorer with new priors for maneuver and capability data
- Compute trend (increasing/stable/decreasing) from score history

### 5.2 Conjunction Monitoring
- Ingest SOCRATES data from CelesTrak
- Filter for adversary-vs-US-asset conjunctions
- Combine with Space-Track CDMs when available
- Alert on predicted close approaches within 100 km

### 5.3 Continuous Assessment Loop
- Run every 30 minutes (configurable)
- Update all threat scores
- Detect score changes and generate alerts
- Push updates to frontend via SSE/WebSocket

---

## Phase 6: Backend API Routes

### 6.1 Route Definitions
**File:** `backend/app/routes/adversary.py`

- Implement all endpoints from Architecture doc
- Wire up to FastAPI router with proper error handling
- Add SSE endpoint for real-time analysis streaming
- Add query parameter filtering (country, orbit_type, min_threat_score)

### 6.2 Pipeline Orchestrator
**File:** `backend/app/adversary_tracking/pipeline.py`

- Coordinate agent execution order:
  1. Catalog Agent (build/refresh catalog)
  2. History Agent (fetch and analyze TLE history) — parallelized per satellite
  3. Research Agent (enrich with intelligence) — parallelized per satellite
  4. Threat Agent (compute assessments) — after all others complete
- Support on-demand single-satellite analysis via POST endpoint
- Stream progress via SSE (reuse existing `backend/app/routes/stream.py` pattern)

---

## Phase 7: Frontend Integration

### 7.1 Adversary Dashboard Page
**File:** `frontend/components/adversary/adversary-dashboard.tsx`

- New top-level tab/page in the dashboard
- Summary stats cards: total adversary sats by country, orbit type, threat level
- Sortable/filterable table of all tracked adversary satellites
- Click-through to detail view

### 7.2 Satellite Detail Panel
**File:** `frontend/components/adversary/adversary-detail.tsx`

- Full satellite profile with all metadata
- Maneuver timeline visualization
- Approach history chart
- Intelligence report display
- Threat score gauge with trend indicator

### 7.3 Globe Integration
- Add adversary satellite markers to existing 3D globe (different color/icon)
- Show threat lines between adversary sats and nearest US assets
- Highlight satellites with high threat scores
- Animate maneuver arcs from history data

### 7.4 Zustand Store
**File:** `frontend/stores/adversary-store.ts`

- Adversary catalog state
- Selected satellite state
- Threat assessment state
- Polling/refresh logic

### 7.5 TypeScript Types
**File:** `frontend/types/adversary.ts`

- Mirror all backend Pydantic models as TypeScript interfaces

---

## Milestone Summary

| Phase | Description | Key Deliverable |
|-------|-------------|-----------------|
| 1 | Data Layer & API Clients | Working API clients with caching |
| 2 | Catalog Agent | Complete adversary satellite list with mission data |
| 3 | History Agent | Maneuver detection from TLE history |
| 4 | Research Agent | Intelligence enrichment via web + databases |
| 5 | Threat Agent | Scored threat assessments with trends |
| 6 | Backend Routes | Full REST API for adversary tracking |
| 7 | Frontend | Dashboard, detail views, globe integration |

---

## File Structure

```
backend/app/adversary_tracking/
    __init__.py
    models.py                    # Pydantic data models
    countries.py                 # Adversary country definitions
    catalog_agent.py             # Maintains adversary satellite list
    history_agent.py             # Pulls and analyzes TLE history
    maneuver_detector.py         # Detects maneuvers from TLE time series
    research_agent.py            # Web search for intelligence enrichment
    threat_agent.py              # Combines data into threat assessments
    pipeline.py                  # Orchestrates all agents
    store.py                     # In-memory data store
    api_clients/
        __init__.py
        spacetrack_client.py     # Extended Space-Track queries
        celestrak_client.py      # CelesTrak GP + SOCRATES
        satnogs_client.py        # SatNOGS radio frequency data
        keeptrack_client.py      # KeepTrack API
        static_data.py           # UCS Database + GCAT parsers
    data/
        ucs_satellite_database.xlsx   # Bundled UCS data (if downloaded)
        us_protected_assets.json      # List of US/allied satellites to protect

backend/app/routes/
    adversary.py                 # FastAPI route definitions

frontend/
    components/adversary/
        adversary-dashboard.tsx
        adversary-detail.tsx
        adversary-table.tsx
        threat-gauge.tsx
        maneuver-timeline.tsx
    stores/
        adversary-store.ts
    types/
        adversary.ts
```

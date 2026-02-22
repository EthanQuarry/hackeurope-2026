# Adversary Satellite Tracking — API & Data Source Research

## Executive Summary

We identified **15+ data sources** for building an adversary satellite tracking system. The best approach combines Space-Track.org (authoritative historical TLEs), CelesTrak (free real-time data + conjunction assessments), the UCS Satellite Database (mission/capability data), and Jonathan McDowell's GCAT (comprehensive catalog metadata). Our existing codebase already integrates Space-Track via two client implementations.

---

## 1. Primary Data Sources

### 1.1 Space-Track.org (US Space Force — 18th Space Defense Squadron)

| Property | Value |
|----------|-------|
| **URL** | https://www.space-track.org |
| **Auth** | Username/password (free registration) |
| **Rate Limits** | 30 req/min, 300 req/hr; GP: 1 pull/hr; SATCAT: 1/day; CDM: 3/day |
| **Formats** | JSON, CSV, XML, KVN, TLE, 3LE, HTML |
| **Historical Data** | 138M+ GP_History records going back decades |
| **Already Integrated** | Yes — `backend/app/spacetrack.py` + `backend/threat_assessment/spacetrack_loader.py` |

**Key Data Classes:**

| Class | Description | Use Case |
|-------|-------------|----------|
| `GP` | Current orbital elements (newest per object) | Real-time tracking |
| `GP_History` | All historical element sets (138M+ records) | Maneuver detection, behavioral analysis |
| `SATCAT` | Satellite catalog metadata (24 fields) | Owner, launch date, object type, RCS size |
| `CDM` | Conjunction Data Messages (collision warnings) | Proximity/threat assessment |
| `Decay` | Reentry predictions | Object lifecycle tracking |
| `Boxscore` | Country-level object counts | Adversary fleet sizing |

**Country Filtering:** `COUNTRY_CODE` field supports direct filtering: `PRC` (China), `CIS` (Russia/CIS), `US`, `JPN`, `FR`, `UK`, `ESA`, etc.

**GP/GP_History Schema (40 fields):** NORAD_CAT_ID, OBJECT_NAME, OBJECT_ID, EPOCH, MEAN_MOTION, ECCENTRICITY, INCLINATION, RA_OF_ASC_NODE, ARG_OF_PERICENTER, MEAN_ANOMALY, SEMIMAJOR_AXIS, PERIOD, APOAPSIS, PERIAPSIS, BSTAR, COUNTRY_CODE, OBJECT_TYPE, RCS_SIZE, LAUNCH_DATE, DECAY_DATE, CLASSIFICATION_TYPE, TLE_LINE1, TLE_LINE2, and more.

**Example Queries:**
```
# All active Chinese payloads
/class/gp/COUNTRY_CODE/PRC/OBJECT_TYPE/PAYLOAD/DECAY_DATE/null-val/format/json

# ISS TLE history (last 30 days)
/class/gp_history/norad_cat_id/25544/CREATION_DATE/>now-30/orderby/epoch desc/format/json

# Multiple countries
/class/gp/COUNTRY_CODE/PRC,CIS/OBJECT_TYPE/PAYLOAD/DECAY_DATE/null-val/format/json
```

**Python Library:** `spacetrack` v1.4.0 (MIT, auto-rate-limiting, async support, parameter validation)

```python
from spacetrack import SpaceTrackClient
import spacetrack.operators as op

with SpaceTrackClient(identity=user, password=pw) as st:
    chinese_sats = st.gp(format="json", country_code="PRC", object_type="PAYLOAD", decay_date="null-val")
    history = st.gp_history(norad_cat_id=48078, orderby="epoch asc", format="json")
```

---

### 1.2 CelesTrak

| Property | Value |
|----------|-------|
| **URL** | https://celestrak.org |
| **Auth** | None required |
| **Rate Limits** | Soft — data updates every 2 hours; 100+ errors in 2hr triggers IP block |
| **Formats** | TLE, 3LE, 2LE, XML, KVN, JSON, CSV |
| **Historical Data** | Limited (first/last epoch only) |

**Key Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `/NORAD/elements/gp.php?CATNR={id}&FORMAT=JSON` | GP data by NORAD ID |
| `/NORAD/elements/gp.php?GROUP={name}&FORMAT=JSON` | Predefined groups (MILITARY, ACTIVE, etc.) |
| `/SOCRATES/search.php?CATNR={id}&ORDER=MINRANGE` | Conjunction assessment data |
| `/pub/satcat.csv` | Full satellite catalog CSV |
| `/NORAD/elements/supplemental/sup-gp.php` | Operator-provided supplemental data |

**Predefined Groups (40+):** `military`, `active`, `stations`, `starlink`, `oneweb`, `geo`, `weather`, `gps-ops`, `beidou`, `last-30-days`, `cosmos-1408-debris`, etc.

**SOCRATES Conjunction Data:**
- Runs 3x daily, predicts close approaches within 5 km over next 7 days
- Fields: NORAD IDs, TCA (time of closest approach), range (km), relative speed (km/s), collision probability
- Free — no auth required

**Key Limitation:** CelesTrak JSON lacks `SEMIMAJOR_AXIS`, `COUNTRY_CODE`, and `OBJECT_TYPE` fields. Must cross-reference with SATCAT or Space-Track.

---

### 1.3 UCS Satellite Database

| Property | Value |
|----------|-------|
| **URL** | https://www.ucs.org/resources/satellite-database |
| **Auth** | None (direct download) |
| **Format** | Excel (.xlsx) / TSV |
| **Records** | 7,560+ operational satellites |
| **Update Frequency** | Periodic (last noted May 2023) |

**28 Fields Per Satellite Including:**
- Owner country, operator, users (military/civil/commercial)
- Purpose, detailed use type
- Orbit class, apogee, perigee, inclination, period
- Launch date, expected lifetime, contractor/manufacturer
- Mass, power

**Why It's Critical:** The ONLY open-source database categorizing satellites by mission purpose and military vs. civilian use. No orbital tracking API provides this capability/mission data.

---

### 1.4 Jonathan McDowell's GCAT

| Property | Value |
|----------|-------|
| **URL** | https://planet4589.org/space/gcat/ |
| **Auth** | None |
| **Format** | TSV (tab-separated) |
| **License** | CC-BY |
| **Coverage** | All artificial space objects since 1957 |

**Available Catalogs:** satcat, auxcat, ftocat (failed to orbit), deepcat, landercat, active catalog, geosync catalog, orbital launch log.

**Why It's Critical:** Most comprehensive independent catalog. Includes objects not in the US Space Command catalog. Provides owner, manufacturer, mission type context. The definitive reference cited by the academic space community.

---

## 2. Secondary Data Sources

### 2.1 KeepTrack API

| Property | Value |
|----------|-------|
| **URL** | https://api.keeptrack.space/v2/ |
| **Auth** | None |
| **License** | CC BY-NC 4.0 |

Comprehensive free API: multiple coordinate systems (ECI, ECF, LLA, RAE), TLE/OMM data, SOCRATES conjunction data, SATCAT, metrics. Has N2YO-compatible endpoints. Covers 50,000+ objects.

### 2.2 N2YO API

| Property | Value |
|----------|-------|
| **URL** | https://api.n2yo.com/rest/v1/satellite/ |
| **Auth** | Free API key |
| **Rate Limits** | 1,000 TLE req/hr; 100 pass req/hr |

Real-time positions, TLE data, visual/radio pass predictions, "what's above" queries. 50+ satellite categories. No historical data.

### 2.3 SatChecker (IAU CPS)

| Property | Value |
|----------|-------|
| **URL** | https://satchecker.cps.iau.org |
| **Auth** | None |

Satellite ephemeris with **illumination status**, phase angle, FOV intersection queries. TLE history back to July 2019. Built for astronomers.

### 2.4 SatNOGS Database

| Property | Value |
|----------|-------|
| **URL** | https://db.satnogs.org/api/ |
| **Auth** | None for reads |

**Only open-source database of satellite radio frequencies**, communication modes, and decoded telemetry from a global ground station network. Unique for SIGINT-related analysis.

### 2.5 ESA DISCOS

| Property | Value |
|----------|-------|
| **URL** | https://discosweb.esoc.esa.int |
| **Auth** | ESA SSO account (OAuth2) |

Physical properties of space objects (mass, dimensions, shape, material). Best source for object characterization. Useful for debris modeling.

---

## 3. Commercial SDA Providers

### 3.1 LeoLabs
- **Sensor:** Phased-array radar network (LEO focus)
- **Capabilities:** Sub-10cm debris tracking, maneuver detection, pattern-of-life analysis
- **API:** OAuth2 REST (requires commercial account)
- **Unique:** Only commercial provider with independent radar tracking

### 3.2 ExoAnalytic Solutions
- **Sensor:** 300+ optical telescopes globally
- **Capabilities:** GEO/MEO/cislunar tracking, adversarial behavior detection, RPO monitoring
- **API:** Contract-based
- **Unique:** Largest commercial optical network, strong in GEO where radar is weak

### 3.3 Slingshot Aerospace
- **Capabilities:** AI-powered SDA platform, TALOS AI agent, Seradata historical data
- **API:** REST APIs + MCP (Model Context Protocol) servers
- **Unique:** Acquired Seradata; MCP integration for AI agents

### 3.4 Kayhan Space / Satcat.com
- **URL:** https://satcat.com
- **Capabilities:** 71,705+ objects, conjunction monitoring, 3D visualization
- **Pricing:** Free tier available
- **Unique:** Modern web-based UX, free conjunction assessment

### 3.5 Comspoc (Spacebook)
- **URL:** https://spacebook.com
- **Capabilities:** Independent commercial catalog, XP-TLEs, synthetic covariance
- **API:** Free data downloads with automation API
- **Unique:** XP-TLEs are higher precision than standard Space-Track TLEs

### 3.6 Privateer Space
- **Capabilities:** Multi-domain fusion (space + maritime + air + cyber), GNSS interference detection
- **API:** Enterprise/contract
- **Unique:** All-domain intelligence platform

---

## 4. Gunter's Space Page (Satellite Specifications)

| Property | Value |
|----------|-------|
| **URL** | https://space.skyrocket.de |
| **Auth** | None |
| **Format** | Web pages only (scraping required) |

Most detailed publicly available source for satellite specifications and capabilities — especially military/intelligence satellites. Individual pages contain mass, power, antenna specs, sensor resolution.

---

## 5. Python Libraries

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| **sgp4** | 2.25 | TLE propagation (SGP4/SDP4 algorithms) | Active, already installed |
| **spacetrack** | 1.4.0 | Space-Track.org API client | Active, already installed |
| **TLE-tools** | latest | Parse TLEs into DataFrames for analysis | Active, **recommended addition** |
| **skyfield** | latest | Coordinate conversions, pass prediction | Active, **recommended addition** |
| **czml3** | latest | Cesium 3D visualization data generation | Active (forked) |
| **poliastro** | 0.17.0 | Orbital mechanics (Lambert solver) | **Archived** — not recommended |
| **astropy** | 7.2.0 | Coordinate frames, time systems | Active but heavy dependency |

---

## 6. Answers to Research Questions

### Q1: Which APIs provide historical TLE data going back years?
**Space-Track GP_History** — 138M+ records, decades of history. This is the definitive source. CelesTrak provides only first/last epoch. SatChecker has data back to July 2019.

### Q2: Which APIs can detect maneuvers automatically?
**None of the free APIs provide automatic maneuver detection.** LeoLabs (commercial) offers maneuver detection as a paid service. For free sources, maneuvers must be inferred by analyzing GP_History for discontinuities in semi-major axis, inclination, and eccentricity between consecutive TLEs. We will implement this ourselves.

### Q3: How do we get a list of all Chinese/Russian military satellites?
1. **Space-Track:** `gp(country_code="PRC,CIS", object_type="PAYLOAD", decay_date="null-val")`
2. **CelesTrak:** `gp.php?GROUP=MILITARY` for all military sats (not country-filtered)
3. **UCS Database:** Filter by country + "military" user type — most accurate for mission classification
4. **GCAT:** TSV download with owner field
5. **Cross-reference all sources** for comprehensive coverage

### Q4: Is there an API for satellite capability/mission data, or do we need to scrape?
**No single API.** Best approach:
- **UCS Database** (downloadable Excel): Purpose, user type, mass, power
- **Gunter's Space Page** (web scraping): Detailed technical specifications
- **GCAT** (TSV download): Owner, manufacturer, mission type
- **SatNOGS** (API): Radio frequencies and communication capabilities
- **AI enrichment**: Use Claude to research and synthesize from web sources

### Q5: What are the rate limits and auth requirements for each API?

| Source | Auth | Rate Limit |
|--------|------|------------|
| Space-Track | Username/password | 30/min, 300/hr |
| CelesTrak | None | 2-hour update cycle |
| N2YO | API key | 1,000 TLE/hr |
| KeepTrack | None | Implicit throttling |
| SatChecker | None | Not published |
| SatNOGS | None (reads) | Not published |
| UCS Database | None | Manual download |
| GCAT | None | HTTP download |
| ESA DISCOS | ESA SSO (OAuth2) | Not published |

### Q6: Are there any APIs specifically for conjunction/close approach data?
1. **CelesTrak SOCRATES** — Free, 3x daily, 7-day predictions, within 5 km
2. **Space-Track CDMs** — Official Conjunction Data Messages (3/day limit)
3. **KeepTrack** `/v2/socrates/latest` — Mirrors CelesTrak SOCRATES data
4. **Kayhan Satcat** — Free conjunction monitoring via web platform
5. **Comspoc Spacebook** — XP-TLEs with synthetic covariance for better conjunction assessment

### Q7: What commercial APIs does the Space Force actually use?
The US Space Force procures from **LeoLabs, ExoAnalytic, Slingshot Aerospace, Comspoc, and Numerica** through the Commercial Space Domain Awareness (CSDA) program and Commercial Integration Cell (CIC). Data feeds into the Unified Data Library (UDL). Emphasis on GEO/cislunar tracking and independent verification.

---

## 7. Data Source Integration Priority

### Tier 1 — Implement Immediately (Free, API access)
1. **Space-Track GP_History** — Historical TLE analysis and maneuver detection
2. **Space-Track SATCAT** — Catalog enrichment (owner, launch date, RCS)
3. **CelesTrak SOCRATES** — Free conjunction assessment data
4. **CelesTrak GP groups** — Quick access to MILITARY, ACTIVE groups

### Tier 2 — Implement Soon (Free, download/parse)
5. **UCS Satellite Database** — Mission purpose and capability data
6. **GCAT (McDowell)** — Comprehensive catalog cross-reference
7. **SatNOGS** — Radio frequency data for SIGINT analysis

### Tier 3 — Future Enhancement (Requires accounts/scraping)
8. **Comspoc Spacebook** — XP-TLEs for higher precision
9. **ESA DISCOS** — Physical properties (mass, dimensions)
10. **Gunter's Space Page** — Technical specifications (web scraping)
11. **KeepTrack API** — Alternative coordinate computations

### Tier 4 — Commercial (Requires contracts)
12. LeoLabs — Independent radar tracking
13. ExoAnalytic — GEO/cislunar optical tracking
14. Slingshot — AI-powered analytics

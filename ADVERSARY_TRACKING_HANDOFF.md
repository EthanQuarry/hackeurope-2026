# Adversary Satellite Research Agent — Handoff Document

## What We Built

A single deep-research agent that takes a NORAD satellite ID, queries real APIs (Space-Track + Perplexity), and produces a structured intelligence dossier.

---

## Files Created

```
backend/agents/
├── adversary_research_agent.py   # The agent (551 lines)
└── adversary_routes.py           # FastAPI routes (278 lines)
```

**Modified:** `backend/app/main.py` — added import + router registration.

---

## How It Works

### The Agent (`adversary_research_agent.py`)

Inherits from `BaseAgent` (in `backend/app/agents/base_agent.py`) which provides:
- Claude Sonnet 4 via AWS Bedrock
- A tool-use loop (`_run_with_tools`) that lets Claude call tools iteratively
- Progress streaming via `on_progress` callback

The agent gives Claude **3 tools**:

| Tool | What It Calls | Returns |
|------|--------------|---------|
| `search_perplexity` | Perplexity Sonar API (`api.perplexity.ai/chat/completions`) | Web research results + citations |
| `query_spacetrack_catalog` | Space-Track SATCAT + GP endpoints | Official satellite metadata (name, country, launch date, RCS, orbit) |
| `query_spacetrack_history` | Space-Track GP_History endpoint | Up to 730 days of orbital elements + auto-detected maneuvers |

**Flow:**
1. Claude receives a prompt: "Research NORAD 48078 (SHIJIAN-21)"
2. Claude calls `query_spacetrack_catalog` → gets official metadata
3. Claude calls `query_spacetrack_history` → gets orbital history + maneuver detections
4. Claude calls `search_perplexity` 3+ times → OSINT on mission, program, operator
5. Claude synthesizes everything into a JSON dossier

**Maneuver detection** is built into the history tool handler — it compares consecutive TLE records and flags discontinuities:
- Semi-major axis change > 1.0 km → altitude maneuver
- Inclination change > 0.01° → plane change
- Eccentricity change > 0.001 → orbit shape change
- Estimates delta-v via vis-viva equation

### The Routes (`adversary_routes.py`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/adversary/catalog` | GET | Lists adversary satellites from Space-Track (PRC, CIS, IR, NORK). Cached 1hr. |
| `/api/adversary/research/stream` | GET | SSE stream — runs the agent, streams progress events + final dossier |
| `/api/adversary/research` | POST | Non-streaming — runs agent, returns full dossier as JSON |

**SSE event types emitted:**
- `scan` — initial status
- `context` — agent starting
- `tool_call` — when agent calls a tool
- `reasoning` — agent thinking/progress text
- `tool_result` — key findings (mission assessment, maneuver count)
- `intent` — threat level classification
- `dossier` — the full JSON dossier object
- `complete` — done

---

## Output: The Dossier

The agent produces a JSON object like:

```json
{
  "norad_id": 48078,
  "name": "SHIJIAN-21",
  "cospar_id": "2021-094A",
  "owner_country": "PRC",
  "operator": "PLA Strategic Support Force",
  "launch_date": "2021-10-23",
  "orbit_type": "GEO",

  "declared_mission": "Space debris mitigation technology demo",
  "assessed_mission": "GEO inspection and proximity operations",
  "confidence": 0.85,

  "capabilities": {
    "maneuverable": true,
    "has_robotic_arm": true,
    "has_proximity_ops": true,
    "sensors": ["optical", "RF"],
    "satellite_bus": "DFH-5",
    "mass_kg": 3000
  },

  "behavioral_history": {
    "total_maneuvers_detected": 23,
    "last_maneuver_date": "2025-02-01",
    "maneuver_frequency_days": 45,
    "maneuver_types": {"altitude_raise": 10, "altitude_lower": 8, "plane_change": 5},
    "behavioral_pattern": "Active GEO inspector, 2-3 foreign approaches per year"
  },

  "program_context": {
    "program_name": "Shijian series",
    "related_satellites": ["SJ-17", "SJ-20", "SJ-23"],
    "program_history": "...",
    "military_significance": "..."
  },

  "threat_assessment": {
    "threat_level": "high",
    "threat_score": 62,
    "reasoning": "Moved 200km closer to USA-267 over past 30 days...",
    "key_concerns": ["Active RPO capability", "Approaching US GEO assets"],
    "recommended_monitoring": ["Daily TLE tracking", "Optical tasking"]
  },

  "intelligence_sources": [
    {"type": "orbital_data", "title": "Space-Track GP_History", "summary": "..."},
    {"type": "news", "title": "...", "summary": "..."},
    {"type": "academic", "title": "...", "summary": "..."}
  ]
}
```

---

## Environment Requirements

```env
# Already in .env:
SPACETRACK_USER=...
SPACETRACK_PASS=...
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Must add:
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxx
```

---

## How to Test

```bash
# List Chinese + Russian active payloads
curl "http://localhost:8000/api/adversary/catalog?country=PRC,CIS"

# Stream deep research on Shijian-21
curl -N "http://localhost:8000/api/adversary/research/stream?norad_id=48078&name=SHIJIAN-21"

# Non-streaming version
curl -X POST "http://localhost:8000/api/adversary/research?norad_id=48078&name=SHIJIAN-21"
```

---

## What's NOT Built Yet (Frontend Needed)

The backend is complete and working. The frontend needs:

1. **A way to select a satellite** — either from the adversary catalog or by typing a NORAD ID
2. **A research trigger** — button to kick off the SSE stream
3. **A streaming terminal** — show progress events as the agent works (reuse existing SSE terminal pattern)
4. **A dossier display** — render the final dossier JSON in a structured, readable format
5. **Integration with the globe** — highlight the researched satellite on the 3D view

### Existing Frontend Patterns to Reuse

- **SSE consumption:** The existing analysis terminal already connects to `/analysis/stream` and renders events. Same pattern works for `/api/adversary/research/stream`.
- **API client:** `frontend/lib/api.ts` has the `fetchJSON` helper and endpoint registry.
- **State management:** Zustand stores in `frontend/stores/`.
- **UI components:** Shadcn/Tailwind throughout.

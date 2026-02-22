# 3D Globe Visualization — Technical Build Plan

> **Scope**: The interactive 3D satellite map component only. Not the surrounding UI (sidebars, panels, dashboards). This globe sits inside whatever layout the main UI provides and exposes props/callbacks for integration.

---

## Architecture Overview

```
<GlobeView>                          ← React Three Fiber <Canvas>
├── <Stars />                        ← 3-layer parallax starfield (drei)
├── <Earth />                        ← Textured sphere + atmosphere + graticule
├── <DebrisCloud />                  ← InstancedMesh for 2500+ debris objects
├── <Satellite /> × N                ← Tracked satellites with orbit trails
├── <ThreatIndicator /> × N          ← Proximity alerts / threat visualization
├── <ManeuverAnimation />            ← Delta-V event visualization
├── <CollisionEffect />              ← Flash + expanding ring at impact point
├── <OrbitControls />                ← Interactive camera (drei)
└── <AnimationDriver />              ← Central clock for simulation time
```

---

## Dependencies

```json
{
  "three": "^0.173.0",
  "@react-three/fiber": "^9.5.0",
  "@react-three/drei": "^10.7.7",
  "satellite.js": "^6.0.2",
  "zustand": "^4.5.0"
}
```

| Package | Why |
|---------|-----|
| `three` | Core WebGL 3D engine |
| `@react-three/fiber` | Declarative React renderer for Three.js scenes |
| `@react-three/drei` | Pre-built components: `Stars`, `OrbitControls`, `Line` — saves hundreds of lines of boilerplate |
| `satellite.js` | SGP4 orbit propagation from real TLE data. Gives physically accurate satellite positions |
| `zustand` v4 | Shared state between 3D scene and React UI (selected satellite, sim time, speed, threat alerts) |

---

## Coordinate System

All 3D positions use **Earth-Centered Inertial (ECI)** coordinates scaled to a **unit sphere** (Earth radius = 1.0 in scene units).

```ts
// lib/geo.ts
const EARTH_RADIUS_KM = 6378.137;

function geodeticToSceneVec3(latDeg: number, lonDeg: number, altKm: number): [number, number, number] {
  const lat = latDeg * (Math.PI / 180);
  const lon = lonDeg * (Math.PI / 180);
  const r = 1 + altKm / EARTH_RADIUS_KM;
  return [
    r * Math.cos(lat) * Math.cos(lon),   // X
    r * Math.sin(lat),                     // Y (up = north)
    -r * Math.cos(lat) * Math.sin(lon)    // Z
  ];
}
```

**Validation**: Always check output magnitude is between 0.9–10.0 to catch bad conversions early.

---

## Component Specifications

### 1. `<Earth />`

**Textured globe with atmosphere and grid lines.**

- **Sphere**: 64×64 segments, radius 1.0
- **Texture**: Blue Marble day map (`/textures/earth/blue-marble-day.jpg`)
  - `SRGBColorSpace`, anisotropy up to 8×
  - `LinearMipmapLinearFilter` (min) / `LinearFilter` (mag)
  - Fallback solid color `#0d3b66` if texture fails to load
- **Atmosphere**: Second sphere at 1.015 scale, `meshBasicMaterial`, color `#73a5ff`, opacity 0.1, `BackSide` rendering
- **Graticule** (grid lines):
  - Latitude lines at [-60, -30, 0, 30, 60]° — white, 0.28 opacity
  - Longitude lines at 30° intervals — white, 0.25 opacity
  - Rendered 0.2% above surface (scale 1.002) to prevent z-fighting
  - Use drei `<Line>` component, 2° point resolution
- **Rotation**: Slow continuous Y-axis spin at 0.0007 rad/frame (optional, disable when OrbitControls active)

### 2. `<Stars />`

**Three-layer parallax starfield using drei `<Stars>`.**

| Layer | Radius | Depth | Count | Factor | Speed |
|-------|--------|-------|-------|--------|-------|
| Outer | 110 | 70 | 2600 | 13.8 | 0.15 |
| Mid | 112 | 75 | 1400 | 20.4 | 0.18 |
| Inner | 115 | 80 | 650 | 25.8 | 0.12 |

All layers: `saturation={0}` (white/grey), `fade={true}`.

The three layers at slightly different speeds create a subtle parallax depth effect when the camera moves.

### 3. `<DebrisCloud />`

**InstancedMesh rendering 2500+ debris objects in a single draw call.**

This is the most performance-critical component. Without instancing, 2500 separate meshes would kill the frame rate.

```
Geometry: SphereGeometry(1, 6, 6)  — low poly, tiny on screen
Scale per instance: 0.006 scene units
Color: Amber #f59e0b, opacity 0.9
```

**Drift simulation** (per-frame in `useFrame`):
- Each debris particle gets a random linear drift + oscillation on init
- Per frame: update each instance's 4×4 matrix via `instancedMesh.setMatrixAt(i, matrix)`
- Call `instancedMesh.instanceMatrix.needsUpdate = true` once per frame

**Data source**: Fetch from API endpoint, refresh every 15 seconds. Use `AbortController` to cancel stale requests on cleanup.

### 4. `<Satellite />`

**Individual tracked satellite with orbit trail and selection.**

Props:
```ts
interface SatelliteProps {
  id: string;
  trajectory: TrajectoryPoint[];  // { t: number, lat: number, lon: number, alt_km: number }
  color?: string;                 // default: #22d3ee (cyan)
  size?: number;                  // default: 0.014
  selected?: boolean;
  onSelect?: (id: string) => void;
}
```

**Position tracking**:
- Binary search through trajectory time array to find current position
- Linear interpolation (lerp) between adjacent points
- Smooth position damping factor: 0.08 (don't snap, glide)

**Orbit trail**:
- Show 20% of full orbit as a fading line behind the satellite
- Min 10 points displayed
- Use drei `<Line>` with vertex colors fading from full opacity to transparent
- Sample max ~800 points per trail for performance

**Glow effect**:
- Second mesh at 2.5× satellite size, same color, 0.3 opacity
- Creates a soft halo around each satellite dot

**Threat state colors** (driven by Orbital Shield's threat classification):

| State | Color | Meaning |
|-------|-------|---------|
| Nominal | Cyan `#22d3ee` | Normal operations |
| Watched | Amber `#f59e0b` | Under observation, flagged by Layer 1 |
| Threatened | Red `#ef4444` | Active threat detected |
| Friendly | Green `#10b981` | Confirmed friendly / own asset |

### 5. `<ThreatIndicator />`

**Visual overlay for proximity threats between two objects.**

When a foreign satellite enters proximity of a defended asset:
- Dashed line connecting the two objects
- Distance label updating in real-time (km)
- Pulsing ring around the threatened asset
- Color ramps from amber → red as distance decreases:
  - `> 50 km`: white
  - `< 50 km`: amber
  - `< 1 km`: red

### 6. `<ManeuverAnimation />`

**Visualizes delta-V events (evasive maneuvers, hostile repositioning).**

When a maneuver fires:
1. **0–0.3s**: Trail color ramps to red
2. **0.3–2.5s**: Hold red, line width pulses from 1.4 → 2.4
3. **2.5–3.5s**: Fade back to normal color
4. Satellite marker scales 1.0 → 1.5× then back

**Orbit perturbation**: Visually shift trail points by delta-V magnitude:
```
shift = clamp(dvMagnitude * 0.004, 0.002, 0.008)  // scene units
```

### 7. `<CollisionEffect />`

**Flash + expanding shockwave at predicted collision point.**

- **Activation window**: -2s to +60s around predicted TCA (Time of Closest Approach)
- **Central flash**: Sphere pulsing with `sin(dt * 3)`, base scale 0.02, white emissive
- **Expansion ring**: BackSide sphere, expands from 0.03 → 0.18 over 10s, opacity 0.6 → 0 over 60s
- **Color**: White flash center, red-orange ring

### 8. `<OrbitControls />`

**Interactive camera using drei's OrbitControls.**

```
enablePan: true
enableZoom: true
minDistance: 1.5        ← can't clip inside Earth
maxDistance: 20         ← can't zoom out to infinity
enableDamping: true
dampingFactor: 0.05    ← smooth, not sluggish
```

### 9. `<AnimationDriver />`

**Central simulation clock decoupled from React renders.**

```ts
// Use a ref for simulation time — avoids re-rendering the entire scene every tick
const simTimeRef = useRef(Date.now());
const speedRef = useRef(1);  // 1x, 5x, 10x, 25x, 50x, 100x

useFrame((_, delta) => {
  simTimeRef.current += delta * 1000 * speedRef.current;
});
```

Speed presets: `[1, 5, 10, 25, 50, 100]`

**Key pattern**: All child components read `simTimeRef.current` inside their own `useFrame` — this keeps animation perfectly synchronized without triggering React re-renders. Only update React state (for UI display) every 250ms.

---

## State Management (Zustand Store)

```ts
interface GlobeStore {
  // Simulation
  simTime: number;
  speed: number;
  playing: boolean;

  // Selection
  selectedSatelliteId: string | null;
  hoveredSatelliteId: string | null;

  // Data
  satellites: SatelliteData[];
  debris: DebrisData[];
  threats: ThreatData[];

  // Actions
  setSpeed: (speed: number) => void;
  togglePlaying: () => void;
  selectSatellite: (id: string | null) => void;
}
```

The store is shared between the 3D canvas and any surrounding UI panels (threat list, satellite details, timeline controls).

---

## Performance Budget

| Metric | Target |
|--------|--------|
| Frame rate | 60 FPS with 2500 debris + 50 tracked satellites |
| Debris render | Single InstancedMesh draw call |
| Trail points | Max 800 per satellite |
| API refresh (debris) | Every 15s |
| API refresh (orbits) | Every 30s |
| React re-renders | Max 4 Hz for UI state (250ms throttle) |
| 3D animation | Full refresh rate (useFrame every frame) |

**Critical rule**: Never call `setState` inside `useFrame`. Use refs for anything that changes every frame. Only sync to React state on a throttled interval for UI display.

---

## Canvas Setup

```tsx
<Canvas
  camera={{ position: [0, 2, 3.5], fov: 45, near: 0.01, far: 300 }}
  gl={{ antialias: true, alpha: false }}
  style={{ background: "#000006" }}
  dpr={[1, 2]}  // Retina support, capped at 2× to save GPU
>
  {/* Scene contents here */}
</Canvas>
```

---

## File Structure

```
frontend/
├── components/
│   └── globe/
│       ├── GlobeView.tsx          ← Main canvas + scene composition
│       ├── Earth.tsx              ← Textured sphere + atmosphere + graticule
│       ├── DebrisCloud.tsx        ← InstancedMesh debris rendering
│       ├── Satellite.tsx          ← Single tracked satellite + trail
│       ├── ThreatIndicator.tsx    ← Proximity alert visualization
│       ├── ManeuverAnimation.tsx  ← Delta-V event effects
│       ├── CollisionEffect.tsx    ← Impact flash + shockwave
│       └── AnimationDriver.tsx    ← Simulation clock
├── lib/
│   ├── geo.ts                    ← Coordinate conversions
│   ├── globe-store.ts            ← Zustand store for globe state
│   └── orbit.ts                  ← SGP4 propagation helpers (wraps satellite.js)
└── public/
    └── textures/
        └── earth/
            └── blue-marble-day.jpg
```

---

## Build Order

Recommended implementation sequence — each step produces something visible:

1. **Canvas + Earth + Stars + OrbitControls** — Get a spinning textured globe you can orbit around. This proves the stack works.
2. **Coordinate system (`geo.ts`)** — Get `geodeticToSceneVec3` working and tested. Everything else depends on this.
3. **DebrisCloud** — Add 2500 instanced debris particles. Confirms performance approach works.
4. **Satellite + orbit trail** — Single satellite moving along a trajectory with a fading trail line.
5. **AnimationDriver + speed controls** — Time simulation with play/pause/speed. Now it's alive.
6. **ThreatIndicator** — Proximity lines + distance labels between objects.
7. **ManeuverAnimation** — Delta-V visual feedback on satellite maneuvers.
8. **CollisionEffect** — Impact flash for collision scenarios.
9. **Zustand store integration** — Wire globe state to surrounding UI panels.

---

## Integration API

The globe exposes these props for the parent UI to control it:

```tsx
interface GlobeViewProps {
  satellites: SatelliteData[];
  debris: DebrisData[];
  threats: ThreatData[];
  selectedId?: string;
  onSelectSatellite?: (id: string) => void;
  speed?: number;
  playing?: boolean;
}
```

The parent UI (dashboard, sidebar, threat panel) passes data down. The globe calls `onSelectSatellite` when the user clicks a satellite in the 3D view. All other interactions (camera orbit, zoom) are handled internally.

---

## Assets Needed

- [ ] Blue Marble Earth texture (NASA public domain): `blue-marble-day.jpg`
  - Source: NASA Visible Earth (2048×1024 minimum, 4096×2048 preferred)
  - Place in `public/textures/earth/`

---

## Key Patterns to Follow

1. **Refs over state for animation** — Anything updating every frame (positions, time, anomalies) must use `useRef`, not `useState`. React re-renders at 60fps will destroy performance.
2. **InstancedMesh for bulk objects** — Never create individual `<mesh>` components for hundreds/thousands of objects. One InstancedMesh = one draw call.
3. **Binary search for time lookup** — Satellite trajectories are time-sorted arrays. Don't linear scan — binary search to find the current position.
4. **Throttled React sync** — Update visible UI state (distance readouts, labels, selected info) at 4Hz max. The 3D scene runs at screen refresh rate independently.
5. **AbortController on API calls** — Every fetch should be cancellable. Clean up in useEffect returns.

# ORBITAL SHIELD — UI Improvement Plan
## Operations Centre Excellence Roadmap

**Date:** 2026-02-21
**Research Sources:** Astro UX Design System (US Space Force), NASA MCC patterns, frontend code audit (38 issues), operations centre design best practices
**Current State:** MVP with 3D globe, mock data, stealth military theme
**Target State:** Production-grade operations centre rivaling real space surveillance displays

---

## Design Philosophy

> **"Think classified briefing room, not video game HUD."**
> — Current codebase comment (globals.css)

We're keeping this philosophy but elevating it with patterns from **real** operations centres:

### Core Principles (from Astro UX / NASA MCC / NORAD)
1. **Status at a glance** — Operator knows system health in < 2 seconds
2. **Severity escalation** — Red is ONLY for critical/urgent (never decorative)
3. **Information density without clutter** — Every pixel earns its place
4. **Temporal awareness** — UTC clock, TCA countdowns, event timelines always visible
5. **Keyboard-first workflow** — Mouse is secondary; operators live on keyboards
6. **Consistent status language** — 6-level system: Critical → Serious → Caution → Normal → Standby → Off

---

## Phase 1: Foundation & Feel (Critical — Do First)

### 1.1 Global Status Bar (Astro Pattern)
**Inspiration:** Astro UX `<GlobalStatusBar>` — the single most recognizable ops-centre element
**Files:** `dashboard-header.tsx`, `globals.css`

**Current:** Simple header with logo, threat badge, sim time, speed controls
**Upgrade to:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ ⬡ ORBITAL SHIELD │ ● NOMINAL │ UTC 14:35:22 │ SIM T+02:15:30 │ 🔴🟡🟢 │ ▶ 10x │
│                   │           │              │                │ 2/0/3  │       │
└─────────────────────────────────────────────────────────────────────┘
```

Changes:
- Add **live UTC clock** (ticking every second) alongside sim time
- Add **status summary counts** (critical/caution/normal) with colored dots
- Add **network status indicator** (connected/degraded/offline)
- Keep dark theme even if app ever gets light mode (per Astro spec)
- Use monospace tabular-nums for ALL numeric displays

### 1.2 Adopt Astro Status Color System
**Files:** `globals.css`, `lib/constants.ts`, all status components

**Current colors (ad-hoc):**
- Cyan for nominal, amber for watched, red for threatened

**Replace with Astro standard (dark theme):**
| Status | Hex | Use Case |
|--------|-----|----------|
| Critical | `#FF3838` | Urgent, immediate action required |
| Serious | `#FFB302` | Errors needing attention |
| Caution | `#FCE83A` | Warnings, unstable |
| Normal | `#56F000` | Satisfactory, operational |
| Standby | `#2DCCFF` | Available, enabled |
| Off | `#A4ABB6` | Unavailable, disabled |

**Why:** This is the actual color system used by the US Space Force. Using it makes our app look authentic and follows accessibility-tested standards.

Add CSS variables:
```css
--status-critical: #FF3838;
--status-serious: #FFB302;
--status-caution: #FCE83A;
--status-normal: #56F000;
--status-standby: #2DCCFF;
--status-off: #A4ABB6;
```

### 1.3 Keyboard Shortcuts System
**Files:** `dashboard-shell.tsx` (new `useEffect` hook)

| Key | Action |
|-----|--------|
| `Space` | Play/Pause simulation |
| `1`–`6` | Speed presets (1x, 5x, 10x, 25x, 50x, 100x) |
| `[` | Toggle left panel |
| `]` | Toggle right panel |
| `` ` `` | Toggle terminal |
| `Escape` | Deselect satellite/threat |
| `↑`/`↓` | Navigate threat/satellite list |
| `Enter` | Select highlighted item |
| `?` | Show keyboard shortcut overlay |

Add a small `?` indicator in the bottom-right corner that reveals shortcuts on hover.

### 1.4 Interactive State Polish
**Files:** All button components

Add to every interactive element:
- `cursor-pointer` on all clickable elements
- `active:scale-[0.97]` press feedback
- Consistent `focus-visible:ring-2 focus-visible:ring-primary/50` focus rings
- `disabled:opacity-40 disabled:cursor-not-allowed` disabled states
- `transition-all duration-150` for smooth micro-interactions

---

## Phase 2: Information Architecture (High Priority)

### 2.1 Threat Severity Visual Hierarchy
**Files:** `panels/threat-panel.tsx`

**Current:** All threat cards look identical except for a small badge
**Upgrade:**
- **Critical threats:** 3px red left border, subtle red background tint (`bg-red-500/5`), bold name, pulsing status dot
- **Serious threats:** 2px amber left border, amber tint (`bg-amber-500/5`)
- **Caution threats:** 1px yellow left border
- **Normal:** Default styling (current)

This follows the Astro principle: **"Use the highest level of urgency status"** and **"Reserve red exclusively for urgent conditions"**

### 2.2 Cross-Highlighting (Panel ↔ Globe)
**Files:** `panels/threat-panel.tsx`, `panels/fleet-panel.tsx`, `globe/satellite-marker.tsx`, `stores/fleet-store.ts`

**Pattern:** Hovering a satellite in the panel list highlights it on the globe, and vice versa.

Implementation:
- `onMouseEnter` → `fleetStore.hoverSatellite(id)`
- `onMouseLeave` → `fleetStore.hoverSatellite(null)`
- In `satellite-marker.tsx`: if `hoveredSatelliteId === id`, show enlarged glow + Html tooltip with name/altitude
- In panel list: if `hoveredSatelliteId === id`, add subtle highlight background

### 2.3 Selection Ring on Globe
**Files:** `globe/satellite-marker.tsx`

**Current:** Selected satellite glow goes from 0.3 → 0.5 opacity (barely noticeable)
**Upgrade:**
- Selected glow: opacity 0.8, scale 3.5x (vs current 2.5x)
- Add pulsing ring billboard (reuse pattern from `threat-indicator.tsx`)
- Add Html label showing satellite name + altitude when selected
- Smooth camera pan to selected satellite using `CameraControls.setLookAt()`

### 2.4 Real-Time UTC Clock
**Files:** `dashboard-header.tsx`

Add ticking UTC clock using `useEffect` + `setInterval(1000)`:
```
UTC 2026-02-21 14:35:22Z    SIM T+02:15:30
```
Both displayed in monospace. The UTC clock is the single most important element in any operations centre — operators need ground truth time at all times.

### 2.5 Terminal Layer Filtering
**Files:** `terminal/ai-terminal.tsx`

Add filter chips in the terminal header bar:
```
Analysis Terminal [▶ Run]  [ALL] [SCAN] [CTX] [RSN] [TOOL] [INTENT] [ERR]  [⬆]
```
- Click a chip to filter logs to that layer only
- `ALL` shows everything (default)
- Active chip gets `bg-primary/20 text-primary` styling
- Filtered log count shown: e.g., `CTX (3)`

---

## Phase 3: Operational Polish (Medium Priority)

### 3.1 Response Panel Execution Flow
**Files:** `panels/response-panel.tsx`, `types/index.ts`

Add state machine to recommendations:
```
pending → executing → complete/failed
         ↘ rejected
```

- **Pending:** Shows APPROVE / REJECT buttons (current)
- **Executing:** Spinner + "Uploading maneuver..." text, buttons disabled
- **Complete:** Green "APPROVED ✓" badge, timestamp, undo button (5s window)
- **Failed:** Red "FAILED" badge + retry button
- **Rejected:** Gray "REJECTED" badge

### 3.2 Health Bar Context (Satellite Detail)
**Files:** `panels/satellite-detail.tsx`

Current health bars show raw percentages. Add:
- **Color thresholds:** Green (>70%), Amber (30-70%), Red (<30%)
- **Trend indicator:** ↑ ↓ → arrow showing if metric is improving/degrading/stable
- **Critical threshold marker:** Small red tick on bar at 20% mark

### 3.3 Threat Timeline
**Files:** New component `components/panels/threat-timeline.tsx`

Add a horizontal timeline showing:
```
NOW ──────|──── T+20m ─────|──── T+60m ─────|──── T+120m
          🔴 SPECTER-4      🟡 OVERWATCH-2    🟢 SENTINEL-7
          miss: 0.8km       miss: 12.4km      miss: 45km
```

This is the **#1 most-requested pattern** in real ops centres — temporal situational awareness. Place it at the top of the threat panel or as a toggle above the terminal.

### 3.4 Globe Lighting Upgrade
**Files:** `globe/earth.tsx`, `globe/globe-view.tsx`

- Switch from `MeshBasicMaterial` to `MeshStandardMaterial`
- Add directional light simulating sun position
- Add day/night terminator line on Earth surface
- Add city lights texture on dark side (subtle, low opacity)
- This alone will dramatically increase visual impact

### 3.5 Panel Collapse Animation Speed
**Files:** `side-panel.tsx`

Change `duration-500` → `duration-250` for snappier feel. Operations centre operators toggle panels frequently — sluggish animations waste time.

### 3.6 Tab Switching Animation
**Files:** `dashboard-shell.tsx`

Add `framer-motion` `<AnimatePresence>` for tab content:
```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -4 }}
    transition={{ duration: 0.15 }}
  >
    {/* Tab content */}
  </motion.div>
</AnimatePresence>
```

---

## Phase 4: Advanced Features (Lower Priority, High Impact)

### 4.1 Alert Notification System
**New files:** `components/notifications/alert-toast.tsx`, `stores/notification-store.ts`

Real ops centres have a persistent alert queue, not just inline lists. Add:
- Toast notifications for new threats (top-right, auto-dismiss after 8s)
- Alert sound for Critical status (optional, respect user preference)
- Notification center accessible from header (bell icon with count badge)
- Alert history with timestamps

### 4.2 Camera Presets & "Follow" Mode
**Files:** `globe/globe-view.tsx`, `panels/satellite-detail.tsx`

- Add "Focus" button in satellite detail that smoothly pans camera to satellite
- Add "Follow" toggle that locks camera to track selected satellite
- Add region presets: "LEO Belt", "GEO Ring", "North America", "Europe"
- Implement using `@react-three/drei` `CameraControls` with `setLookAt()` + damping

### 4.3 Satellite Trail Gradient
**Files:** `globe/satellite-marker.tsx`

Use `vertexColors` on the trail `<Line>` to create opacity gradient:
- Head (current position): full opacity
- Tail (20% orbit ago): zero opacity
- Creates natural "comet tail" effect

### 4.4 Debris Density Visualization
**Files:** `globe/debris-cloud.tsx`

Instead of uniform amber dots:
- Size particles based on local density (larger = denser area)
- Add optional heatmap overlay mode (toggle in header)
- Color ramp: sparse (dim amber) → dense (bright orange/red)

### 4.5 Mini-Map / Orientation Compass
**Files:** `globe/globe-view.tsx` (HTML overlay)

When users zoom in, they lose spatial context. Add:
- Small 2D circle in bottom-left corner showing current camera orientation
- Dots representing satellite positions on the mini-map
- Click mini-map to jump to that region

### 4.6 Audio Alerts (Optional)
**New files:** `lib/audio.ts`

- New threat detected: subtle alert chime
- TCA < 5 minutes: escalating double-beep
- Maneuver approved: confirmation tone
- Pipeline complete: soft completion sound
- Use Web Audio API (no library needed for simple tones)
- Add mute toggle in header

---

## Phase 5: Accessibility & Quality

### 5.1 Color Contrast Fix
**Files:** `globals.css`

Increase muted text lightness:
```css
/* Before */
--muted-foreground: oklch(0.60 0.015 240);
/* After */
--muted-foreground: oklch(0.65 0.015 240);
```

### 5.2 ARIA Labels
**Files:** All components with icon-only buttons

Add `aria-label` to every icon-only button. The play/pause button already has one — extend to collapse buttons, speed buttons, terminal controls.

### 5.3 Status Shapes (Color-Blind Support)
**Files:** `shared/status-dot.tsx`, Astro pattern

Following Astro's guidance: pair colors with shapes:
- Critical: ◆ diamond
- Serious: ▲ triangle
- Caution: ● circle
- Normal: ● circle (filled)
- Standby: ● circle (outline)
- Off: ○ circle (empty)

### 5.4 Keyboard Shortcut Help Overlay
**Files:** New `components/shared/shortcut-overlay.tsx`

Press `?` to show a modal overlay listing all keyboard shortcuts. Styled like a briefing card — dark background, monospace text, grouped by category.

---

## Implementation Priority Matrix

| # | Item | Impact | Effort | Do When |
|---|------|--------|--------|---------|
| 1.1 | Global Status Bar upgrade | 🔴 Critical | Medium | Phase 1 |
| 1.2 | Astro status colors | 🔴 Critical | Low | Phase 1 |
| 1.3 | Keyboard shortcuts | 🔴 Critical | Medium | Phase 1 |
| 1.4 | Button interactive states | 🔴 Critical | Low | Phase 1 |
| 2.1 | Threat severity hierarchy | 🟠 High | Low | Phase 2 |
| 2.2 | Cross-highlighting | 🟠 High | Medium | Phase 2 |
| 2.3 | Selection ring on globe | 🟠 High | Medium | Phase 2 |
| 2.4 | UTC clock | 🟠 High | Low | Phase 2 |
| 2.5 | Terminal filtering | 🟠 High | Low | Phase 2 |
| 3.1 | Response execution flow | 🟡 Medium | Medium | Phase 3 |
| 3.2 | Health bar context | 🟡 Medium | Low | Phase 3 |
| 3.3 | Threat timeline | 🟡 Medium | High | Phase 3 |
| 3.4 | Globe lighting | 🟡 Medium | Medium | Phase 3 |
| 3.5 | Panel animation speed | 🟡 Medium | Trivial | Phase 3 |
| 3.6 | Tab transitions | 🟡 Medium | Low | Phase 3 |
| 4.1 | Alert notification system | 🟢 Nice | High | Phase 4 |
| 4.2 | Camera presets | 🟢 Nice | Medium | Phase 4 |
| 4.3 | Trail gradient | 🟢 Nice | Low | Phase 4 |
| 4.4 | Debris density viz | 🟢 Nice | Medium | Phase 4 |
| 4.5 | Mini-map | 🟢 Nice | High | Phase 4 |
| 4.6 | Audio alerts | 🟢 Nice | Medium | Phase 4 |
| 5.1 | Color contrast | 🔵 A11y | Trivial | Phase 5 |
| 5.2 | ARIA labels | 🔵 A11y | Low | Phase 5 |
| 5.3 | Status shapes | 🔵 A11y | Low | Phase 5 |
| 5.4 | Shortcut overlay | 🔵 A11y | Low | Phase 5 |

---

## New Dependencies Needed

| Package | Purpose | Size |
|---------|---------|------|
| `framer-motion` | Tab transitions, AnimatePresence | ~32kb gzipped |
| `sonner` | Toast notifications | ~5kb gzipped |

**Note:** No other new dependencies needed. Everything else can be built with existing React Three Fiber, Drei, Tailwind, and Zustand.

---

## Files Modified Summary

**Phase 1 (Foundation):**
- `globals.css` — Status color variables
- `lib/constants.ts` — Astro color constants
- `dashboard-header.tsx` — Global status bar upgrade
- `dashboard-shell.tsx` — Keyboard shortcuts hook
- All button components — Interactive states

**Phase 2 (Information Architecture):**
- `panels/threat-panel.tsx` — Severity visual hierarchy
- `panels/fleet-panel.tsx` — Cross-highlighting
- `globe/satellite-marker.tsx` — Selection ring, hover tooltip
- `stores/fleet-store.ts` — Hover state
- `terminal/ai-terminal.tsx` — Layer filtering

**Phase 3 (Polish):**
- `panels/response-panel.tsx` — Execution flow
- `panels/satellite-detail.tsx` — Health bar context
- `globe/earth.tsx` — Lighting upgrade
- `side-panel.tsx` — Animation speed
- New: `panels/threat-timeline.tsx`

**Phase 4-5 (Advanced):**
- New: `notifications/alert-toast.tsx`
- New: `stores/notification-store.ts`
- New: `shared/shortcut-overlay.tsx`
- New: `lib/audio.ts`
- `globe/globe-view.tsx` — Camera presets, mini-map
- `globe/debris-cloud.tsx` — Density visualization

---

*This plan was created by a 2-agent research team: one performing deep web research into real operations centre UI patterns (Astro UX, NASA MCC, NORAD, SpaceX), and another auditing all 25+ frontend component files for specific improvement opportunities.*

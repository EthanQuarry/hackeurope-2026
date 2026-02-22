"use client";

import React, { useCallback, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { cn } from "@/lib/utils";
import { Earth } from "@/components/globe/earth";
import { DebrisCloud } from "@/components/globe/debris-cloud";
import { SatelliteMarker } from "@/components/globe/satellite-marker";
import { HostileMarker } from "@/components/globe/hostile-marker";
import { AnimationDriver } from "@/components/globe/animation-driver";
import { ThreatIndicator } from "@/components/globe/threat-indicator";
import { CollisionEffect } from "@/components/globe/collision-effect";
import { Starfield } from "@/components/globe/starfield";
import { CameraFocus } from "@/components/globe/camera-focus";
import { CinematicCamera } from "@/components/globe/cinematic-camera";
import { useFleetStore } from "@/stores/fleet-store";
import { useThreatStore } from "@/stores/threat-store";
import { useUIStore } from "@/stores/ui-store";
import { useGlobeStore } from "@/stores/globe-store";
import { useResponseStream } from "@/hooks/use-response-stream";
import {
  generateInterceptTrajectory,
  DEMO_SJ26_ID,
  DEMO_USA245_ID,
} from "@/lib/demo-trajectories";
import {
  generateGeoLoiterTrajectory,
  GEO_US_TARGETS,
} from "@/lib/demo-geo-loiter";
import {
  generateMockDebris,
} from "@/lib/mock-data";
import type {
  SatelliteData,
  ProximityThreat,
  SignalThreat,
  AnomalyThreat,
} from "@/types";
import type { ThreatSeverity } from "@/lib/constants";
import { PROXIMITY_FLAG_THRESHOLD } from "@/lib/constants";

/** Threat alert threshold — visual alerts on the globe */
const THREAT_ALERT_THRESHOLD = 70

/** Higher threshold that triggers the AI response agent overlay */
const RESPONSE_AGENT_THRESHOLD = 90

/** Compute risk score (0-100) per OUR satellite from ops-level threat data.
 *  Score goes on the TARGET (our asset under threat), not the attacker.
 *  Aggregates the highest risk across proximity, signal, and anomaly threats. */
function buildThreatScores(
  proximity: ProximityThreat[],
  signal: SignalThreat[],
  anomaly: AnomalyThreat[],
): Map<string, number> {
  const scores = new Map<string, number>();

  const update = (id: string, score: number) => {
    scores.set(id, Math.max(scores.get(id) ?? 0, score));
  };

  for (const t of proximity) {
    // Score = Bayesian posterior directly — it already factors in distance
    const score = Math.round(Math.min(99, t.confidence * 100));
    update(t.targetAssetId, score);
  }

  for (const t of signal) {
    // Score on the asset whose comms are being intercepted
    const score = Math.round(Math.min(99, t.interceptionProbability * 100));
    update(t.targetLinkAssetId, score);
  }

  for (const t of anomaly) {
    // Anomaly is on the foreign sat itself — score any allied sat it's near
    // (anomaly threats don't have a target, so skip for now)
  }

  return scores;
}

/** Check if any satellite just crossed the alert threshold.
 *  Returns IDs that are newly above threshold. */
function checkThresholdTriggers(
  current: Map<string, number>,
  previous: Map<string, number>,
  threshold: number,
): string[] {
  const triggered: string[] = []
  for (const [id, score] of current) {
    const prev = previous.get(id) ?? 0
    if (score >= threshold && prev < threshold) {
      triggered.push(id)
    }
  }
  return triggered
}

interface HostileMarkerData {
  id: string;
  name: string;
  position: { lat: number; lon: number; altKm: number };
  severity: ThreatSeverity;
}

/** Derive hostile markers from live ops threat data */
function deriveHostileMarkers(
  proximity: ProximityThreat[],
  signal: SignalThreat[],
  anomaly: AnomalyThreat[],
): HostileMarkerData[] {
  const markers: HostileMarkerData[] = [];
  const seen = new Set<string>();

  for (const t of proximity) {
    if (!seen.has(t.foreignSatId)) {
      seen.add(t.foreignSatId);
      markers.push({
        id: t.foreignSatId,
        name: t.foreignSatName,
        position: t.primaryPosition,
        severity: t.severity,
      });
    }
  }
  for (const t of signal) {
    if (!seen.has(t.interceptorId)) {
      seen.add(t.interceptorId);
      markers.push({
        id: t.interceptorId,
        name: t.interceptorName,
        position: t.position,
        severity: t.severity,
      });
    }
  }
  for (const t of anomaly) {
    if (!seen.has(t.satelliteId)) {
      seen.add(t.satelliteId);
      markers.push({
        id: t.satelliteId,
        name: t.satelliteName,
        position: t.position,
        severity: t.severity,
      });
    }
  }
  return markers;
}

interface GlobeViewProps {
  compacted?: boolean;
}

/* ── Scene: subscribes to threat stores directly so GlobeView doesn't
 *    re-render on every threat/debris poll update.  Wrapped with React.memo
 *    so it also skips re-renders when parent props haven't changed. ──────── */
/** Stable empty set for the non-demo case — prevents MemoScene re-renders */
const EMPTY_DEMO_IDS = new Set<string>()

const MemoScene = React.memo(function Scene({
  satellites,
  selectedSatelliteId,
  onSelectSatellite,
  simTimeRef,
  speedRef,
  controlsRef,
  onResponseAgentTrigger,
  geoLoiterDemoIds,
}: {
  satellites: SatelliteData[];
  selectedSatelliteId: string | null;
  onSelectSatellite: (id: string) => void;
  simTimeRef: React.RefObject<number>;
  speedRef: React.RefObject<number>;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onResponseAgentTrigger?: (satelliteId: string, score: number) => void;
  /** IDs of satellites currently being redirected in the GEO loiter demo */
  geoLoiterDemoIds: Set<string>;
}) {
  // Threat store subscriptions live here — only Scene re-renders when these update
  const storeThreats = useThreatStore((s) => s.threats);
  const storeDebris = useThreatStore((s) => s.debris);
  const storeProximity = useThreatStore((s) => s.proximityThreats);
  const storeSignal = useThreatStore((s) => s.signalThreats);
  const storeAnomaly = useThreatStore((s) => s.anomalyThreats);

  const fallbackDebris = useMemo(() => generateMockDebris(2500), []);

  // Use store data (populated by polling), fall back to mocks
  const debris = storeDebris.length > 0 ? storeDebris : fallbackDebris;
  const threats = storeThreats;
  const proximityThreats = storeProximity;
  const signalThreats = storeSignal;
  const anomalyThreats = storeAnomaly;

  // Live risk scores on OUR satellites — updates every poll cycle
  const prevScoresRef = useRef(new Map<string, number>())
  const threatScores = useMemo(() => {
    const scores = buildThreatScores(proximityThreats, signalThreats, anomalyThreats)

    // Check for visual alert threshold crossings
    checkThresholdTriggers(scores, prevScoresRef.current, THREAT_ALERT_THRESHOLD)

    // Check for response agent threshold crossings — defer to avoid setState during render
    const responseTriggered = checkThresholdTriggers(scores, prevScoresRef.current, RESPONSE_AGENT_THRESHOLD)
    if (responseTriggered.length > 0 && onResponseAgentTrigger) {
      const cb = onResponseAgentTrigger
      const triggered = responseTriggered.map((id) => ({ id, score: scores.get(id) ?? 90 }))
      queueMicrotask(() => {
        for (const { id, score } of triggered) {
          cb(id, score)
        }
      })
    }

    prevScoresRef.current = scores

    return scores
  }, [proximityThreats, signalThreats, anomalyThreats, onResponseAgentTrigger]);

  // Derive hostile markers, excluding IDs that already exist as fleet satellites
  const hostileMarkers = useMemo(() => {
    const fleetIds = new Set(satellites.map((s) => s.id));
    return deriveHostileMarkers(
      proximityThreats,
      signalThreats,
      anomalyThreats,
    ).filter((h) => !fleetIds.has(h.id));
  }, [satellites, proximityThreats, signalThreats, anomalyThreats]);

  // Derive per-satellite max Bayesian posterior from proximity threats
  // Only assign to targetAssetId (the asset being threatened), not foreignSatId (the threat source)
  const satScores = useMemo(() => {
    const scores: Record<string, number> = {};
    for (const threat of proximityThreats) {
      scores[threat.targetAssetId] = Math.max(
        scores[threat.targetAssetId] ?? 0,
        threat.confidence,
      );
    }
    return scores;
  }, [proximityThreats]);

  return (
    <>
      {/* Custom shader starfield with twinkling */}
      <Starfield />

      <Earth speedRef={speedRef} />

      {/* Debris field */}
      <DebrisCloud debris={debris} simTimeRef={simTimeRef} />

      {/* Satellites */}
      {satellites.map((sat) => {
        // Live threat score from proximity/signal/anomaly data (updates every poll cycle)
        const liveScore = threatScores.get(sat.id);
        const threatPercent =
          liveScore != null && liveScore > 0 ? liveScore : undefined;

        const isGeoLoiterDemo = geoLoiterDemoIds.has(sat.id);

        const showFull =
          sat.id === "sat-6" ||
          sat.id === "sat-25" ||
          sat.id === selectedSatelliteId;

        return (
          <SatelliteMarker
            key={sat.id}
            id={sat.id}
            name={sat.name}
            trajectory={sat.trajectory}
            status={sat.status}
            selected={sat.id === selectedSatelliteId}
            onSelect={onSelectSatellite}
            simTimeRef={simTimeRef}
            threatPercent={threatPercent}
            threatScore={satScores[sat.id] ?? 0}
            showFullOrbit={showFull}
            maneuverArc={sat.maneuverArc}
            loop={!isGeoLoiterDemo}
            useProgressiveThreat={isGeoLoiterDemo}
          />
        );
      })}

      {/* Hostile / foreign satellite markers from live threat data */}
      {hostileMarkers.map((h) => (
        <HostileMarker
          key={`hostile-${h.id}`}
          id={h.id}
          name={h.name}
          position={h.position}
          severity={h.severity}
        />
      ))}

      {/* Threat indicators — pass satellites for animated position tracking */}
      {threats.map((threat) => (
        <ThreatIndicator
          key={threat.id}
          threat={threat}
          simTimeRef={simTimeRef}
          satellites={satellites}
        />
      ))}

      {/* Collision effects for high-severity threats */}
      {threats
        .filter((t) => t.severity === "threatened")
        .map((threat) => (
          <CollisionEffect
            key={`collision-${threat.id}`}
            position={threat.primaryPosition}
            tcaTime={threat.tcaTime}
            simTimeRef={simTimeRef}
          />
        ))}

      {/* Simulation clock */}
      <AnimationDriver simTimeRef={simTimeRef} speedRef={speedRef} />

      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        enableZoom={true}
        minDistance={1.5}
        maxDistance={20}
        enableDamping={true}
        dampingFactor={0.05}
      />

      <CameraFocus controlsRef={controlsRef} simTimeRef={simTimeRef} />
      <CinematicCamera controlsRef={controlsRef} simTimeRef={simTimeRef} />
    </>
  );
});

export function GlobeView({ compacted = false }: GlobeViewProps) {
  const simTimeRef = useRef(Date.now());
  const speedRef = useRef(1);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const selectedSatelliteId = useFleetStore((s) => s.selectedSatelliteId);
  const selectSatellite = useFleetStore((s) => s.selectSatellite);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const storeSatellites = useFleetStore((s) => s.satellites);

  // Show all satellites — no filtering by status
  const allSatellites = storeSatellites;
  const satellites = allSatellites;
  const activeDemo = useGlobeStore((s) => s.activeDemo);

  // Compute modified satellite list and the set of demo satellite IDs together
  // so both values stay in sync from a single memo pass.
  const { demoSatellites, geoLoiterDemoIds } = useMemo(() => {
    if (activeDemo === "malicious-manoeuvre") {
      const sj26 = satellites.find((s) => s.id === DEMO_SJ26_ID);
      const usa245 = satellites.find((s) => s.id === DEMO_USA245_ID);
      if (!sj26 || !usa245) return { demoSatellites: satellites, geoLoiterDemoIds: EMPTY_DEMO_IDS };

      const interceptTrajectory = generateInterceptTrajectory(
        sj26.trajectory,
        usa245.trajectory,
      );

      return {
        demoSatellites: satellites.map((s) =>
          s.id === DEMO_SJ26_ID ? { ...s, trajectory: interceptTrajectory } : s,
        ),
        geoLoiterDemoIds: EMPTY_DEMO_IDS,
      };
    }

    if (activeDemo === "geo-us-loiter") {
      // Pick up to 6 watched (adversarial) satellites, preferring lower altitudes
      // so we get the LEO Chinese/Russian sats that orbit visibly fast.
      const watched = satellites
        .filter((s) => s.status === "watched")
        .sort((a, b) => a.altitude_km - b.altitude_km)
        .slice(0, GEO_US_TARGETS.length)

      if (watched.length === 0) {
        return { demoSatellites: satellites, geoLoiterDemoIds: EMPTY_DEMO_IDS };
      }

      const demoIds = new Set(watched.map((s) => s.id));

      const modified = satellites.map((sat) => {
        const demoIdx = watched.findIndex((w) => w.id === sat.id);
        if (demoIdx === -1) return sat;
        const target = GEO_US_TARGETS[demoIdx] ?? GEO_US_TARGETS[0];
        return {
          ...sat,
          trajectory: generateGeoLoiterTrajectory(sat.trajectory, target.lat, target.lon),
          // Base status watched — SatelliteMarker with useProgressiveThreat escalates to threatened as they approach US
          status: "watched" as const,
        };
      });

      return { demoSatellites: modified, geoLoiterDemoIds: demoIds };
    }

    return { demoSatellites: satellites, geoLoiterDemoIds: EMPTY_DEMO_IDS };
  }, [activeDemo, satellites]);

  const handleSelectSatellite = useCallback(
    (id: string) => {
      selectSatellite(id);
      requestAnimationFrame(() => {
        setActiveView("satellite-detail");
      });
    },
    [selectSatellite, setActiveView],
  );

  // Wire response agent trigger
  const { triggerResponse } = useResponseStream();
  const proximityThreats = useThreatStore((s) => s.proximityThreats);

  const handleResponseAgentTrigger = useCallback(
    (satelliteId: string, score: number) => {
      // Only trigger the response overlay for USA-245 (the SJ-26 demo target)
      if (satelliteId !== DEMO_USA245_ID) return;

      // Find the highest-confidence proximity threat for this satellite
      const threat = proximityThreats
        .filter((t) => t.targetAssetId === satelliteId)
        .sort((a, b) => b.confidence - a.confidence)[0];

      if (!threat) return;

      // Find the target satellite for position data
      const targetSat = allSatellites.find((s) => s.id === satelliteId);
      const focusPos = targetSat?.trajectory?.[0]
        ? { lat: targetSat.trajectory[0].lat, lon: targetSat.trajectory[0].lon, altKm: targetSat.altitude_km }
        : threat.secondaryPosition;

      triggerResponse({
        satelliteId,
        satelliteName: threat.targetAssetName,
        threatSatelliteId: threat.foreignSatId,
        threatSatelliteName: threat.foreignSatName,
        threatScore: score,
        missDistanceKm: threat.missDistanceKm,
        approachPattern: threat.approachPattern,
        tcaMinutes: threat.tcaInMinutes,
        focusPosition: focusPos,
        lockCamera: true,
      });
    },
    [proximityThreats, allSatellites, triggerResponse],
  );

  const handlePointerMissed = useCallback(() => {
    const view = useUIStore.getState().activeView
    if (view !== "overview") setActiveView("overview")
  }, [setActiveView])

  return (
    <div
      className={cn(
        "absolute inset-0 h-full w-full origin-center overflow-hidden transition-transform duration-500 ease-in-out",
        compacted ? "-translate-y-16 scale-[0.7]" : "translate-y-0 scale-100",
      )}
    >
      <Canvas
        camera={{ position: [0, 2, 3.5], fov: 45, near: 0.01, far: 300 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "#000006" }}
        dpr={[1, 2]}
        onPointerMissed={handlePointerMissed}
      >
        <MemoScene
          satellites={demoSatellites}
          selectedSatelliteId={selectedSatelliteId}
          onSelectSatellite={handleSelectSatellite}
          simTimeRef={simTimeRef}
          speedRef={speedRef}
          controlsRef={controlsRef}
          onResponseAgentTrigger={handleResponseAgentTrigger}
          geoLoiterDemoIds={geoLoiterDemoIds}
        />
      </Canvas>
    </div>
  );
}

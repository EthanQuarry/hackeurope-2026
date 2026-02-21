"use client"

import { useMemo, useRef } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"

import { cn } from "@/lib/utils"
import { Earth } from "@/components/globe/earth"
import { DebrisCloud } from "@/components/globe/debris-cloud"
import { SatelliteMarker } from "@/components/globe/satellite-marker"
import { HostileMarker } from "@/components/globe/hostile-marker"
import { AnimationDriver } from "@/components/globe/animation-driver"
import { ThreatIndicator } from "@/components/globe/threat-indicator"
import { CollisionEffect } from "@/components/globe/collision-effect"
import { Starfield } from "@/components/globe/starfield"
import { CameraFocus } from "@/components/globe/camera-focus"
import { useFleetStore } from "@/stores/fleet-store"
import { useThreatStore } from "@/stores/threat-store"
import {
  MOCK_SATELLITES,
  generateMockDebris,
  MOCK_THREATS,
  MOCK_PROXIMITY_THREATS,
  MOCK_SIGNAL_THREATS,
  MOCK_ANOMALY_THREATS,
} from "@/lib/mock-data"
import type { DebrisData, SatelliteData, ThreatData, ProximityThreat, SignalThreat, AnomalyThreat } from "@/types"
import type { ThreatSeverity } from "@/lib/constants"
import { PROXIMITY_FLAG_THRESHOLD } from "@/lib/constants"

interface HostileMarkerData {
  id: string
  name: string
  position: { lat: number; lon: number; altKm: number }
  severity: ThreatSeverity
}

/** Derive hostile markers from live ops threat data */
function deriveHostileMarkers(
  proximity: ProximityThreat[],
  signal: SignalThreat[],
  anomaly: AnomalyThreat[],
): HostileMarkerData[] {
  const markers: HostileMarkerData[] = []
  const seen = new Set<string>()

  for (const t of proximity) {
    if (!seen.has(t.foreignSatId)) {
      seen.add(t.foreignSatId)
      markers.push({ id: t.foreignSatId, name: t.foreignSatName, position: t.primaryPosition, severity: t.severity })
    }
  }
  for (const t of signal) {
    if (!seen.has(t.interceptorId)) {
      seen.add(t.interceptorId)
      markers.push({ id: t.interceptorId, name: t.interceptorName, position: t.position, severity: t.severity })
    }
  }
  for (const t of anomaly) {
    if (!seen.has(t.satelliteId)) {
      seen.add(t.satelliteId)
      markers.push({ id: t.satelliteId, name: t.satelliteName, position: t.position, severity: t.severity })
    }
  }
  return markers
}

interface GlobeViewProps {
  compacted?: boolean
}

function Scene({
  satellites,
  debris,
  threats,
  hostileMarkers,
  selectedSatelliteId,
  onSelectSatellite,
  simTimeRef,
  speedRef,
  controlsRef,
  satScores,
}: {
  satellites: SatelliteData[]
  debris: DebrisData[]
  threats: ThreatData[]
  hostileMarkers: HostileMarkerData[]
  selectedSatelliteId: string | null
  onSelectSatellite: (id: string) => void
  simTimeRef: React.RefObject<number>
  speedRef: React.RefObject<number>
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  satScores: Record<string, number>
}) {
  return (
    <>
      {/* Custom shader starfield with twinkling */}
      <Starfield />

      <Earth speedRef={speedRef} />

      {/* Debris field */}
      <DebrisCloud debris={debris} simTimeRef={simTimeRef} />

      {/* Satellites */}
      {satellites.map((sat) => {
        // Compute threat % for watched/threatened satellites
        let threatPercent: number | undefined
        if (sat.status === "threatened") threatPercent = 60 + Math.floor((parseInt(sat.id.replace(/\D/g, ""), 10) || 0) % 35)
        else if (sat.status === "watched") threatPercent = 15 + Math.floor((parseInt(sat.id.replace(/\D/g, ""), 10) || 0) % 40)

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
          />
        )
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
    </>
  )
}

export function GlobeView({ compacted = false }: GlobeViewProps) {
  const simTimeRef = useRef(Date.now())
  const speedRef = useRef(1)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)

  const selectedSatelliteId = useFleetStore((s) => s.selectedSatelliteId)
  const selectSatellite = useFleetStore((s) => s.selectSatellite)
  const storeSatellites = useFleetStore((s) => s.satellites)
  const storeThreats = useThreatStore((s) => s.threats)
  const storeDebris = useThreatStore((s) => s.debris)
  const storeProximity = useThreatStore((s) => s.proximityThreats)
  const storeSignal = useThreatStore((s) => s.signalThreats)
  const storeAnomaly = useThreatStore((s) => s.anomalyThreats)

  const fallbackDebris = useMemo(() => generateMockDebris(2500), [])

  // Use store data (populated by polling), fall back to mocks
  const satellites = storeSatellites.length > 0 ? storeSatellites : MOCK_SATELLITES
  const debris = storeDebris.length > 0 ? storeDebris : fallbackDebris
  const threats = storeThreats.length > 0 ? storeThreats : MOCK_THREATS

  const proximityThreats = storeProximity.length > 0 ? storeProximity : MOCK_PROXIMITY_THREATS
  const signalThreats = storeSignal.length > 0 ? storeSignal : MOCK_SIGNAL_THREATS
  const anomalyThreats = storeAnomaly.length > 0 ? storeAnomaly : MOCK_ANOMALY_THREATS

  // Derive hostile markers, excluding IDs that already exist as fleet satellites
  const hostileMarkers = useMemo(() => {
    const fleetIds = new Set(satellites.map((s) => s.id))
    return deriveHostileMarkers(proximityThreats, signalThreats, anomalyThreats)
      .filter((h) => !fleetIds.has(h.id))
  }, [satellites, proximityThreats, signalThreats, anomalyThreats])

  // Derive per-satellite max Bayesian posterior from proximity threats
  const satScores = useMemo(() => {
    const scores: Record<string, number> = {}
    for (const threat of proximityThreats) {
      scores[threat.foreignSatId] = Math.max(scores[threat.foreignSatId] ?? 0, threat.confidence)
      scores[threat.targetAssetId] = Math.max(scores[threat.targetAssetId] ?? 0, threat.confidence)
    }
    return scores
  }, [proximityThreats])

  return (
    <div
      className={cn(
        "absolute inset-0 h-full w-full origin-center overflow-hidden transition-transform duration-500 ease-in-out",
        compacted ? "-translate-y-16 scale-[0.7]" : "translate-y-0 scale-100"
      )}
    >
      <Canvas
        camera={{ position: [0, 2, 3.5], fov: 45, near: 0.01, far: 300 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "#000006" }}
        dpr={[1, 2]}
      >
        <Scene
          satellites={satellites}
          debris={debris}
          threats={threats}
          hostileMarkers={hostileMarkers}
          selectedSatelliteId={selectedSatelliteId}
          onSelectSatellite={selectSatellite}
          simTimeRef={simTimeRef}
          speedRef={speedRef}
          controlsRef={controlsRef}
          satScores={satScores}
        />
      </Canvas>
    </div>
  )
}

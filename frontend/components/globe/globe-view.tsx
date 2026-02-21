"use client"

import { useMemo, useRef } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Stars } from "@react-three/drei"

import { cn } from "@/lib/utils"
import { Earth } from "@/components/globe/earth"
import { DebrisCloud } from "@/components/globe/debris-cloud"
import { SatelliteMarker } from "@/components/globe/satellite-marker"
import { AnimationDriver } from "@/components/globe/animation-driver"
import { ThreatIndicator } from "@/components/globe/threat-indicator"
import { CollisionEffect } from "@/components/globe/collision-effect"
import { useFleetStore } from "@/stores/fleet-store"
import { MOCK_SATELLITES, generateMockDebris, MOCK_THREATS } from "@/lib/mock-data"
import type { DebrisData, SatelliteData, ThreatData } from "@/types"

interface GlobeViewProps {
  compacted?: boolean
}

function Scene({
  satellites,
  debris,
  threats,
  selectedSatelliteId,
  onSelectSatellite,
  simTimeRef,
  speedRef,
}: {
  satellites: SatelliteData[]
  debris: DebrisData[]
  threats: ThreatData[]
  selectedSatelliteId: string | null
  onSelectSatellite: (id: string) => void
  simTimeRef: React.RefObject<number>
  speedRef: React.RefObject<number>
}) {
  return (
    <>
      {/* Three-layer parallax starfield */}
      <Stars radius={110} depth={70} count={2600} factor={13.8} saturation={0} fade speed={0.15} />
      <Stars radius={112} depth={75} count={1400} factor={20.4} saturation={0} fade speed={0.18} />
      <Stars radius={115} depth={80} count={650} factor={25.8} saturation={0} fade speed={0.12} />

      <Earth />

      {/* Debris field */}
      <DebrisCloud debris={debris} simTimeRef={simTimeRef} />

      {/* Satellites */}
      {satellites.map((sat) => (
        <SatelliteMarker
          key={sat.id}
          id={sat.id}
          trajectory={sat.trajectory}
          status={sat.status}
          selected={sat.id === selectedSatelliteId}
          onSelect={onSelectSatellite}
          simTimeRef={simTimeRef}
        />
      ))}

      {/* Threat indicators */}
      {threats.map((threat) => (
        <ThreatIndicator
          key={threat.id}
          threat={threat}
          simTimeRef={simTimeRef}
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
        enablePan={true}
        enableZoom={true}
        minDistance={1.5}
        maxDistance={20}
        enableDamping={true}
        dampingFactor={0.05}
      />
    </>
  )
}

export function GlobeView({ compacted = false }: GlobeViewProps) {
  const simTimeRef = useRef(Date.now())
  const speedRef = useRef(1)

  const selectedSatelliteId = useFleetStore((s) => s.selectedSatelliteId)
  const selectSatellite = useFleetStore((s) => s.selectSatellite)

  // Use mock data for now — will be replaced with live API in Phase 8
  const satellites = MOCK_SATELLITES
  const debris = useMemo(() => generateMockDebris(2500), [])
  const threats = MOCK_THREATS

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
          selectedSatelliteId={selectedSatelliteId}
          onSelectSatellite={selectSatellite}
          simTimeRef={simTimeRef}
          speedRef={speedRef}
        />
      </Canvas>
    </div>
  )
}

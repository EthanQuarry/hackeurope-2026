"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import { Line, Html, Billboard } from "@react-three/drei"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import type { ThreatData } from "@/types"

interface ThreatIndicatorProps {
  threat: ThreatData
  simTimeRef: React.RefObject<number>
}

function getProximityColor(distanceKm: number): string {
  if (distanceKm < 1) return "#ef4444" // red
  if (distanceKm < 50) return "#f59e0b" // amber
  return "#ffffff" // white
}

export function ThreatIndicator({ threat, simTimeRef }: ThreatIndicatorProps) {
  const ringRef = useRef<THREE.Mesh>(null)
  const lineColor = getProximityColor(threat.missDistanceKm)

  // Positions of the two objects
  const primaryPos = useMemo(() => {
    const [x, y, z] = geodeticToSceneVec3(
      threat.primaryPosition.lat,
      threat.primaryPosition.lon,
      threat.primaryPosition.altKm
    )
    return new THREE.Vector3(x, y, z)
  }, [threat.primaryPosition])

  const secondaryPos = useMemo(() => {
    const [x, y, z] = geodeticToSceneVec3(
      threat.secondaryPosition.lat,
      threat.secondaryPosition.lon,
      threat.secondaryPosition.altKm
    )
    return new THREE.Vector3(x, y, z)
  }, [threat.secondaryPosition])

  // Dashed line points
  const linePoints = useMemo(
    () =>
      [
        [primaryPos.x, primaryPos.y, primaryPos.z],
        [secondaryPos.x, secondaryPos.y, secondaryPos.z],
      ] as [number, number, number][],
    [primaryPos, secondaryPos]
  )

  // Midpoint for distance label
  const midpoint = useMemo(
    () => new THREE.Vector3().lerpVectors(primaryPos, secondaryPos, 0.5),
    [primaryPos, secondaryPos]
  )

  // Pulsing ring animation around the primary (threatened) asset
  useFrame(() => {
    if (!ringRef.current) return
    const t = simTimeRef.current * 0.003
    const pulse = 1 + 0.15 * Math.sin(t)
    ringRef.current.scale.setScalar(pulse)
  })

  const ringColor = useMemo(() => new THREE.Color(lineColor), [lineColor])

  const distanceLabel =
    threat.missDistanceKm < 1
      ? `${(threat.missDistanceKm * 1000).toFixed(0)} m`
      : `${threat.missDistanceKm.toFixed(1)} km`

  return (
    <group>
      {/* Proximity line between objects */}
      <Line
        points={linePoints}
        color={lineColor}
        transparent
        opacity={0.7}
        lineWidth={1.5}
        dashed
        dashSize={0.02}
        gapSize={0.015}
      />

      {/* Distance label at midpoint */}
      <Html position={midpoint} center style={{ pointerEvents: "none" }}>
        <span
          className="whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] backdrop-blur-sm"
          style={{ color: lineColor }}
        >
          {distanceLabel}
        </span>
      </Html>

      {/* Pulsing ring around primary asset — billboarded to always face camera */}
      <Billboard position={primaryPos}>
        <mesh ref={ringRef}>
          <ringGeometry args={[0.025, 0.03, 32]} />
          <meshBasicMaterial
            color={ringColor}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Billboard>
    </group>
  )
}

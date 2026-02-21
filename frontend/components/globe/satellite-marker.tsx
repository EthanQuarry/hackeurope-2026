"use client"

import { useMemo, useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import { Line, Html } from "@react-three/drei"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import { THREAT_COLORS, type ThreatSeverity } from "@/lib/constants"
import { useGlobeStore } from "@/stores/globe-store"
import type { TrajectoryPoint } from "@/types"

interface SatelliteMarkerProps {
  id: string
  name?: string
  trajectory: TrajectoryPoint[]
  status: ThreatSeverity
  size?: number
  selected?: boolean
  onSelect?: (id: string) => void
  simTimeRef: React.RefObject<number>
  threatPercent?: number
}

const TRAIL_FRACTION = 0.20
const MIN_TRAIL_POINTS = 10
const MAX_TRAIL_POINTS = 800
const MARKER_DAMPING = 0.08

function findTimeIndex(trajectory: TrajectoryPoint[], targetTime: number): number {
  let lo = 0
  let hi = trajectory.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (trajectory[mid].t <= targetTime) lo = mid
    else hi = mid
  }
  return lo
}

export function SatelliteMarker({
  id,
  name,
  trajectory,
  status,
  size = 0.014,
  selected = false,
  onSelect,
  simTimeRef,
  threatPercent,
}: SatelliteMarkerProps) {
  const meshRef = useRef<THREE.Group>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const targetPos = useRef(new THREE.Vector3())
  const initialized = useRef(false)
  const [labelVisible, setLabelVisible] = useState(true)

  const simTime = useGlobeStore((s) => s.simTime)

  const color = THREAT_COLORS[status].hex
  const threeColor = useMemo(() => new THREE.Color(color), [color])

  const scenePoints = useMemo(() => {
    return trajectory.map((p) => {
      const [x, y, z] = geodeticToSceneVec3(p.lat, p.lon, p.alt_km)
      return new THREE.Vector3(x, y, z)
    })
  }, [trajectory])

  const trailPoints = useMemo(() => {
    if (scenePoints.length < 2) {
      return scenePoints.slice(0, 2).map((p) => [p.x, p.y, p.z] as [number, number, number])
    }

    const simTimeSec = simTime / 1000
    const totalDuration = trajectory[trajectory.length - 1].t - trajectory[0].t
    if (totalDuration <= 0) {
      return scenePoints.slice(0, 2).map((p) => [p.x, p.y, p.z] as [number, number, number])
    }

    const elapsed = simTimeSec - trajectory[0].t
    const loopedTime = trajectory[0].t + ((elapsed % totalDuration) + totalDuration) % totalDuration
    const trailLength = Math.min(MAX_TRAIL_POINTS, Math.max(MIN_TRAIL_POINTS, Math.floor(scenePoints.length * TRAIL_FRACTION)))
    const currentLoopIdx = Math.floor(((loopedTime - trajectory[0].t) / totalDuration) * scenePoints.length)

    const trail: [number, number, number][] = []
    for (let i = trailLength; i >= 0; i--) {
      const trailIdx = ((currentLoopIdx - i) % scenePoints.length + scenePoints.length) % scenePoints.length
      const p = scenePoints[trailIdx]
      trail.push([p.x, p.y, p.z])
    }
    return trail.length > 1 ? trail : scenePoints.slice(0, 2).map((p) => [p.x, p.y, p.z] as [number, number, number])
  }, [simTime, scenePoints, trajectory])

  useFrame(({ camera }) => {
    if (!meshRef.current || scenePoints.length < 2) return

    const currentSimTime = simTimeRef.current / 1000
    const totalDuration = trajectory[trajectory.length - 1].t - trajectory[0].t
    if (totalDuration <= 0) return

    const elapsed = currentSimTime - trajectory[0].t
    const loopedTime = trajectory[0].t + ((elapsed % totalDuration) + totalDuration) % totalDuration
    const idx = findTimeIndex(trajectory, loopedTime)
    const nextIdx = Math.min(idx + 1, trajectory.length - 1)
    const t0 = trajectory[idx].t
    const t1 = trajectory[nextIdx].t
    const alpha = t1 > t0 ? (loopedTime - t0) / (t1 - t0) : 0

    targetPos.current.lerpVectors(scenePoints[idx], scenePoints[nextIdx], alpha)

    if (!initialized.current) {
      meshRef.current.position.copy(targetPos.current)
      initialized.current = true
    } else {
      meshRef.current.position.lerp(targetPos.current, MARKER_DAMPING)
    }

    if (glowRef.current) {
      glowRef.current.position.copy(meshRef.current.position)
    }

    // Hide label when satellite is behind the Earth
    const pos = meshRef.current.position
    const dot = pos.x * camera.position.x + pos.y * camera.position.y + pos.z * camera.position.z
    const shouldShow = dot > 0
    if (shouldShow !== labelVisible) setLabelVisible(shouldShow)
  })

  // Show labels for allied/watched/threatened satellites
  const showLabel = status === "allied" || status === "threatened" || status === "watched"

  return (
    <group>
      {/* Orbit trail with gradient fade */}
      <Line
        points={trailPoints}
        vertexColors={trailPoints.map((_, i, arr) => {
          const t = i / (arr.length - 1) // 0=tail, 1=head
          const fade = Math.pow(t, 2.5) // steep curve — tail fades to invisible
          const baseOpacity = status === "threatened" ? 0.85 : status === "watched" ? 0.55 : 0.35
          const r = threeColor.r * fade * baseOpacity
          const g = threeColor.g * fade * baseOpacity
          const b = threeColor.b * fade * baseOpacity
          return [r, g, b] as [number, number, number]
        })}
        transparent
        opacity={1}
        lineWidth={status === "threatened" ? 1.8 : status === "watched" ? 1.4 : 1.0}
      />

      {/* Satellite 3D model */}
      <group
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.(id)
        }}
      >
        {/* Bus body — gold foil insulation */}
        <mesh>
          <boxGeometry args={[size * 1.4, size * 1.0, size * 2.2]} />
          <meshStandardMaterial color="#b8960c" emissive={threeColor} emissiveIntensity={0.2} metalness={0.7} roughness={0.35} />
        </mesh>
        {/* Solar panel strut left */}
        <mesh position={[size * 1.2, 0, 0]}>
          <boxGeometry args={[size * 0.6, size * 0.1, size * 0.1]} />
          <meshStandardMaterial color="#555555" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Solar panel left */}
        <mesh position={[size * 3.2, 0, 0]}>
          <boxGeometry args={[size * 3.5, size * 0.08, size * 2.0]} />
          <meshStandardMaterial color="#0a1e3d" emissive="#061430" emissiveIntensity={0.15} metalness={0.85} roughness={0.15} />
        </mesh>
        {/* Solar cell lines left */}
        <mesh position={[size * 3.2, size * 0.05, 0]}>
          <boxGeometry args={[size * 3.4, size * 0.02, size * 1.9]} />
          <meshStandardMaterial color="#112244" metalness={0.9} roughness={0.1} />
        </mesh>
        {/* Solar panel strut right */}
        <mesh position={[-size * 1.2, 0, 0]}>
          <boxGeometry args={[size * 0.6, size * 0.1, size * 0.1]} />
          <meshStandardMaterial color="#555555" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Solar panel right */}
        <mesh position={[-size * 3.2, 0, 0]}>
          <boxGeometry args={[size * 3.5, size * 0.08, size * 2.0]} />
          <meshStandardMaterial color="#0a1e3d" emissive="#061430" emissiveIntensity={0.15} metalness={0.85} roughness={0.15} />
        </mesh>
        {/* Solar cell lines right */}
        <mesh position={[-size * 3.2, size * 0.05, 0]}>
          <boxGeometry args={[size * 3.4, size * 0.02, size * 1.9]} />
          <meshStandardMaterial color="#112244" metalness={0.9} roughness={0.1} />
        </mesh>
        {/* Antenna dish */}
        <mesh position={[0, size * 0.9, 0]} rotation={[0.4, 0, 0]}>
          <coneGeometry args={[size * 0.5, size * 0.4, 12]} />
          <meshStandardMaterial color="#cccccc" metalness={0.95} roughness={0.05} />
        </mesh>
        {/* Antenna feed */}
        <mesh position={[0, size * 1.3, size * -0.15]}>
          <cylinderGeometry args={[size * 0.04, size * 0.04, size * 0.5, 6]} />
          <meshStandardMaterial color="#888888" metalness={0.9} roughness={0.1} />
        </mesh>
        {/* Status indicator light on body */}
        <mesh position={[0, 0, size * 1.15]}>
          <sphereGeometry args={[size * 0.15, 8, 8]} />
          <meshBasicMaterial color={threeColor} />
        </mesh>

        {/* Small label just above the satellite — hidden when behind Earth */}
        {showLabel && name && labelVisible && (
          <Html
            center
            occlude
            distanceFactor={6}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            <div style={{
              transform: "translateY(-16px)",
              whiteSpace: "nowrap",
              fontSize: "5px",
              fontFamily: "monospace",
              fontWeight: 500,
              color: "rgba(255,220,100,0.6)",
              letterSpacing: "0.4px",
              textAlign: "center",
              lineHeight: 1.2,
            }}>
              {name}{threatPercent != null ? ` ${threatPercent}%` : ""}
            </div>
          </Html>
        )}
      </group>

      {/* Glow — pulsing for threatened */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * (status === "threatened" ? 4 : 2.5), 14, 14]} />
        <meshBasicMaterial
          color={threeColor}
          transparent
          opacity={selected ? 0.5 : status === "threatened" ? 0.35 : 0.2}
        />
      </mesh>
    </group>
  )
}

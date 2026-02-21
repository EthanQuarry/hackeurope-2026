"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Line } from "@react-three/drei"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import { THREAT_COLORS, type ThreatSeverity } from "@/lib/constants"
import { useGlobeStore } from "@/stores/globe-store"
import type { TrajectoryPoint } from "@/types"

interface SatelliteMarkerProps {
  id: string
  trajectory: TrajectoryPoint[]
  status: ThreatSeverity
  size?: number
  selected?: boolean
  onSelect?: (id: string) => void
  simTimeRef: React.RefObject<number>
}

const TRAIL_FRACTION = 0.20
const MIN_TRAIL_POINTS = 10
const MAX_TRAIL_POINTS = 800
const MARKER_DAMPING = 0.08

/**
 * Binary search for the index just before the target time.
 */
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
  trajectory,
  status,
  size = 0.014,
  selected = false,
  onSelect,
  simTimeRef,
}: SatelliteMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const targetPos = useRef(new THREE.Vector3())
  const initialized = useRef(false)

  // Subscribe to simTime (updates at 4Hz) to trigger trail re-renders
  const simTime = useGlobeStore((s) => s.simTime)

  const color = THREAT_COLORS[status].hex
  const threeColor = useMemo(() => new THREE.Color(color), [color])

  // Precompute all scene positions from trajectory
  const scenePoints = useMemo(() => {
    return trajectory.map((p) => {
      const [x, y, z] = geodeticToSceneVec3(p.lat, p.lon, p.alt_km)
      return new THREE.Vector3(x, y, z)
    })
  }, [trajectory])

  // Compute trail points reactively — re-renders at 4Hz via Zustand simTime
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

  useFrame(() => {
    if (!meshRef.current || scenePoints.length < 2) return

    const currentSimTime = simTimeRef.current / 1000
    const totalDuration = trajectory[trajectory.length - 1].t - trajectory[0].t
    if (totalDuration <= 0) return

    // Loop the orbit
    const elapsed = currentSimTime - trajectory[0].t
    const loopedTime = trajectory[0].t + ((elapsed % totalDuration) + totalDuration) % totalDuration

    // Binary search for position
    const idx = findTimeIndex(trajectory, loopedTime)
    const nextIdx = Math.min(idx + 1, trajectory.length - 1)

    // Lerp between adjacent points
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

    // Update glow position
    if (glowRef.current) {
      glowRef.current.position.copy(meshRef.current.position)
    }
  })

  return (
    <group>
      {/* Orbit trail — re-renders at 4Hz via Zustand simTime subscription */}
      <Line
        points={trailPoints}
        color={color}
        transparent
        opacity={0.6}
        lineWidth={1.2}
      />

      {/* Satellite marker */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.(id)
        }}
      >
        <sphereGeometry args={[size, 14, 14]} />
        <meshBasicMaterial color={threeColor} />
      </mesh>

      {/* Glow effect */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 2.5, 14, 14]} />
        <meshBasicMaterial color={threeColor} transparent opacity={selected ? 0.5 : 0.3} />
      </mesh>
    </group>
  )
}

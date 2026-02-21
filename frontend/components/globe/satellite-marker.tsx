"use client"

import { useMemo, useRef } from "react"
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

  useFrame(() => {
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
  })

  // Show labels for watched/threatened satellites
  const showLabel = status === "threatened" || status === "watched"

  return (
    <group>
      {/* Orbit trail */}
      <Line
        points={trailPoints}
        color={color}
        transparent
        opacity={status === "threatened" ? 0.8 : status === "watched" ? 0.5 : 0.35}
        lineWidth={status === "threatened" ? 1.8 : 1.2}
      />

      {/* Satellite 3D model */}
      <group
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.(id)
        }}
      >
        {/* Main body */}
        <mesh>
          <boxGeometry args={[size * 1.2, size * 1.2, size * 2]} />
          <meshStandardMaterial color={threeColor} emissive={threeColor} emissiveIntensity={0.4} metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Solar panel left */}
        <mesh position={[size * 2.5, 0, 0]}>
          <boxGeometry args={[size * 3, size * 0.15, size * 1.8]} />
          <meshStandardMaterial color="#1a3a5c" emissive="#0a2040" emissiveIntensity={0.3} metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Solar panel right */}
        <mesh position={[-size * 2.5, 0, 0]}>
          <boxGeometry args={[size * 3, size * 0.15, size * 1.8]} />
          <meshStandardMaterial color="#1a3a5c" emissive="#0a2040" emissiveIntensity={0.3} metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Antenna dish */}
        <mesh position={[0, size * 1, 0]} rotation={[0.3, 0, 0]}>
          <coneGeometry args={[size * 0.5, size * 0.6, 8]} />
          <meshStandardMaterial color="#888888" metalness={0.9} roughness={0.1} />
        </mesh>

        {/* Floating label above watched/threatened sats */}
        {showLabel && (
          <Html
            center
            distanceFactor={5}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              transform: "translateY(-28px)",
              whiteSpace: "nowrap",
            }}>
              {threatPercent != null && (
                <div style={{
                  fontSize: "9px",
                  fontWeight: 500,
                  fontFamily: "monospace",
                  color: status === "threatened" ? "rgba(255,68,102,0.55)" : "rgba(245,158,11,0.45)",
                  letterSpacing: "0.5px",
                }}>
                  {threatPercent}%
                </div>
              )}
              {name && (
                <div style={{
                  fontSize: "7px",
                  fontFamily: "monospace",
                  color: status === "threatened" ? "rgba(255,102,136,0.4)" : status === "watched" ? "rgba(255,204,102,0.35)" : "rgba(136,204,255,0.35)",
                  letterSpacing: "0.3px",
                }}>
                  {name}
                </div>
              )}
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

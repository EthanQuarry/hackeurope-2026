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
  const meshRef = useRef<THREE.Mesh>(null)
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

      {/* Satellite marker */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.(id)
        }}
      >
        <sphereGeometry args={[status === "threatened" ? size * 1.5 : size, 14, 14]} />
        <meshBasicMaterial color={threeColor} />

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
                  fontSize: "10px",
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: status === "threatened" ? "#ff4466" : "#f59e0b",
                  background: "rgba(0,0,0,0.75)",
                  border: `1px solid ${status === "threatened" ? "#ff446666" : "#f59e0b66"}`,
                  borderRadius: "3px",
                  padding: "1px 5px",
                  marginBottom: "2px",
                  letterSpacing: "0.5px",
                }}>
                  {threatPercent}% THREAT
                </div>
              )}
              {name && (
                <div style={{
                  fontSize: "8px",
                  fontFamily: "monospace",
                  color: status === "threatened" ? "#ff6688" : status === "watched" ? "#ffcc66" : "#88ccff",
                  background: "rgba(0,0,0,0.6)",
                  borderRadius: "2px",
                  padding: "0px 3px",
                  letterSpacing: "0.3px",
                }}>
                  {name}
                </div>
              )}
            </div>
          </Html>
        )}
      </mesh>

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

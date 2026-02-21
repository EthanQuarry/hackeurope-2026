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

  const color = THREAT_COLORS[status]?.hex ?? "#00e5ff"
  const threeColor = useMemo(() => new THREE.Color(color), [color])

  const scenePoints = useMemo(() => {
    return trajectory.map((p) => {
      const [x, y, z] = geodeticToSceneVec3(p.lat, p.lon, p.alt_km)
      return new THREE.Vector3(x, y, z)
    })
  }, [trajectory])

  // Trail colors — precomputed, only changes when color/status changes
  const trailColors = useMemo(() => {
    if (scenePoints.length < 2) return undefined
    const baseOpacity = status === "threatened" ? 0.85 : status === "watched" ? 0.55 : 0.35
    const len = Math.min(MAX_TRAIL_POINTS, Math.max(MIN_TRAIL_POINTS, Math.floor(scenePoints.length * TRAIL_FRACTION))) + 1
    const colors: [number, number, number][] = []
    for (let i = 0; i < len; i++) {
      const t = i / (len - 1)
      const fade = Math.pow(t, 2.5)
      colors.push([
        threeColor.r * fade * baseOpacity,
        threeColor.g * fade * baseOpacity,
        threeColor.b * fade * baseOpacity,
      ])
    }
    return colors
  }, [threeColor, status, scenePoints.length])

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

  // Only show label for selected or threatened satellites (not all of them)
  const showLabel = selected || status === "threatened"
  const markerSize = status === "threatened" ? size * 1.5 : size

  return (
    <group>
      {/* Orbit trail */}
      <Line
        points={trailPoints}
        vertexColors={trailColors}
        transparent
        opacity={1}
        lineWidth={status === "threatened" ? 1.8 : status === "watched" ? 1.4 : 1.0}
      />

      {/* Satellite dot */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.(id)
        }}
      >
        <sphereGeometry args={[markerSize, 8, 8]} />
        <meshBasicMaterial color={threeColor} />

        {showLabel && name && (
          <Html
            center
            distanceFactor={6}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            <div style={{
              transform: "translateY(-14px)",
              whiteSpace: "nowrap",
              textAlign: "center",
            }}>
              {threatPercent != null && (
                <div style={{
                  fontSize: "8px",
                  fontWeight: 600,
                  fontFamily: "monospace",
                  color: status === "threatened" ? "rgba(255,68,102,0.7)" : "rgba(255,145,0,0.6)",
                }}>
                  {threatPercent}%
                </div>
              )}
              <div style={{
                fontSize: "6px",
                fontFamily: "monospace",
                color: "rgba(200,220,255,0.45)",
              }}>
                {name}
              </div>
            </div>
          </Html>
        )}
      </mesh>

      {/* Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[markerSize * 2.5, 8, 8]} />
        <meshBasicMaterial
          color={threeColor}
          transparent
          opacity={selected ? 0.4 : status === "threatened" ? 0.25 : 0.12}
        />
      </mesh>
    </group>
  )
}

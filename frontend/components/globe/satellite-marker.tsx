"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Line, Html } from "@react-three/drei"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import { THREAT_COLORS, PROXIMITY_FLAG_THRESHOLD, type ThreatSeverity } from "@/lib/constants"
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
  threatScore?: number
  /** Show the full predicted orbit path (faint) — used for scenario satellites */
  showFullOrbit?: boolean
  /** Maneuver arc in scene-space xyz — rendered as separate overlay */
  maneuverArc?: [number, number, number][]
}

/** Fit a Catmull-Rom spline and sample it */
function catmull(points: THREE.Vector3[], closed = false, samples = 600): THREE.Vector3[] {
  if (points.length < 4) return points
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal", 0.2)
  return curve.getPoints(samples)
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
  threatScore = 0,
  showFullOrbit = false,
  maneuverArc,
}: SatelliteMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const flagRingRef = useRef<THREE.Mesh>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null)
  const targetPos = useRef(new THREE.Vector3())
  const initialized = useRef(false)
  const posFlatRef = useRef<Float32Array>(new Float32Array(0))
  const isFlagged = threatScore > PROXIMITY_FLAG_THRESHOLD

  const color = THREAT_COLORS[status]?.hex ?? "#00e5ff"
  const threeColor = useMemo(() => new THREE.Color(color), [color])

  const scenePoints = useMemo(() => {
    return trajectory.map((p) => {
      const [x, y, z] = geodeticToSceneVec3(p.lat, p.lon, p.alt_km)
      return new THREE.Vector3(x, y, z)
    })
  }, [trajectory])

  const trailLen = useMemo(
    () =>
      Math.min(
        MAX_TRAIL_POINTS,
        Math.max(MIN_TRAIL_POINTS, Math.floor(scenePoints.length * TRAIL_FRACTION)),
      ) + 1,
    [scenePoints.length],
  )

  // Initial trail points — placeholder, useFrame updates within one tick
  const initialTrailPoints = useMemo(() => {
    if (scenePoints.length < 2) {
      return scenePoints
        .slice(0, 2)
        .map((p) => [p.x, p.y, p.z] as [number, number, number])
    }
    const pts: [number, number, number][] = []
    for (let i = 0; i < trailLen; i++) {
      const p = scenePoints[i % scenePoints.length]
      pts.push([p.x, p.y, p.z])
    }
    return pts
  }, [scenePoints, trailLen])

  // Trail vertex colors — fades from dim tail to bright head
  const trailColors = useMemo(() => {
    const baseOpacity =
      status === "threatened" ? 0.85 : status === "watched" ? 0.55 : 0.35
    const colors: [number, number, number][] = []
    for (let i = 0; i < trailLen; i++) {
      const t = i / Math.max(1, trailLen - 1)
      const fade = Math.pow(t, 2.5)
      colors.push([
        threeColor.r * fade * baseOpacity,
        threeColor.g * fade * baseOpacity,
        threeColor.b * fade * baseOpacity,
      ])
    }
    return colors
  }, [threeColor, status, trailLen])

  // Sync Line2 colors when status / color changes after mount
  useEffect(() => {
    const geo = lineRef.current?.geometry
    if (!geo?.setColors) return
    const flat: number[] = []
    const baseOpacity =
      status === "threatened" ? 0.85 : status === "watched" ? 0.55 : 0.35
    for (let i = 0; i < trailLen; i++) {
      const t = i / Math.max(1, trailLen - 1)
      const fade = Math.pow(t, 2.5)
      flat.push(
        threeColor.r * fade * baseOpacity,
        threeColor.g * fade * baseOpacity,
        threeColor.b * fade * baseOpacity,
      )
    }
    geo.setColors(flat)
  }, [threeColor, status, trailLen])

  // Keep reusable flat array sized correctly
  useEffect(() => {
    posFlatRef.current = new Float32Array(trailLen * 3)
  }, [trailLen])

  useFrame(() => {
    if (!meshRef.current || scenePoints.length < 2) return

    const currentSimTime = simTimeRef.current / 1000
    const totalDuration = trajectory[trajectory.length - 1].t - trajectory[0].t
    if (totalDuration <= 0) return

    const elapsed = currentSimTime - trajectory[0].t
    const loopedTime =
      trajectory[0].t + (((elapsed % totalDuration) + totalDuration) % totalDuration)
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

    // Animate the Bayesian flag ring — pulse scale and opacity
    if (flagRingRef.current && isFlagged) {
      flagRingRef.current.position.copy(meshRef.current.position)
      const t = (Date.now() % 1500) / 1500
      const pulse = 0.5 - 0.5 * Math.cos(t * Math.PI * 2)
      const ringScale = 2.5 + pulse * 2.5
      flagRingRef.current.scale.setScalar(ringScale)
      const mat = flagRingRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.55 * (1 - pulse)
    }

    // ── Update trail positions in Line2 geometry ───────────────────────
    const geo = lineRef.current?.geometry
    if (geo?.setPositions) {
      const flat = posFlatRef.current
      if (flat.length !== trailLen * 3) return // guard against size mismatch

      const trailSegments = trailLen - 1
      const numPts = scenePoints.length
      const currentLoopIdx = Math.floor(
        ((loopedTime - trajectory[0].t) / totalDuration) * numPts,
      )

      for (let i = trailSegments; i >= 1; i--) {
        const trailIdx =
          ((currentLoopIdx - i) % numPts + numPts) % numPts
        const p = scenePoints[trailIdx]
        const j = trailSegments - i
        flat[j * 3] = p.x
        flat[j * 3 + 1] = p.y
        flat[j * 3 + 2] = p.z
      }
      // Last point = satellite's actual animated position
      flat[trailSegments * 3] = meshRef.current.position.x
      flat[trailSegments * 3 + 1] = meshRef.current.position.y
      flat[trailSegments * 3 + 2] = meshRef.current.position.z

      geo.setPositions(flat)
    }
  })

  const labelsEnabled = useGlobeStore((s) => s.showLabels)
  // Show label when globally enabled, or always for selected satellite
  const showLabel = selected || (labelsEnabled && (status === "threatened" || status === "watched"))
  const markerSize = status === "threatened" ? size * 1.5 : size

  // Full orbit ring — clean closed loop (no maneuver splice)
  const fullOrbitRing = useMemo(() => {
    if (!showFullOrbit || scenePoints.length < 4) return null
    return catmull([...scenePoints, scenePoints[0].clone()], true, 800)
  }, [showFullOrbit, scenePoints])

  return (
    <group>
      {/* Full orbit ring — clean spline, no maneuver */}
      {fullOrbitRing && (
        <Line
          points={fullOrbitRing}
          color={color}
          transparent
          opacity={0.15}
          lineWidth={0.6}
          dashed
          dashSize={0.01}
          gapSize={0.008}
        />
      )}

      {/* Maneuver arc overlay — separate curved transfer path (pre-computed xyz from backend) */}
      {maneuverArc && maneuverArc.length > 1 && (
        <Line
          points={maneuverArc}
          color={status === "threatened" ? "#ff2244" : status === "watched" ? "#ff9100" : "#ffcc00"}
          transparent
          opacity={0.7}
          lineWidth={2.0}
        />
      )}

      {/* Orbit trail — positions updated every frame in useFrame */}
      <Line
        ref={lineRef}
        points={initialTrailPoints}
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
        <sphereGeometry args={[markerSize, 32, 32]} />
        <meshBasicMaterial color={threeColor} />

        {showLabel && name && (
          <Html
            center
            distanceFactor={6}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            <div
              style={{
                transform: "translateY(-14px)",
                whiteSpace: "nowrap",
                textAlign: "center",
              }}
            >
              {threatPercent != null && (
                <div
                  style={{
                    fontSize: "8px",
                    fontWeight: 600,
                    fontFamily: "monospace",
                    color:
                      status === "threatened"
                        ? "rgba(255,68,102,0.7)"
                        : "rgba(255,145,0,0.6)",
                  }}
                >
                  {threatPercent}%
                </div>
              )}
              <div
                style={{
                  fontSize: "6px",
                  fontFamily: "monospace",
                  color: "rgba(200,220,255,0.45)",
                }}
              >
                {name}
              </div>
            </div>
          </Html>
        )}
      </mesh>

      {/* Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[markerSize * 2.5, 32, 32]} />
        <meshBasicMaterial
          color={threeColor}
          transparent
          opacity={selected ? 0.4 : status === "threatened" ? 0.25 : 0.12}
        />
      </mesh>

      {/* Bayesian threat flag ring — amber pulse when posterior > threshold */}
      {isFlagged && (
        <mesh ref={flagRingRef}>
          <sphereGeometry args={[markerSize, 16, 16]} />
          <meshBasicMaterial
            color="#ffcc00"
            transparent
            opacity={0.5}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}

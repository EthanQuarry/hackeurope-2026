"use client"

import { useMemo, useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import { Line, Html } from "@react-three/drei"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import type { SatelliteData, ThreatData, TrajectoryPoint } from "@/types"

interface ThreatIndicatorProps {
  threat: ThreatData
  simTimeRef: React.RefObject<number>
  satellites?: SatelliteData[]
}

/* ── Smooth color interpolation based on distance ────────────────────── */

const _blue = new THREE.Color("#44aaff")
const _orange = new THREE.Color("#ff9100")
const _red = new THREE.Color("#ff2244")
const _tmp = new THREE.Color()

function getThreatColorHex(distanceKm: number): string {
  // Smooth: blue (>100km) → orange (~25km) → red (<5km)
  const t = Math.max(0, Math.min(1, 1 - distanceKm / 100))
  if (t < 0.5) {
    _tmp.copy(_blue).lerp(_orange, t * 2)
  } else {
    _tmp.copy(_orange).lerp(_red, (t - 0.5) * 2)
  }
  return `#${_tmp.getHexString()}`
}

function getThreatStyle(distanceKm: number) {
  const color = getThreatColorHex(distanceKm)
  const t = Math.max(0, Math.min(1, 1 - distanceKm / 100))
  return {
    color,
    opacity: 0.4 + t * 0.5,
    lineWidth: 1.2 + t * 1.3,
    dashSize: 0.025 - t * 0.01,
    gapSize: 0.015 - t * 0.007,
  }
}

/* ── Trajectory helpers ──────────────────────────────────────────────── */

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

function trajectoryToScene(trajectory: TrajectoryPoint[]): THREE.Vector3[] {
  return trajectory.map((p) => {
    const [x, y, z] = geodeticToSceneVec3(p.lat, p.lon, p.alt_km)
    return new THREE.Vector3(x, y, z)
  })
}

function interpolatePosition(
  trajectory: TrajectoryPoint[],
  scenePoints: THREE.Vector3[],
  simTimeSec: number,
  out: THREE.Vector3,
): void {
  const totalDuration = trajectory[trajectory.length - 1].t - trajectory[0].t
  if (totalDuration <= 0) {
    out.copy(scenePoints[0])
    return
  }
  const elapsed = simTimeSec - trajectory[0].t
  const loopedTime =
    trajectory[0].t + (((elapsed % totalDuration) + totalDuration) % totalDuration)
  const idx = findTimeIndex(trajectory, loopedTime)
  const nextIdx = Math.min(idx + 1, trajectory.length - 1)
  const t0 = trajectory[idx].t
  const t1 = trajectory[nextIdx].t
  const alpha = t1 > t0 ? (loopedTime - t0) / (t1 - t0) : 0
  out.lerpVectors(scenePoints[idx], scenePoints[nextIdx], alpha)
}

/* ── Module-level reusable vectors (avoid per-frame allocations) ───── */

const _midDir = new THREE.Vector3()
const _camDir2 = new THREE.Vector3()

/* ── Component ───────────────────────────────────────────────────────── */

export function ThreatIndicator({ threat, simTimeRef, satellites }: ThreatIndicatorProps) {
  const [visible, setVisible] = useState(true)
  const lineRef = useRef<any>(null)
  const labelGroupRef = useRef<THREE.Group>(null)

  // Preallocated vectors for per-frame updates
  const currentPrimary = useRef(new THREE.Vector3())
  const currentSecondary = useRef(new THREE.Vector3())
  const currentMidpoint = useRef(new THREE.Vector3())

  // Find matching satellites for animated position tracking
  const primarySat = useMemo(
    () => satellites?.find((s) => s.id === threat.primaryId),
    [satellites, threat.primaryId],
  )
  const secondarySat = useMemo(
    () => satellites?.find((s) => s.id === threat.secondaryId),
    [satellites, threat.secondaryId],
  )

  // Pre-compute scene points from trajectories (only recalculated on data change)
  const primaryScene = useMemo(
    () => (primarySat?.trajectory?.length ? trajectoryToScene(primarySat.trajectory) : null),
    [primarySat?.trajectory],
  )
  const secondaryScene = useMemo(
    () => (secondarySat?.trajectory?.length ? trajectoryToScene(secondarySat.trajectory) : null),
    [secondarySat?.trajectory],
  )

  // Static fallback positions from threat data
  const staticPrimaryPos = useMemo(() => {
    const [x, y, z] = geodeticToSceneVec3(
      threat.primaryPosition.lat,
      threat.primaryPosition.lon,
      threat.primaryPosition.altKm,
    )
    return new THREE.Vector3(x, y, z)
  }, [threat.primaryPosition])

  const staticSecondaryPos = useMemo(() => {
    const [x, y, z] = geodeticToSceneVec3(
      threat.secondaryPosition.lat,
      threat.secondaryPosition.lon,
      threat.secondaryPosition.altKm,
    )
    return new THREE.Vector3(x, y, z)
  }, [threat.secondaryPosition])

  // Initialize positions
  useMemo(() => {
    currentPrimary.current.copy(staticPrimaryPos)
    currentSecondary.current.copy(staticSecondaryPos)
    currentMidpoint.current.lerpVectors(staticPrimaryPos, staticSecondaryPos, 0.5)
  }, [staticPrimaryPos, staticSecondaryPos])

  const initialLinePoints = useMemo(
    () =>
      [
        [staticPrimaryPos.x, staticPrimaryPos.y, staticPrimaryPos.z],
        [staticSecondaryPos.x, staticSecondaryPos.y, staticSecondaryPos.z],
      ] as [number, number, number][],
    [staticPrimaryPos, staticSecondaryPos],
  )

  const style = useMemo(() => getThreatStyle(threat.missDistanceKm), [threat.missDistanceKm])

  useFrame(({ camera }) => {
    const simTimeSec = simTimeRef.current / 1000

    // Compute animated positions from satellite trajectories
    if (primarySat?.trajectory && primaryScene) {
      interpolatePosition(primarySat.trajectory, primaryScene, simTimeSec, currentPrimary.current)
    }
    if (secondarySat?.trajectory && secondaryScene) {
      interpolatePosition(
        secondarySat.trajectory,
        secondaryScene,
        simTimeSec,
        currentSecondary.current,
      )
    }

    // Update Line2 geometry buffer directly (no allocation)
    if (lineRef.current?.geometry) {
      const startAttr = lineRef.current.geometry.getAttribute("instanceStart")
      if (startAttr?.data) {
        const buf = startAttr.data.array as Float32Array
        buf[0] = currentPrimary.current.x
        buf[1] = currentPrimary.current.y
        buf[2] = currentPrimary.current.z
        buf[3] = currentSecondary.current.x
        buf[4] = currentSecondary.current.y
        buf[5] = currentSecondary.current.z
        startAttr.data.needsUpdate = true
      }
    }

    // Update midpoint for label
    currentMidpoint.current.lerpVectors(currentPrimary.current, currentSecondary.current, 0.5)
    if (labelGroupRef.current) {
      labelGroupRef.current.position.copy(currentMidpoint.current)
    }

    // Hide label when midpoint is behind the Earth relative to camera
    _midDir.copy(currentMidpoint.current).normalize()
    _camDir2.set(camera.position.x, camera.position.y, camera.position.z).normalize()
    const shouldShow = _midDir.dot(_camDir2) > -0.1
    if (shouldShow !== visible) setVisible(shouldShow)
  })

  const distanceLabel =
    threat.missDistanceKm < 1
      ? `${(threat.missDistanceKm * 1000).toFixed(0)}m`
      : `${threat.missDistanceKm.toFixed(1)}km`

  const severityLabel =
    threat.severity === "threatened"
      ? "CRITICAL"
      : threat.severity === "watched"
        ? "WARN"
        : "LOW"

  return (
    <group>
      {/* Dashed threat line — endpoints track animated satellite positions */}
      <Line
        ref={lineRef}
        points={initialLinePoints}
        color={style.color}
        transparent
        opacity={style.opacity}
        lineWidth={style.lineWidth}
        dashed
        dashSize={style.dashSize}
        gapSize={style.gapSize}
      />

      {/* Distance + severity label at midpoint — tracks in useFrame */}
      {visible && (
        <group ref={labelGroupRef}>
          <Html center occlude style={{ pointerEvents: "none" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1px",
              }}
            >
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: "9px",
                  fontWeight: 600,
                  color: style.color,
                  opacity: 0.9,
                  background: "rgba(0,0,0,0.6)",
                  padding: "1px 4px",
                  borderRadius: "2px",
                  letterSpacing: "0.5px",
                }}
              >
                {distanceLabel}
              </span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: "7px",
                  color: style.color,
                  opacity: 0.5,
                  letterSpacing: "1px",
                }}
              >
                {severityLabel}
              </span>
            </div>
          </Html>
        </group>
      )}
    </group>
  )
}

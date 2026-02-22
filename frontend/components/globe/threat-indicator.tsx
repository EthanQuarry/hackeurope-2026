"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Line } from "@react-three/drei"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import type { SatelliteData, ThreatData, TrajectoryPoint } from "@/types"

interface ThreatIndicatorProps {
  threat: ThreatData
  simTimeRef: React.RefObject<number>
  satellites?: SatelliteData[]
}

/* ── Smooth color interpolation based on distance ────────────────────── */

const _yellow = new THREE.Color("#ffc800")
const _orange = new THREE.Color("#ff6600")
const _red = new THREE.Color("#ff2244")
const _tmp = new THREE.Color()

function getThreatColorHex(distanceKm: number): string {
  // Smooth: yellow (>100km) → orange (~25km) → red (<5km)
  const t = Math.max(0, Math.min(1, 1 - distanceKm / 100))
  if (t < 0.5) {
    _tmp.copy(_yellow).lerp(_orange, t * 2)
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

/* ── Component ───────────────────────────────────────────────────────── */

export function ThreatIndicator({ threat, simTimeRef, satellites }: ThreatIndicatorProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null)

  // Preallocated vectors for per-frame updates
  const currentPrimary = useRef(new THREE.Vector3())
  const currentSecondary = useRef(new THREE.Vector3())

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

  useFrame(() => {
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

    // Update Line2 geometry buffer only when positions changed meaningfully
    if (lineRef.current?.geometry) {
      const startAttr = lineRef.current.geometry.getAttribute("instanceStart")
      if (startAttr?.data) {
        const buf = startAttr.data.array as Float32Array
        const px = currentPrimary.current.x
        const py = currentPrimary.current.y
        const pz = currentPrimary.current.z
        const sx = currentSecondary.current.x
        const sy = currentSecondary.current.y
        const sz = currentSecondary.current.z
        const d0 = px - buf[0], d1 = py - buf[1], d2 = pz - buf[2]
        const d3 = sx - buf[3], d4 = sy - buf[4], d5 = sz - buf[5]
        const delta = d0*d0 + d1*d1 + d2*d2 + d3*d3 + d4*d4 + d5*d5

        if (delta > 1e-10) {
          buf[0] = px; buf[1] = py; buf[2] = pz
          buf[3] = sx; buf[4] = sy; buf[5] = sz
          startAttr.data.needsUpdate = true
        }
      }
    }

  })


  return (
    <group>
      {/* Dashed threat line — color shifts blue→orange→red based on distance */}
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
    </group>
  )
}

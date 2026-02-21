"use client"

import { useRef, useEffect } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import { useThreatStore } from "@/stores/threat-store"
import { useFleetStore } from "@/stores/fleet-store"
import type { SatelliteData, TrajectoryPoint } from "@/types"

interface CameraFocusProps {
  controlsRef: React.RefObject<any>
  simTimeRef: React.RefObject<number>
}

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

function getTrajectoryPosition(trajectory: TrajectoryPoint[], simTimeMs: number): THREE.Vector3 | null {
  if (trajectory.length < 2) return null
  const simTimeSec = simTimeMs / 1000
  const totalDuration = trajectory[trajectory.length - 1].t - trajectory[0].t
  if (totalDuration <= 0) return null

  const elapsed = simTimeSec - trajectory[0].t
  const loopedTime = trajectory[0].t + ((elapsed % totalDuration) + totalDuration) % totalDuration
  const idx = findTimeIndex(trajectory, loopedTime)
  const nextIdx = Math.min(idx + 1, trajectory.length - 1)
  const t0 = trajectory[idx].t
  const t1 = trajectory[nextIdx].t
  const alpha = t1 > t0 ? (loopedTime - t0) / (t1 - t0) : 0

  const p0 = trajectory[idx]
  const p1 = trajectory[nextIdx]
  const lat = p0.lat + (p1.lat - p0.lat) * alpha
  const lon = p0.lon + (p1.lon - p0.lon) * alpha
  const alt = p0.alt_km + (p1.alt_km - p0.alt_km) * alpha

  const [x, y, z] = geodeticToSceneVec3(lat, lon, alt)
  return new THREE.Vector3(x, y, z)
}

/* ── Dynamic camera offset ───────────────────────────────────────────
   Recomputed every frame from the satellite's current radial direction.
   Camera stays behind the satellite (outward from Earth), slightly
   above the orbital plane, so the camera never clips through Earth.  */

const _tangent = new THREE.Vector3()
const _localUp = new THREE.Vector3()
const _worldUp = new THREE.Vector3(0, 1, 0)
const _camTarget = new THREE.Vector3()

function computeOrbitCamera(
  satPos: THREE.Vector3,
  outCamPos: THREE.Vector3,
  outLookAt: THREE.Vector3,
) {
  const dir = satPos.clone().normalize()
  const satDist = satPos.length()

  // Build a local frame at the satellite position
  _tangent.crossVectors(dir, _worldUp).normalize()
  // Handle pole case (dir ≈ ±Y)
  if (_tangent.lengthSq() < 0.001) {
    _tangent.set(1, 0, 0)
  }
  _localUp.crossVectors(_tangent, dir).normalize()

  // Camera position: behind satellite (further from Earth center),
  // offset up and slightly to the side for a cinematic angle
  outCamPos
    .copy(dir)
    .multiplyScalar(satDist + 0.55)       // pull back outward
    .addScaledVector(_localUp, 0.35)      // above orbital plane
    .addScaledVector(_tangent, 0.12)      // slight side offset

  // Look-at target: partway between Earth center and satellite.
  // Keeps Earth prominent in the frame while satellite is visible.
  outLookAt.copy(satPos).multiplyScalar(0.35)
}

export function CameraFocus({ controlsRef, simTimeRef }: CameraFocusProps) {
  const { camera } = useThree()
  const focusTarget = useThreatStore((s) => s.focusTarget)
  const satellites = useFleetStore((s) => s.satellites)

  // Refs so useFrame always has fresh data without closure staleness
  const satellitesRef = useRef<SatelliteData[]>(satellites)
  const focusRef = useRef(focusTarget)

  useEffect(() => { satellitesRef.current = satellites }, [satellites])
  useEffect(() => { focusRef.current = focusTarget }, [focusTarget])

  const flyingRef = useRef(false)
  const trackingRef = useRef(false)
  const progressRef = useRef(0)
  const startPosRef = useRef(new THREE.Vector3())
  const startTargetRef = useRef(new THREE.Vector3())
  const prevKeyRef = useRef<string | null>(null)

  // Start fly-in when focusTarget changes
  useEffect(() => {
    if (!focusTarget) {
      prevKeyRef.current = null
      trackingRef.current = false
      flyingRef.current = false
      return
    }

    const key = `${focusTarget.satelliteId ?? ""}:${focusTarget.lat},${focusTarget.lon}`
    if (key === prevKeyRef.current) return
    prevKeyRef.current = key

    startPosRef.current.copy(camera.position)
    if (controlsRef.current) {
      startTargetRef.current.copy(controlsRef.current.target)
    }

    progressRef.current = 0
    flyingRef.current = true
    trackingRef.current = !!focusTarget.satelliteId
  }, [focusTarget, camera, controlsRef])

  useFrame((_, delta) => {
    const focus = focusRef.current
    if (!focus) return

    // Find satellite for tracking (using ref for fresh data)
    let livePos: THREE.Vector3 | null = null
    if (focus.satelliteId) {
      const sats = satellitesRef.current
      const sat = sats.find((s) => s.id === focus.satelliteId)
      if (sat?.trajectory) {
        livePos = getTrajectoryPosition(sat.trajectory, simTimeRef.current)
      }
    }

    // Current satellite/focus position
    const satPos = livePos ?? (() => {
      const [x, y, z] = geodeticToSceneVec3(focus.lat, focus.lon, focus.altKm)
      return new THREE.Vector3(x, y, z)
    })()

    // Compute dynamic camera position and look-at from current satellite position
    const desiredCamPos = new THREE.Vector3()
    const desiredTarget = new THREE.Vector3()
    computeOrbitCamera(satPos, desiredCamPos, desiredTarget)

    // --- Phase 1: Fly-in ---
    if (flyingRef.current) {
      progressRef.current += delta * 1.2
      const t = Math.min(progressRef.current, 1)
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

      camera.position.lerpVectors(startPosRef.current, desiredCamPos, ease)
      if (controlsRef.current) {
        controlsRef.current.target.lerpVectors(startTargetRef.current, desiredTarget, ease)
        controlsRef.current.update()
      }

      if (t >= 1) flyingRef.current = false
      return
    }

    // --- Phase 2: Continuous tracking (orbit around Earth) ---
    if (trackingRef.current && livePos) {
      camera.position.lerp(desiredCamPos, 0.04)
      if (controlsRef.current) {
        controlsRef.current.target.lerp(desiredTarget, 0.04)
        controlsRef.current.update()
      }
    }
  })

  return null
}

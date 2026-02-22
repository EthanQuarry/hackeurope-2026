"use client"

import { useRef, useEffect } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import { useGlobeStore } from "@/stores/globe-store"
import { useFleetStore } from "@/stores/fleet-store"
import { DEMO_USA245_ID, DEMO_SJ26_ID } from "@/lib/demo-trajectories"
import type { TrajectoryPoint } from "@/types"

interface CinematicCameraProps {
  controlsRef: React.RefObject<any>
  simTimeRef: React.RefObject<number>
}

const DURATION = 8 // seconds
const START_RADIUS = 18
const ROTATIONS = 1.25 // how many full spins during the spiral

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Binary search for trajectory interpolation */
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

/** Get satellite position at given sim time */
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

export function CinematicCamera({ controlsRef, simTimeRef }: CinematicCameraProps) {
  const { camera } = useThree()
  const cinematicActive = useGlobeStore((s) => s.cinematicActive)
  const setCinematicActive = useGlobeStore((s) => s.setCinematicActive)
  const satellites = useFleetStore((s) => s.satellites)
  const satellitesRef = useRef(satellites)
  useEffect(() => { satellitesRef.current = satellites }, [satellites])

  const elapsedRef = useRef(0)
  const activeRef = useRef(false)

  // End pose: computed once at animation start from satellite positions
  const endPosRef = useRef(new THREE.Vector3())
  const endLookRef = useRef(new THREE.Vector3())
  // Spherical coords of end position (for smooth spiral interpolation)
  const endRadiusRef = useRef(3.8)
  const endPhiRef = useRef(1.0)
  const endThetaRef = useRef(0)

  useEffect(() => {
    if (cinematicActive && !activeRef.current) {
      activeRef.current = true
      elapsedRef.current = 0

      // Compute end pose from USA-245 / SJ-26 midpoint
      const sats = satellitesRef.current
      const usa245 = sats.find((s) => s.id === DEMO_USA245_ID)
      const sj26 = sats.find((s) => s.id === DEMO_SJ26_ID)
      const targetSat = usa245 || sj26
      let satMidpoint: THREE.Vector3 | null = null

      if (targetSat?.trajectory && simTimeRef.current) {
        const pos1 = getTrajectoryPosition(targetSat.trajectory, simTimeRef.current)
        if (pos1) {
          satMidpoint = pos1.clone()
          if (usa245?.trajectory && sj26?.trajectory) {
            const pos2 = getTrajectoryPosition(sj26.trajectory, simTimeRef.current)
            if (pos2) satMidpoint.lerp(pos2, 0.5)
          }
        }
      }

      if (satMidpoint) {
        // Convert midpoint to spherical to get the end theta/phi,
        // but use a pulled-back radius so we're not zoomed in
        const dir = satMidpoint.clone().normalize()

        // End radius: far enough to see both sats and Earth comfortably
        const endRadius = 3.8

        // Spherical angles pointing at the satellite region
        // THREE.js spherical: phi = angle from +Y, theta = angle in XZ from +Z
        const sph = new THREE.Spherical().setFromVector3(dir)
        endRadiusRef.current = endRadius
        endPhiRef.current = sph.phi
        endThetaRef.current = sph.theta

        // Camera position along the same direction, pulled back
        endPosRef.current.copy(dir).multiplyScalar(endRadius)
        // Look at a point between Earth center and the satellites
        endLookRef.current.copy(satMidpoint).multiplyScalar(0.3)
      } else {
        // Fallback: default globe view
        endRadiusRef.current = 3.8
        endPhiRef.current = Math.acos(2 / 3.8)
        endThetaRef.current = 0
        endPosRef.current.setFromSphericalCoords(3.8, endPhiRef.current, 0)
        endLookRef.current.set(0, 0, 0)
      }

      // Disable user controls during the fly-through
      if (controlsRef.current) {
        controlsRef.current.enabled = false
      }

      // Jump camera to starting position
      camera.position.setFromSphericalCoords(START_RADIUS, Math.PI * 0.5, endThetaRef.current + Math.PI * 2 * ROTATIONS)
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0)
        controlsRef.current.update()
      }
    }
  }, [cinematicActive, controlsRef, camera, simTimeRef])

  useFrame((_, delta) => {
    if (!activeRef.current) return

    elapsedRef.current += delta
    const t = Math.min(elapsedRef.current / DURATION, 1)
    const e = easeInOutCubic(t)

    // Single smooth spiral: interpolate all three spherical coords
    const startTheta = endThetaRef.current + Math.PI * 2 * ROTATIONS
    const startPhi = Math.PI * 0.5 // start at equator

    const radius = THREE.MathUtils.lerp(START_RADIUS, endRadiusRef.current, e)
    const phi = THREE.MathUtils.lerp(startPhi, endPhiRef.current, e)
    const theta = THREE.MathUtils.lerp(startTheta, endThetaRef.current, e)

    camera.position.setFromSphericalCoords(radius, phi, theta)

    // Smoothly shift the look-at target from Earth center toward the satellite region
    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(
        new THREE.Vector3(0, 0, 0),
        endLookRef.current,
        e * e, // ease in the look-at shift so it's subtle at first
      )
      controlsRef.current.update()
    }

    // Animation complete
    if (t >= 1) {
      activeRef.current = false
      setCinematicActive(false)
      if (controlsRef.current) {
        controlsRef.current.enabled = true
      }
    }
  })

  return null
}

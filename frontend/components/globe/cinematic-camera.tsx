"use client"

import { useRef, useEffect } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

import { useGlobeStore } from "@/stores/globe-store"

interface CinematicCameraProps {
  controlsRef: React.RefObject<any>
}

const DURATION = 8 // seconds

// Default camera position (0, 2, 3.5) in spherical coordinates
const END_RADIUS = Math.sqrt(4 + 12.25) // ≈ 4.03
const END_PHI = Math.acos(2 / END_RADIUS) // ≈ 1.052 rad (60° from +Y)
const END_THETA = 0

const START_RADIUS = 18
const START_PHI = Math.PI * 0.5 // equatorial plane — equator appears horizontal
const START_THETA = Math.PI * 2.5 // 1.25 full rotations of spiral

function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2
}

export function CinematicCamera({ controlsRef }: CinematicCameraProps) {
  const { camera } = useThree()
  const cinematicActive = useGlobeStore((s) => s.cinematicActive)
  const setCinematicActive = useGlobeStore((s) => s.setCinematicActive)

  const elapsedRef = useRef(0)
  const activeRef = useRef(false)

  // Start the animation when cinematicActive flips to true
  useEffect(() => {
    if (cinematicActive && !activeRef.current) {
      activeRef.current = true
      elapsedRef.current = 0

      // Disable user controls during the fly-through
      if (controlsRef.current) {
        controlsRef.current.enabled = false
      }

      // Jump camera to the starting position immediately
      camera.position.setFromSphericalCoords(START_RADIUS, START_PHI, START_THETA)
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0)
        controlsRef.current.update()
      }
    }
  }, [cinematicActive, controlsRef, camera])

  useFrame((_, delta) => {
    if (!activeRef.current) return

    elapsedRef.current += delta
    const t = Math.min(elapsedRef.current / DURATION, 1)
    const e = easeInOutQuart(t)

    // Spiral in: decreasing radius, rotating theta, rising above equator
    const radius = THREE.MathUtils.lerp(START_RADIUS, END_RADIUS, e)
    const phi = THREE.MathUtils.lerp(START_PHI, END_PHI, e)
    const theta = THREE.MathUtils.lerp(START_THETA, END_THETA, e)

    camera.position.setFromSphericalCoords(radius, phi, theta)

    // Keep the look-at target centered on Earth
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }

    // Animation complete — hand control back to the user
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

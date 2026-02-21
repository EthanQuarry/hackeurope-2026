"use client"

import { useRef, useEffect, useMemo } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import { useThreatStore } from "@/stores/threat-store"
import type { ThreatData } from "@/types"

interface CameraControllerProps {
  /** How long (seconds) to dwell on a threat before pulling back */
  dwellSeconds?: number
  /** Orbit radius when idle */
  orbitRadius?: number
  /** Orbit height */
  orbitHeight?: number
  /** Zoom-in distance from threat */
  zoomDistance?: number
}

type CameraMode = "orbit" | "zoom_in" | "dwell" | "zoom_out"

export function CameraController({
  dwellSeconds = 6,
  orbitRadius = 3.5,
  orbitHeight = 1.5,
  zoomDistance = 1.8,
}: CameraControllerProps) {
  const { camera } = useThree()

  const modeRef = useRef<CameraMode>("orbit")
  const orbitAngleRef = useRef(0)
  const transitionRef = useRef(0) // 0-1 progress for transitions
  const dwellTimerRef = useRef(0)
  const fromPosRef = useRef(new THREE.Vector3())
  const fromLookRef = useRef(new THREE.Vector3())
  const targetPosRef = useRef(new THREE.Vector3())
  const targetLookRef = useRef(new THREE.Vector3())
  const currentLookRef = useRef(new THREE.Vector3(0, 0, 0))
  const lastThreatIdRef = useRef<string | null>(null)
  const threatQueueRef = useRef<ThreatData[]>([])
  const currentThreatRef = useRef<ThreatData | null>(null)
  const cycleIndexRef = useRef(0)
  const orbitResumeDelayRef = useRef(0)

  // Subscribe to threats from store
  const threats = useThreatStore((s) => s.threats)
  const selectedThreatId = useThreatStore((s) => s.selectedThreatId)
  const selectThreat = useThreatStore((s) => s.selectThreat)

  // When threats change, queue up the interesting ones
  useEffect(() => {
    const interesting = threats.filter(
      (t) => t.severity === "threatened" || t.severity === "watched"
    )
    threatQueueRef.current = interesting
  }, [threats])

  useFrame((_, delta) => {
    const mode = modeRef.current

    if (mode === "orbit") {
      // Gentle orbit around Earth
      orbitAngleRef.current += delta * 0.08
      const angle = orbitAngleRef.current
      const targetX = orbitRadius * Math.sin(angle)
      const targetZ = orbitRadius * Math.cos(angle)
      const targetY = orbitHeight + Math.sin(angle * 0.3) * 0.5

      camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.02)
      currentLookRef.current.lerp(new THREE.Vector3(0, 0, 0), 0.02)
      camera.lookAt(currentLookRef.current)

      // Check if we should zoom to a threat
      orbitResumeDelayRef.current -= delta
      if (orbitResumeDelayRef.current > 0) return

      const queue = threatQueueRef.current
      if (queue.length > 0) {
        // Cycle through threats
        const idx = cycleIndexRef.current % queue.length
        const threat = queue[idx]
        cycleIndexRef.current++

        // Only zoom if it's a different threat or enough time has passed
        if (threat.id !== lastThreatIdRef.current || queue.length === 1) {
          _startZoomIn(threat)
        }
      }
    } else if (mode === "zoom_in") {
      // Smoothly move camera toward threat
      transitionRef.current += delta * 0.8 // ~1.25s transition
      const t = _easeInOut(Math.min(transitionRef.current, 1))

      camera.position.lerpVectors(fromPosRef.current, targetPosRef.current, t)
      currentLookRef.current.lerpVectors(fromLookRef.current, targetLookRef.current, t)
      camera.lookAt(currentLookRef.current)

      if (transitionRef.current >= 1) {
        modeRef.current = "dwell"
        dwellTimerRef.current = 0
        // Select the threat in the store so UI highlights it
        if (currentThreatRef.current) {
          selectThreat(currentThreatRef.current.id)
        }
      }
    } else if (mode === "dwell") {
      // Hold on the threat, slight camera drift
      dwellTimerRef.current += delta
      const drift = Math.sin(dwellTimerRef.current * 0.5) * 0.02
      camera.position.x += drift * delta
      camera.lookAt(currentLookRef.current)

      if (dwellTimerRef.current >= dwellSeconds) {
        _startZoomOut()
      }
    } else if (mode === "zoom_out") {
      // Pull back to orbit
      transitionRef.current += delta * 0.6 // ~1.7s transition
      const t = _easeInOut(Math.min(transitionRef.current, 1))

      camera.position.lerpVectors(fromPosRef.current, targetPosRef.current, t)
      currentLookRef.current.lerpVectors(fromLookRef.current, new THREE.Vector3(0, 0, 0), t)
      camera.lookAt(currentLookRef.current)

      if (transitionRef.current >= 1) {
        modeRef.current = "orbit"
        selectThreat(null)
        // Wait before next zoom
        orbitResumeDelayRef.current = 4 + Math.random() * 6 // 4-10s between zooms
      }
    }
  })

  function _startZoomIn(threat: ThreatData) {
    currentThreatRef.current = threat
    lastThreatIdRef.current = threat.id
    modeRef.current = "zoom_in"
    transitionRef.current = 0

    // Save current camera state
    fromPosRef.current.copy(camera.position)
    fromLookRef.current.copy(currentLookRef.current)

    // Compute target: position camera near the threat, looking at the midpoint
    const [px, py, pz] = geodeticToSceneVec3(
      threat.primaryPosition.lat,
      threat.primaryPosition.lon,
      threat.primaryPosition.altKm
    )
    const threatPos = new THREE.Vector3(px, py, pz)

    // Camera offset: slightly above and behind the threat point, facing Earth center
    const dir = threatPos.clone().normalize()
    const up = new THREE.Vector3(0, 1, 0)
    const side = new THREE.Vector3().crossVectors(dir, up).normalize()

    targetPosRef.current.copy(
      threatPos.clone()
        .add(dir.multiplyScalar(0.4))      // push outward
        .add(side.multiplyScalar(0.15))     // offset sideways
        .add(new THREE.Vector3(0, 0.1, 0)) // slightly above
    )
    targetLookRef.current.copy(threatPos)
  }

  function _startZoomOut() {
    modeRef.current = "zoom_out"
    transitionRef.current = 0
    fromPosRef.current.copy(camera.position)
    fromLookRef.current.copy(currentLookRef.current)

    // Target: return to orbit position
    const angle = orbitAngleRef.current
    targetPosRef.current.set(
      orbitRadius * Math.sin(angle),
      orbitHeight,
      orbitRadius * Math.cos(angle)
    )
  }

  return null
}

function _easeInOut(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

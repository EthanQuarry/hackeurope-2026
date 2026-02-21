"use client"

import { useRef, useEffect } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import { useThreatStore } from "@/stores/threat-store"

interface CameraFocusProps {
  /** Ref to the OrbitControls instance so we can update its target */
  controlsRef: React.RefObject<any>
}

/**
 * Smoothly animates the camera toward a focus target when a threat is selected.
 * Works WITH OrbitControls — updates the controls target so the user can still
 * orbit/zoom after the animation completes.
 */
export function CameraFocus({ controlsRef }: CameraFocusProps) {
  const { camera } = useThree()
  const focusTarget = useThreatStore((s) => s.focusTarget)
  const animatingRef = useRef(false)
  const progressRef = useRef(0)
  const startPosRef = useRef(new THREE.Vector3())
  const startTargetRef = useRef(new THREE.Vector3())
  const endPosRef = useRef(new THREE.Vector3())
  const endTargetRef = useRef(new THREE.Vector3())
  const prevFocusRef = useRef<string | null>(null)

  // When focusTarget changes, start animation
  useEffect(() => {
    if (!focusTarget) {
      prevFocusRef.current = null
      return
    }

    const key = `${focusTarget.lat},${focusTarget.lon},${focusTarget.altKm}`
    if (key === prevFocusRef.current) return
    prevFocusRef.current = key

    // Compute scene position of the target
    const [tx, ty, tz] = geodeticToSceneVec3(focusTarget.lat, focusTarget.lon, focusTarget.altKm)
    const targetPoint = new THREE.Vector3(tx, ty, tz)

    // Camera position: offset outward from the target point
    const dir = targetPoint.clone().normalize()
    const side = new THREE.Vector3(0, 1, 0).cross(dir).normalize()
    const cameraPos = targetPoint.clone()
      .add(dir.clone().multiplyScalar(0.6))
      .add(side.multiplyScalar(0.2))
      .add(new THREE.Vector3(0, 0.15, 0))

    // Save start state
    startPosRef.current.copy(camera.position)
    if (controlsRef.current) {
      startTargetRef.current.copy(controlsRef.current.target)
    }

    endPosRef.current.copy(cameraPos)
    endTargetRef.current.copy(targetPoint)

    progressRef.current = 0
    animatingRef.current = true
  }, [focusTarget, camera, controlsRef])

  useFrame((_, delta) => {
    if (!animatingRef.current) return

    progressRef.current += delta * 1.2 // ~0.8s animation
    const t = Math.min(progressRef.current, 1)
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    // Lerp camera position
    camera.position.lerpVectors(startPosRef.current, endPosRef.current, ease)

    // Lerp OrbitControls target
    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(startTargetRef.current, endTargetRef.current, ease)
      controlsRef.current.update()
    }

    if (t >= 1) {
      animatingRef.current = false
    }
  })

  return null
}

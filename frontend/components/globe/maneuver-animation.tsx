"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"

interface ManeuverAnimationProps {
  /** Position of the maneuvering satellite (lat/lon/alt) */
  position: { lat: number; lon: number; altKm: number }
  /** When the maneuver started (ms timestamp) */
  startTime: number
  /** Delta-V magnitude for scaling */
  deltavMagnitude: number
  simTimeRef: React.RefObject<number>
}

const ANIM_DURATION_SEC = 3.5

export function ManeuverAnimation({
  position,
  startTime,
  deltavMagnitude,
  simTimeRef,
}: ManeuverAnimationProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshBasicMaterial>(null)

  const scenePos = useMemo(() => {
    const [x, y, z] = geodeticToSceneVec3(position.lat, position.lon, position.altKm)
    return new THREE.Vector3(x, y, z)
  }, [position])

  const redColor = useMemo(() => new THREE.Color("#ef4444"), [])
  const whiteColor = useMemo(() => new THREE.Color("#ffffff"), [])

  useFrame(() => {
    if (!meshRef.current || !matRef.current) return

    const elapsed = (Date.now() - startTime) / 1000
    if (elapsed > ANIM_DURATION_SEC) {
      meshRef.current.visible = false
      return
    }

    meshRef.current.visible = true
    meshRef.current.position.copy(scenePos)

    // Phase 1 (0-0.3s): ramp to red, scale up
    // Phase 2 (0.3-2.5s): hold red, pulse
    // Phase 3 (2.5-3.5s): fade out
    let blend: number
    let scale: number
    let opacity: number

    if (elapsed < 0.3) {
      blend = elapsed / 0.3
      scale = 1 + 0.5 * blend
      opacity = 0.8
    } else if (elapsed < 2.5) {
      blend = 1
      const pulse = 0.5 + 0.5 * Math.sin((elapsed - 0.3) * 4)
      scale = 1.2 + 0.3 * pulse
      opacity = 0.8
    } else {
      const fadeProgress = (elapsed - 2.5) / 1.0
      blend = 1 - fadeProgress
      scale = 1.5 - 0.5 * fadeProgress
      opacity = 0.8 * (1 - fadeProgress)
    }

    const vizScale = Math.max(0.01, Math.min(0.04, deltavMagnitude * 0.02))
    meshRef.current.scale.setScalar(vizScale * scale)
    matRef.current.color.copy(whiteColor).lerp(redColor, blend)
    matRef.current.opacity = opacity
  })

  return (
    <mesh ref={meshRef} visible={false}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial
        ref={matRef}
        color={whiteColor}
        transparent
        opacity={0.8}
      />
    </mesh>
  )
}

"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"

interface CollisionEffectProps {
  /** Predicted collision point (lat/lon/alt) */
  position: { lat: number; lon: number; altKm: number }
  /** TCA timestamp (ms) */
  tcaTime: number
  simTimeRef: React.RefObject<number>
}

const ACTIVATION_BEFORE_SEC = 2
const ACTIVATION_AFTER_SEC = 60
const RING_EXPAND_SEC = 10
const RING_FADE_SEC = 60

export function CollisionEffect({
  position,
  tcaTime,
  simTimeRef,
}: CollisionEffectProps) {
  const flashRef = useRef<THREE.Mesh>(null)
  const flashMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null)

  const scenePos = useMemo(() => {
    const [x, y, z] = geodeticToSceneVec3(position.lat, position.lon, position.altKm)
    return new THREE.Vector3(x, y, z)
  }, [position])

  const flashColor = useMemo(() => new THREE.Color("#ffffff"), [])
  const ringColor = useMemo(() => new THREE.Color("#ff6b35"), [])

  useFrame(() => {
    const simTimeSec = simTimeRef.current / 1000
    const tcaSec = tcaTime / 1000
    const dt = simTimeSec - tcaSec

    // Activation window: -2s to +60s around TCA
    const active = dt >= -ACTIVATION_BEFORE_SEC && dt <= ACTIVATION_AFTER_SEC

    // Flash
    if (flashRef.current && flashMatRef.current) {
      flashRef.current.visible = active && dt >= -ACTIVATION_BEFORE_SEC && dt < 10
      if (flashRef.current.visible) {
        flashRef.current.position.copy(scenePos)
        const pulse = Math.abs(Math.sin(dt * 3))
        flashRef.current.scale.setScalar(0.02 * (1 + pulse * 0.5))
        flashMatRef.current.opacity = 0.9 * (1 - Math.max(0, dt) / 10)
      }
    }

    // Expanding ring
    if (ringRef.current && ringMatRef.current) {
      ringRef.current.visible = active && dt >= 0
      if (ringRef.current.visible) {
        ringRef.current.position.copy(scenePos)
        const ringProgress = Math.min(1, dt / RING_EXPAND_SEC)
        const ringScale = 0.03 + (0.18 - 0.03) * ringProgress
        ringRef.current.scale.setScalar(ringScale)
        ringMatRef.current.opacity = 0.6 * (1 - Math.min(1, dt / RING_FADE_SEC))
      }
    }
  })

  return (
    <group>
      {/* Central flash */}
      <mesh ref={flashRef} visible={false}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          ref={flashMatRef}
          color={flashColor}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Expansion ring */}
      <mesh ref={ringRef} visible={false}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial
          ref={ringMatRef}
          color={ringColor}
          transparent
          opacity={0.6}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  )
}

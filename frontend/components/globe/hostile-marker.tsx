"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Html } from "@react-three/drei"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import { THREAT_COLORS, type ThreatSeverity } from "@/lib/constants"

interface HostileMarkerProps {
  id: string
  name: string
  position: { lat: number; lon: number; altKm: number }
  severity: ThreatSeverity
  size?: number
}

export function HostileMarker({
  id,
  name,
  position,
  severity,
  size = 0.012,
}: HostileMarkerProps) {
  const pulseRef = useRef<THREE.Mesh>(null)

  // Adversaries are always orange regardless of severity
  const color = "#ff9100"
  const threeColor = useMemo(() => new THREE.Color(color), [])

  const scenePos = useMemo(() => {
    const [x, y, z] = geodeticToSceneVec3(position.lat, position.lon, position.altKm)
    return new THREE.Vector3(x, y, z)
  }, [position])

  // Pulse the outer ring
  useFrame(({ clock }) => {
    if (pulseRef.current) {
      const t = clock.getElapsedTime()
      const pulse = 0.15 + 0.1 * Math.sin(t * 3)
      ;(pulseRef.current.material as THREE.Material).opacity = pulse
    }
  })

  return (
    <group position={scenePos}>
      {/* Core diamond shape */}
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[size, size, size]} />
        <meshBasicMaterial color={threeColor} />
      </mesh>

      {/* Pulsing glow */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[size * 3, 12, 12]} />
        <meshBasicMaterial
          color={threeColor}
          transparent
          opacity={0.15}
          depthWrite={false}
        />
      </mesh>

      {/* Label */}
      <Html
        center
        distanceFactor={5}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transform: "translateY(-20px)",
          whiteSpace: "nowrap",
        }}>
          <div style={{
            fontSize: "7px",
            fontFamily: "monospace",
            color: "rgba(255,145,0,0.5)",
            letterSpacing: "0.3px",
          }}>
            {name}
          </div>
        </div>
      </Html>
    </group>
  )
}

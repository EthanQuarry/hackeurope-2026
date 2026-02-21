"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import type { DebrisData } from "@/types"

interface DebrisCloudProps {
  debris: DebrisData[]
  simTimeRef: React.RefObject<number>
}

export function DebrisCloud({ debris, simTimeRef }: DebrisCloudProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  // Convert debris to scene positions
  const positions = useMemo(() => {
    return debris
      .map((d) => {
        const pos = geodeticToSceneVec3(d.lat, d.lon, d.altKm)
        const mag = Math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2)
        if (mag < 0.9 || mag > 10) return null
        return new THREE.Vector3(pos[0], pos[1], pos[2])
      })
      .filter((v): v is THREE.Vector3 => v !== null)
  }, [debris])

  // Precompute per-debris drift parameters
  const driftData = useMemo(() => {
    return positions.map((_, i) => {
      const phi = i * 2.39996322 // golden angle
      const theta = ((i * 1.61803) % 1.0) * Math.PI
      const speed = 0.00004 + (i % 60) * 0.0000008
      const oscAmp = 0.008 + (i % 40) * 0.0003
      const oscFreq = 0.005 + (i % 50) * 0.00006
      return {
        dx: Math.cos(phi) * Math.sin(theta) * speed,
        dy: Math.cos(theta) * speed * 0.4,
        dz: Math.sin(phi) * Math.sin(theta) * speed,
        ox: Math.cos(phi + 1.0) * oscAmp,
        oy: Math.sin(theta + 1.0) * oscAmp * 0.4,
        oz: Math.sin(phi + 2.0) * oscAmp,
        freq: oscFreq,
      }
    })
  }, [positions])

  // Set initial positions
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || positions.length === 0) return

    positions.forEach((pos, i) => {
      dummy.position.copy(pos)
      dummy.scale.setScalar(0.006)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [dummy, positions])

  // Per-frame drift animation
  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh || positions.length === 0) return

    const t = simTimeRef.current * 0.001 // convert ms to seconds for drift calc

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i]
      const d = driftData[i]
      const osc = Math.sin(d.freq * t)
      dummy.position.set(
        pos.x + d.dx * t + d.ox * osc,
        pos.y + d.dy * t + d.oy * osc,
        pos.z + d.dz * t + d.oz * osc
      )
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  if (positions.length === 0) return null

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, positions.length]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#f59e0b" transparent opacity={0.9} />
    </instancedMesh>
  )
}

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { Line } from "@react-three/drei"
import * as THREE from "three"

import { geodeticToUnitVector } from "@/lib/geo"

const TEXTURE_PATH = "/textures/earth/blue-marble-day.jpg"

function EarthSphere() {
  const { gl } = useThree()
  const [surfaceMap, setSurfaceMap] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    let active = true
    const loader = new THREE.TextureLoader()

    loader.load(
      TEXTURE_PATH,
      (texture) => {
        if (!active) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.needsUpdate = true
        setSurfaceMap((prev) => {
          prev?.dispose()
          return texture
        })
      },
      undefined,
      () => {
        // Texture load failed — keep fallback material
      }
    )

    return () => {
      active = false
    }
  }, [gl])

  useEffect(() => {
    return () => {
      surfaceMap?.dispose()
    }
  }, [surfaceMap])

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: surfaceMap ?? undefined,
        color: surfaceMap ? "#ffffff" : "#0d3b66",
        toneMapped: false,
      }),
    [surfaceMap]
  )

  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  return (
    <mesh material={material}>
      <sphereGeometry args={[1, 64, 64]} />
    </mesh>
  )
}

function Graticule() {
  const latLines = useMemo(() => {
    const latitudes = [-60, -30, 0, 30, 60]
    return latitudes.map((lat) => {
      const points: [number, number, number][] = []
      for (let lon = -180; lon <= 180; lon += 2) {
        const p = geodeticToUnitVector(lat, lon, 0)
        points.push([p.x * 1.002, p.y * 1.002, p.z * 1.002])
      }
      return points
    })
  }, [])

  const lonLines = useMemo(() => {
    const longitudes: number[] = []
    for (let lon = -150; lon <= 180; lon += 30) {
      longitudes.push(lon)
    }
    return longitudes.map((lon) => {
      const points: [number, number, number][] = []
      for (let lat = -90; lat <= 90; lat += 2) {
        const p = geodeticToUnitVector(lat, lon, 0)
        points.push([p.x * 1.002, p.y * 1.002, p.z * 1.002])
      }
      return points
    })
  }, [])

  return (
    <group>
      {latLines.map((points, i) => (
        <Line key={`lat-${i}`} points={points} color="#ffffff" transparent opacity={0.28} lineWidth={0.6} />
      ))}
      {lonLines.map((points, i) => (
        <Line key={`lon-${i}`} points={points} color="#ffffff" transparent opacity={0.25} lineWidth={0.6} />
      ))}
    </group>
  )
}

function Atmosphere() {
  return (
    <mesh>
      <sphereGeometry args={[1.015, 64, 64]} />
      <meshBasicMaterial color="#73a5ff" transparent opacity={0.1} side={THREE.BackSide} />
    </mesh>
  )
}

interface EarthProps {
  speedRef: React.RefObject<number>
}

export function Earth({ speedRef }: EarthProps) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!groupRef.current) return
    // Gentle continuous rotation — subtle enough to feel alive, not distracting
    const baseRate = 0.00015
    groupRef.current.rotation.y += baseRate
  })

  return (
    <group ref={groupRef}>
      <EarthSphere />
      <Graticule />
      <Atmosphere />
    </group>
  )
}

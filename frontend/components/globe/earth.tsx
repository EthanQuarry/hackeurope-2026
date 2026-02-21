"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { Line } from "@react-three/drei"
import * as THREE from "three"

import { geodeticToUnitVector } from "@/lib/geo"
import {
  earthVertexShader,
  earthFragmentShader,
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from "./shaders"

const DAY_PATH = "/textures/earth/blue-marble-day.jpg"
const NIGHT_PATH = "/textures/earth/earth-night.jpg"
const CLOUD_PATH = "/textures/earth/earth-clouds.jpg"

const SUN_DIR = new THREE.Vector3(1, 0.3, 0.5).normalize()

function useTexture(path: string) {
  const { gl } = useThree()
  const [tex, setTex] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    let active = true
    new THREE.TextureLoader().load(path, (t) => {
      if (!active) { t.dispose(); return }
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.magFilter = THREE.LinearFilter
      t.needsUpdate = true
      setTex((prev) => { prev?.dispose(); return t })
    })
    return () => { active = false }
  }, [path, gl])

  useEffect(() => { return () => { tex?.dispose() } }, [tex])
  return tex
}

function EarthSphere() {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const dayMap = useTexture(DAY_PATH)
  const nightMap = useTexture(NIGHT_PATH)
  const cloudMap = useTexture(CLOUD_PATH)

  const uniforms = useMemo(() => ({
    dayMap: { value: null as THREE.Texture | null },
    nightMap: { value: null as THREE.Texture | null },
    cloudMap: { value: null as THREE.Texture | null },
    lightDirection: { value: SUN_DIR.clone() },
    uTime: { value: 0 },
  }), [])

  // Update texture uniforms as they load
  useEffect(() => {
    if (matRef.current && dayMap) {
      matRef.current.uniforms.dayMap.value = dayMap
      matRef.current.needsUpdate = true
    }
  }, [dayMap])
  useEffect(() => {
    if (matRef.current && nightMap) {
      matRef.current.uniforms.nightMap.value = nightMap
      matRef.current.needsUpdate = true
    }
  }, [nightMap])
  useEffect(() => {
    if (matRef.current && cloudMap) {
      matRef.current.uniforms.cloudMap.value = cloudMap
      matRef.current.needsUpdate = true
    }
  }, [cloudMap])

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return (
    <mesh>
      <sphereGeometry args={[1, 128, 128]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={earthVertexShader}
        fragmentShader={earthFragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  )
}

function AtmosphereGlow() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(() => ({
    lightDirection: { value: SUN_DIR.clone() },
    uTime: { value: 0 },
  }), [])

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return (
    <mesh>
      <sphereGeometry args={[1.04, 64, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={atmosphereVertexShader}
        fragmentShader={atmosphereFragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  )
}

function Graticule() {
  const latLines = useMemo(() => {
    return [-60, -30, 0, 30, 60].map((lat) => {
      const points: [number, number, number][] = []
      for (let lon = -180; lon <= 180; lon += 2) {
        const p = geodeticToUnitVector(lat, lon, 0)
        points.push([p.x * 1.002, p.y * 1.002, p.z * 1.002])
      }
      return { points, isEquator: lat === 0 }
    })
  }, [])

  const lonLines = useMemo(() => {
    const lons: number[] = []
    for (let lon = -150; lon <= 180; lon += 30) lons.push(lon)
    return lons.map((lon) => {
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
      {latLines.map(({ points, isEquator }, i) => (
        <Line
          key={`lat-${i}`}
          points={points}
          color={isEquator ? "#00ddff" : "#1a3355"}
          transparent
          opacity={isEquator ? 0.12 : 0.04}
          lineWidth={isEquator ? 0.5 : 0.3}
        />
      ))}
      {lonLines.map((points, i) => (
        <Line key={`lon-${i}`} points={points} color="#1a3355" transparent opacity={0.03} lineWidth={0.3} />
      ))}
    </group>
  )
}

interface EarthProps {
  speedRef: React.RefObject<number>
}

export function Earth({ speedRef }: EarthProps) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const speed = speedRef.current ?? 1
    groupRef.current.rotation.y += ((2 * Math.PI) / 86400) * delta * speed
  })

  return (
    <group>
      <group ref={groupRef}>
        <EarthSphere />
        <Graticule />
      </group>
      <AtmosphereGlow />
    </group>
  )
}

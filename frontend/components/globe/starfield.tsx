"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { starfieldVertexShader, starfieldFragmentShader } from "./shaders"

const STAR_COUNT = 6000

/** Realistic starfield with varying sizes, colors, and twinkling */
export function Starfield() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const { geometry, uniforms } = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3)
    const sizes = new Float32Array(STAR_COUNT)
    const brightness = new Float32Array(STAR_COUNT)
    const colors = new Float32Array(STAR_COUNT * 3)

    // Star color temperatures (blue-white to orange-red)
    const starColors = [
      [0.7, 0.8, 1.0],   // Blue-white (hot)
      [0.9, 0.9, 1.0],   // White
      [1.0, 1.0, 0.9],   // Yellow-white
      [1.0, 0.9, 0.7],   // Yellow
      [1.0, 0.7, 0.5],   // Orange
      [1.0, 0.5, 0.4],   // Red-orange (cool)
    ]

    for (let i = 0; i < STAR_COUNT; i++) {
      // Spherical distribution
      const r = 80 + Math.random() * 120
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)

      // Most stars small, few bright ones
      const rand = Math.random()
      if (rand > 0.995) {
        sizes[i] = 2.5 + Math.random() * 2.0   // Very bright
        brightness[i] = 0.9 + Math.random() * 0.1
      } else if (rand > 0.97) {
        sizes[i] = 1.2 + Math.random() * 1.3    // Medium bright
        brightness[i] = 0.6 + Math.random() * 0.3
      } else if (rand > 0.85) {
        sizes[i] = 0.6 + Math.random() * 0.6    // Dim
        brightness[i] = 0.3 + Math.random() * 0.3
      } else {
        sizes[i] = 0.2 + Math.random() * 0.4    // Faint
        brightness[i] = 0.1 + Math.random() * 0.2
      }

      // Color based on "temperature" — weighted toward white/blue
      const colorIdx = Math.floor(Math.pow(Math.random(), 2) * starColors.length)
      const sc = starColors[Math.min(colorIdx, starColors.length - 1)]
      colors[i * 3] = sc[0]
      colors[i * 3 + 1] = sc[1]
      colors[i * 3 + 2] = sc[2]
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1))
    geo.setAttribute("brightness", new THREE.BufferAttribute(brightness, 1))
    geo.setAttribute("starColor", new THREE.BufferAttribute(colors, 3))

    return {
      geometry: geo,
      uniforms: { uTime: { value: 0 } },
    }
  }, [])

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexShader={starfieldVertexShader}
        fragmentShader={starfieldFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import { Line, Html } from "@react-three/drei"
import * as THREE from "three"

import { THREAT_COLORS, type ThreatSeverity } from "@/lib/constants"
import { api } from "@/lib/api"
import { useGlobeStore } from "@/stores/globe-store"

const EARTH_R = 1.0 // scene units
const EARTH_KM = 6378.137
const NUM_POINTS = 240
const MARKER_SIZE = 0.016

interface SJ26Scenario {
  phase: number
  progress: number
  status: ThreatSeverity
  originalOrbit: { altKm: number; incDeg: number; raanDeg: number }
  currentOrbit: { altKm: number; incDeg: number; raanDeg: number }
  targetOrbit: { altKm: number; incDeg: number; raanDeg: number }
  normalFraction: number
  arcHeightKm: number
  missDistanceKm: number
}

/** Convert orbital elements + true anomaly to scene-space Vector3.
 *  Computes lat/lon from orbital mechanics, then uses the same
 *  coordinate convention as geodeticToSceneVec3 in geo.ts. */
function orbitToScene(altKm: number, incDeg: number, raanDeg: number, ta: number): THREE.Vector3 {
  const r = EARTH_R * (1 + altKm / EARTH_KM)
  const inc = (incDeg * Math.PI) / 180
  const raan = (raanDeg * Math.PI) / 180

  // Orbital plane → ECI
  const xOrb = Math.cos(ta)
  const yOrb = Math.sin(ta)
  const xEci = xOrb * Math.cos(raan) - yOrb * Math.cos(inc) * Math.sin(raan)
  const yEci = xOrb * Math.sin(raan) + yOrb * Math.cos(inc) * Math.cos(raan)
  const zEci = yOrb * Math.sin(inc)

  // ECI → lat/lon
  const lat = Math.asin(Math.max(-1, Math.min(1, zEci)))
  const lon = Math.atan2(yEci, xEci)

  // lat/lon → scene (matches geodeticToSceneVec3 exactly)
  return new THREE.Vector3(
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.sin(lat),
    -r * Math.cos(lat) * Math.sin(lon),
  )
}

interface SJ26MarkerProps {
  simTimeRef: React.RefObject<number>
  selected?: boolean
  onSelect?: (id: string) => void
}

export function SJ26Marker({ simTimeRef, selected = false, onSelect }: SJ26MarkerProps) {
  const [scenario, setScenario] = useState<SJ26Scenario | null>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const speed = useGlobeStore((s) => s.speed)

  // Poll scenario state every 3 seconds
  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const res = await fetch(`${api.sj26Scenario}?speed=${speed}`)
        if (res.ok && active) {
          setScenario(await res.json())
        }
      } catch { /* silent */ }
    }
    poll()
    const iv = setInterval(poll, 3000)
    return () => { active = false; clearInterval(iv) }
  }, [speed])

  // Compute full orbit path in scene space with Bezier arc
  const { orbitPoints, orbitColors } = useMemo(() => {
    if (!scenario) return { orbitPoints: [] as [number, number, number][], orbitColors: [] as [number, number, number][] }

    const { originalOrbit: orig, currentOrbit: cur, normalFraction, arcHeightKm, phase } = scenario
    const devIdx = Math.floor(NUM_POINTS * normalFraction)
    const transferLen = NUM_POINTS - devIdx

    const pts: [number, number, number][] = []
    const cols: [number, number, number][] = []
    const statusColor = new THREE.Color(THREAT_COLORS[scenario.status]?.hex ?? "#00e5ff")

    for (let i = 0; i < NUM_POINTS; i++) {
      const ta = (2 * Math.PI / NUM_POINTS) * i

      let pos: THREE.Vector3
      let isArc = false

      if (i <= devIdx || phase === 0) {
        // Normal orbit
        pos = orbitToScene(orig.altKm, orig.incDeg, orig.raanDeg, ta)
      } else {
        // Bezier arc transfer
        isArc = true
        const frac = (i - devIdx) / Math.max(1, transferLen)

        const p0 = orbitToScene(orig.altKm, orig.incDeg, orig.raanDeg, ta)
        const p2 = orbitToScene(cur.altKm, cur.incDeg, cur.raanDeg, ta)

        // Control point: midpoint orbit pushed outward for visible arc
        const midAlt = (orig.altKm + cur.altKm) / 2 + arcHeightKm * (1 - frac * 0.5)
        const midInc = (orig.incDeg + cur.incDeg) / 2
        const midRaan = (orig.raanDeg + cur.raanDeg) / 2
        const p1 = orbitToScene(midAlt, midInc, midRaan, ta)

        // Quadratic Bezier
        const u = frac
        const w0 = (1 - u) * (1 - u)
        const w1 = 2 * (1 - u) * u
        const w2 = u * u
        pos = new THREE.Vector3(
          w0 * p0.x + w1 * p1.x + w2 * p2.x,
          w0 * p0.y + w1 * p1.y + w2 * p2.y,
          w0 * p0.z + w1 * p1.z + w2 * p2.z,
        )
      }

      pts.push([pos.x, pos.y, pos.z])

      // Color: normal part dimmer, arc part brighter
      const brightness = isArc ? 0.6 : 0.2
      cols.push([statusColor.r * brightness, statusColor.g * brightness, statusColor.b * brightness])
    }

    return { orbitPoints: pts, orbitColors: cols }
  }, [scenario])

  // Animate satellite position along the orbit
  useFrame(() => {
    if (!meshRef.current || orbitPoints.length < 2) return

    // Use simTime to determine position along orbit
    const simSec = simTimeRef.current / 1000
    const periodSec = 95 * 60 // ~95 min orbit
    const frac = ((simSec % periodSec) / periodSec)
    const idx = Math.floor(frac * orbitPoints.length) % orbitPoints.length
    const nextIdx = (idx + 1) % orbitPoints.length

    const subFrac = (frac * orbitPoints.length) - Math.floor(frac * orbitPoints.length)
    const p = orbitPoints[idx]
    const pn = orbitPoints[nextIdx]

    const x = p[0] + (pn[0] - p[0]) * subFrac
    const y = p[1] + (pn[1] - p[1]) * subFrac
    const z = p[2] + (pn[2] - p[2]) * subFrac

    meshRef.current.position.set(x, y, z)
    if (glowRef.current) glowRef.current.position.set(x, y, z)
  })

  if (!scenario || orbitPoints.length < 2) return null

  const color = THREAT_COLORS[scenario.status]?.hex ?? "#00e5ff"
  const threeColor = new THREE.Color(color)

  return (
    <group>
      {/* Full orbit path with arc — always visible */}
      <Line
        points={orbitPoints}
        vertexColors={orbitColors}
        transparent
        opacity={1}
        lineWidth={scenario.phase === 0 ? 0.8 : 1.5}
      />

      {/* Satellite dot */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.("sat-25")
        }}
      >
        <sphereGeometry args={[MARKER_SIZE, 8, 8]} />
        <meshBasicMaterial color={threeColor} />

        {/* Label */}
        {(selected || scenario.status === "threatened" || scenario.status === "watched" || scenario.status === "threat") && (
          <Html center distanceFactor={6} style={{ pointerEvents: "none", userSelect: "none" }}>
            <div style={{ transform: "translateY(-14px)", textAlign: "center", whiteSpace: "nowrap" }}>
              {scenario.phase > 0 && (
                <div style={{
                  fontSize: "8px",
                  fontWeight: 600,
                  fontFamily: "monospace",
                  color: THREAT_COLORS[scenario.status]?.hex ? `${THREAT_COLORS[scenario.status].hex}cc` : "rgba(255,145,0,0.7)",
                }}>
                  {scenario.missDistanceKm < 10
                    ? `${scenario.missDistanceKm.toFixed(1)} km`
                    : `${Math.round(scenario.missDistanceKm)} km`}
                </div>
              )}
              <div style={{
                fontSize: "6px",
                fontFamily: "monospace",
                color: "rgba(200,220,255,0.5)",
              }}>
                SJ-26
              </div>
            </div>
          </Html>
        )}
      </mesh>

      {/* Glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[MARKER_SIZE * 3, 8, 8]} />
        <meshBasicMaterial color={threeColor} transparent opacity={selected ? 0.4 : 0.2} />
      </mesh>
    </group>
  )
}

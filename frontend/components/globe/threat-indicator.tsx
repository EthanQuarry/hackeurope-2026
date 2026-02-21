"use client"

import { useMemo, useRef, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { Line, Html } from "@react-three/drei"
import * as THREE from "three"

import { geodeticToSceneVec3 } from "@/lib/geo"
import type { ThreatData } from "@/types"

interface ThreatIndicatorProps {
  threat: ThreatData
  simTimeRef: React.RefObject<number>
}

function getThreatStyle(severity: string, distanceKm: number) {
  if (severity === "threatened" || distanceKm < 1) {
    return { color: "#ff2244", opacity: 0.9, lineWidth: 2.5, dashSize: 0.015, gapSize: 0.008 }
  }
  if (severity === "watched" || distanceKm < 25) {
    return { color: "#ff9100", opacity: 0.7, lineWidth: 2, dashSize: 0.02, gapSize: 0.012 }
  }
  return { color: "#44aaff", opacity: 0.4, lineWidth: 1.2, dashSize: 0.025, gapSize: 0.015 }
}

const _camDir = new THREE.Vector3()

export function ThreatIndicator({ threat }: ThreatIndicatorProps) {
  const style = getThreatStyle(threat.severity, threat.missDistanceKm)
  const [visible, setVisible] = useState(true)

  const primaryPos = useMemo(() => {
    const [x, y, z] = geodeticToSceneVec3(
      threat.primaryPosition.lat,
      threat.primaryPosition.lon,
      threat.primaryPosition.altKm
    )
    return new THREE.Vector3(x, y, z)
  }, [threat.primaryPosition])

  const secondaryPos = useMemo(() => {
    const [x, y, z] = geodeticToSceneVec3(
      threat.secondaryPosition.lat,
      threat.secondaryPosition.lon,
      threat.secondaryPosition.altKm
    )
    return new THREE.Vector3(x, y, z)
  }, [threat.secondaryPosition])

  const linePoints = useMemo(
    () =>
      [
        [primaryPos.x, primaryPos.y, primaryPos.z],
        [secondaryPos.x, secondaryPos.y, secondaryPos.z],
      ] as [number, number, number][],
    [primaryPos, secondaryPos]
  )

  const midpoint = useMemo(
    () => new THREE.Vector3().lerpVectors(primaryPos, secondaryPos, 0.5),
    [primaryPos, secondaryPos]
  )

  // Hide label when midpoint is behind the Earth relative to camera
  useFrame(({ camera }) => {
    _camDir.copy(midpoint).normalize()
    const camToOrigin = _camDir.dot(
      _camDir.set(camera.position.x, camera.position.y, camera.position.z).normalize()
    )
    const shouldShow = camToOrigin > -0.1
    if (shouldShow !== visible) setVisible(shouldShow)
  })

  const distanceLabel =
    threat.missDistanceKm < 1
      ? `${(threat.missDistanceKm * 1000).toFixed(0)}m`
      : `${threat.missDistanceKm.toFixed(1)}km`

  const severityLabel =
    threat.severity === "threatened" ? "CRITICAL" :
    threat.severity === "watched" ? "WARN" : "LOW"

  return (
    <group>
      {/* Dashed threat line */}
      <Line
        points={linePoints}
        color={style.color}
        transparent
        opacity={style.opacity}
        lineWidth={style.lineWidth}
        dashed
        dashSize={style.dashSize}
        gapSize={style.gapSize}
      />

      {/* Distance + severity label at midpoint — hidden when behind Earth */}
      {visible && (
        <Html position={midpoint} center occlude style={{ pointerEvents: "none" }}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1px",
          }}>
            <span style={{
              fontFamily: "monospace",
              fontSize: "9px",
              fontWeight: 600,
              color: style.color,
              opacity: 0.9,
              background: "rgba(0,0,0,0.6)",
              padding: "1px 4px",
              borderRadius: "2px",
              letterSpacing: "0.5px",
            }}>
              {distanceLabel}
            </span>
            <span style={{
              fontFamily: "monospace",
              fontSize: "7px",
              color: style.color,
              opacity: 0.5,
              letterSpacing: "1px",
            }}>
              {severityLabel}
            </span>
          </div>
        </Html>
      )}
    </group>
  )
}

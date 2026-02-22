"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";

import { geodeticToSceneVec3 } from "@/lib/geo";
import {
  THREAT_COLORS,
  PROXIMITY_FLAG_THRESHOLD,
  type ThreatSeverity,
} from "@/lib/constants";
import { useGlobeStore } from "@/stores/globe-store";
import type { TrajectoryPoint } from "@/types";

interface SatelliteMarkerProps {
  id: string;
  name?: string;
  trajectory: TrajectoryPoint[];
  status: ThreatSeverity;
  size?: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
  simTimeRef: React.RefObject<number>;
  threatPercent?: number;
  threatScore?: number;
  /** Show the full predicted orbit path (faint) — used for scenario satellites */
  showFullOrbit?: boolean;
  /** Maneuver arc in scene-space xyz — rendered as separate overlay */
  maneuverArc?: [number, number, number][];
  /**
   * Whether the trajectory should loop when it reaches the end.
   * Set to false for demo satellites that should hold position at the last
   * trajectory point (e.g. GEO station-keeping) rather than snapping back.
   * @default true
   */
  loop?: boolean;
  /**
   * When true, derive effective status from trajectory phase (0-1) for progressive
   * threat display: frac < 0.35 = watched, 0.5-0.65 = blend, >= 0.65 = threatened.
   * Used for GEO loiter demo so detection escalates as satellites approach US.
   */
  useProgressiveThreat?: boolean;
}

/** Fit a Catmull-Rom spline and sample it */
function catmull(
  points: THREE.Vector3[],
  closed = false,
  samples = 600,
): THREE.Vector3[] {
  if (points.length < 4) return points;
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal", 0.2);
  return curve.getPoints(samples);
}

/** Render text to a high-DPI canvas texture for billboard sprite labels.
 *  Bold fonts for readability, mipmaps for distance, drawn once. */
function makeTextSprite(
  lines: { text: string; color: string; fontSize: number; bold?: boolean }[],
): { texture: THREE.CanvasTexture; width: number; height: number } {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")!
  const dpr = 5 // high DPR for crispness — only drawn once so cost is minimal
  const padding = 8

  // Measure
  let maxW = 0
  let totalH = padding
  const measured: { text: string; color: string; font: string; h: number }[] = []
  for (const line of lines) {
    const font = `${line.bold ? "bold " : ""}${line.fontSize * dpr}px monospace`
    ctx.font = font
    maxW = Math.max(maxW, ctx.measureText(line.text).width)
    const h = line.fontSize * dpr
    measured.push({ text: line.text, color: line.color, font, h })
    totalH += h + 4
  }
  totalH += padding

  canvas.width = Math.ceil(maxW + padding * 2)
  canvas.height = Math.ceil(totalH)

  // Draw
  let y = padding
  for (const m of measured) {
    ctx.font = m.font
    ctx.fillStyle = m.color
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText(m.text, canvas.width / 2, y)
    y += m.h + 4
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true

  return { texture, width: canvas.width / dpr, height: canvas.height / dpr }
}

const TRAIL_FRACTION = 0.2;
const MIN_TRAIL_POINTS = 10;
const MAX_TRAIL_POINTS = 800;
const MARKER_DAMPING = 0.08;

/** Billboard sprite label that follows a mesh — zero DOM, pure GPU */
function SpriteLabel({
  meshRef,
  name,
  threatPercent,
  status,
  size,
}: {
  meshRef: React.RefObject<THREE.Mesh | null>;
  name: string;
  threatPercent?: number;
  status: ThreatSeverity;
  size: number;
}) {
  const spriteRef = useRef<THREE.Sprite>(null);

  const { spriteMat, spriteScale } = useMemo(() => {
    const lines: { text: string; color: string; fontSize: number; bold?: boolean }[] = []

    if (threatPercent != null) {
      lines.push({
        text: `${threatPercent}%`,
        fontSize: 7,
        bold: true,
        color:
          (threatPercent ?? 0) >= 70
            ? "rgba(255,68,102,0.9)"   // red — high risk
            : (threatPercent ?? 0) >= 40
              ? "rgba(255,145,0,0.8)"  // orange — medium risk
              : "rgba(100,200,255,0.8)", // blue — low risk
      })
    }

    lines.push({
      text: name.length > 18 ? name.slice(0, 17) + "…" : name,
      fontSize: 5,
      color: "rgba(200,220,255,0.6)",
    })

    const { texture, width, height } = makeTextSprite(lines)

    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    })

    const aspect = width / Math.max(height, 1)
    const h = size * 11
    const w = h * aspect

    return { spriteMat: mat, spriteScale: new THREE.Vector3(w, h, 1) }
  }, [name, threatPercent, status, size])

  // Dispose texture on unmount
  useEffect(() => {
    return () => {
      spriteMat.map?.dispose()
      spriteMat.dispose()
    }
  }, [spriteMat])

  // Follow satellite — throttled to every 2nd frame for perf
  const frameCount = useRef(0)
  useFrame(() => {
    frameCount.current++
    if (frameCount.current % 2 !== 0) return // skip odd frames
    if (spriteRef.current && meshRef.current) {
      spriteRef.current.position.copy(meshRef.current.position)
      spriteRef.current.position.y += size * 10
    }
  })

  return <sprite ref={spriteRef} material={spriteMat} scale={spriteScale} />;
}

function findTimeIndex(
  trajectory: TrajectoryPoint[],
  targetTime: number,
): number {
  let lo = 0;
  let hi = trajectory.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (trajectory[mid].t <= targetTime) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Map trajectory phase (0-1) to effective status for progressive GEO loiter demo */
function progressiveStatusFromFrac(frac: number): ThreatSeverity {
  if (frac < 0.5) return "watched"
  if (frac < 0.65) return "watched"  // still blending visually via threatScore
  return "threatened"
}

/** Map trajectory phase to 0-1 threat score for flag ring (progressive demo) */
function progressiveThreatScoreFromFrac(frac: number): number {
  if (frac < 0.35) return 0.2
  if (frac < 0.5) return 0.3
  if (frac < 0.65) return 0.3 + ((frac - 0.5) / 0.15) * 0.5
  return 0.85
}

export function SatelliteMarker({
  id,
  name,
  trajectory,
  status,
  size = 0.008,
  selected = false,
  onSelect,
  simTimeRef,
  threatPercent,
  threatScore = 0,
  showFullOrbit = false,
  maneuverArc,
  loop = true,
  useProgressiveThreat = false,
}: SatelliteMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const hitboxRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const flagRingRef = useRef<THREE.Mesh>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null);
  const targetPos = useRef(new THREE.Vector3());
  const initialized = useRef(false);
  const posFlatRef = useRef<Float32Array>(new Float32Array(0));
  const [progressiveState, setProgressiveState] = useState<{
    status: ThreatSeverity;
    threatScore: number;
  } | null>(null);

  useEffect(() => {
    if (!useProgressiveThreat) setProgressiveState(null);
  }, [useProgressiveThreat]);

  const displayStatus = useProgressiveThreat && progressiveState
    ? progressiveState.status
    : status;
  const displayThreatScore = useProgressiveThreat && progressiveState
    ? progressiveState.threatScore
    : threatScore;
  const isFlagged = displayThreatScore > PROXIMITY_FLAG_THRESHOLD;

  // Friendly/allied sats: green when safe, lerp to red when threatened
  const isFriendly = displayStatus === "allied" || displayStatus === "friendly" || displayStatus === "nominal";
  const color = useMemo(() => {
    if (isFriendly && threatPercent != null && threatPercent > 0) {
      const t = Math.min(1, threatPercent / 100);
      const green = new THREE.Color("#00e676");
      const red = new THREE.Color("#ff1744");
      return "#" + green.lerp(red, t).getHexString();
    }
    return THREAT_COLORS[displayStatus]?.hex ?? "#00e676";
  }, [displayStatus, isFriendly, threatPercent]);
  const threeColor = useMemo(() => new THREE.Color(color), [color]);

  const scenePoints = useMemo(() => {
    return trajectory.map((p) => {
      const [x, y, z] = geodeticToSceneVec3(p.lat, p.lon, p.alt_km);
      return new THREE.Vector3(x, y, z);
    });
  }, [trajectory]);

  const trailLen = useMemo(
    () =>
      Math.min(
        MAX_TRAIL_POINTS,
        Math.max(
          MIN_TRAIL_POINTS,
          Math.floor(scenePoints.length * TRAIL_FRACTION),
        ),
      ) + 1,
    [scenePoints.length],
  );

  // Initial trail points — placeholder, useFrame updates within one tick
  const initialTrailPoints = useMemo(() => {
    if (scenePoints.length < 2) {
      return scenePoints
        .slice(0, 2)
        .map((p) => [p.x, p.y, p.z] as [number, number, number]);
    }
    const pts: [number, number, number][] = [];
    for (let i = 0; i < trailLen; i++) {
      const p = scenePoints[i % scenePoints.length];
      pts.push([p.x, p.y, p.z]);
    }
    return pts;
  }, [scenePoints, trailLen]);

  // Trail vertex colors — fades from dim tail to bright head
  const trailColors = useMemo(() => {
    const baseOpacity =
      displayStatus === "threatened" ? 0.85 : displayStatus === "watched" ? 0.55 : 0.35;
    const colors: [number, number, number][] = [];
    for (let i = 0; i < trailLen; i++) {
      const t = i / Math.max(1, trailLen - 1);
      const fade = Math.pow(t, 2.5);
      colors.push([
        threeColor.r * fade * baseOpacity,
        threeColor.g * fade * baseOpacity,
        threeColor.b * fade * baseOpacity,
      ]);
    }
    return colors;
  }, [threeColor, displayStatus, trailLen]);

  // Sync Line2 colors when status / color changes after mount
  useEffect(() => {
    const geo = lineRef.current?.geometry;
    if (!geo?.setColors) return;
    const flat: number[] = [];
    const baseOpacity =
      displayStatus === "threatened" ? 0.85 : displayStatus === "watched" ? 0.55 : 0.35;
    for (let i = 0; i < trailLen; i++) {
      const t = i / Math.max(1, trailLen - 1);
      const fade = Math.pow(t, 2.5);
      flat.push(
        threeColor.r * fade * baseOpacity,
        threeColor.g * fade * baseOpacity,
        threeColor.b * fade * baseOpacity,
      );
    }
    geo.setColors(flat);
  }, [threeColor, displayStatus, trailLen]);

  // Keep reusable flat array sized correctly
  useEffect(() => {
    posFlatRef.current = new Float32Array(trailLen * 3);
  }, [trailLen]);

  useFrame(() => {
    if (!meshRef.current || scenePoints.length < 2) return;

    const currentSimTime = simTimeRef.current / 1000;
    const totalDuration = trajectory[trajectory.length - 1].t - trajectory[0].t;
    if (totalDuration <= 0) return;

    const elapsed = currentSimTime - trajectory[0].t;
    // When loop=false the satellite clamps at the last trajectory point (GEO hold)
    // instead of wrapping back through Earth to the start of the orbit.
    const timeOffset = loop
      ? (((elapsed % totalDuration) + totalDuration) % totalDuration)
      : Math.min(Math.max(elapsed, 0), totalDuration);
    const loopedTime = trajectory[0].t + timeOffset;

    if (useProgressiveThreat && totalDuration > 0) {
      const frac = timeOffset / totalDuration;
      const effStatus = progressiveStatusFromFrac(frac);
      const effScore = progressiveThreatScoreFromFrac(frac);
      setProgressiveState((prev) => {
        if (prev && prev.status === effStatus && Math.abs(prev.threatScore - effScore) < 0.01) return prev;
        return { status: effStatus, threatScore: effScore };
      });
    }
    const idx = findTimeIndex(trajectory, loopedTime);
    const nextIdx = Math.min(idx + 1, trajectory.length - 1);
    const t0 = trajectory[idx].t;
    const t1 = trajectory[nextIdx].t;
    const alpha = t1 > t0 ? (loopedTime - t0) / (t1 - t0) : 0;

    targetPos.current.lerpVectors(
      scenePoints[idx],
      scenePoints[nextIdx],
      alpha,
    );

    if (!initialized.current) {
      meshRef.current.position.copy(targetPos.current);
      initialized.current = true;
    } else {
      meshRef.current.position.lerp(targetPos.current, MARKER_DAMPING);
    }

    if (glowRef.current) {
      glowRef.current.position.copy(meshRef.current.position);
    }

    if (hitboxRef.current) {
      hitboxRef.current.position.copy(meshRef.current.position);
    }

    // Animate the Bayesian flag ring — pulse scale and opacity
    if (flagRingRef.current && isFlagged) {
      flagRingRef.current.position.copy(meshRef.current.position);
      const t = (Date.now() % 1500) / 1500;
      const pulse = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
      const ringScale = 2.5 + pulse * 2.5;
      flagRingRef.current.scale.setScalar(ringScale);
      const mat = flagRingRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 * (1 - pulse);
    }

    // ── Update trail positions in Line2 geometry ───────────────────────
    const geo = lineRef.current?.geometry;
    if (geo?.setPositions) {
      const flat = posFlatRef.current;
      if (flat.length !== trailLen * 3) return; // guard against size mismatch

      const trailSegments = trailLen - 1;
      const numPts = scenePoints.length;
      const currentLoopIdx = Math.floor(
        ((loopedTime - trajectory[0].t) / totalDuration) * numPts,
      );

      for (let i = trailSegments; i >= 1; i--) {
        const trailIdx = (((currentLoopIdx - i) % numPts) + numPts) % numPts;
        const p = scenePoints[trailIdx];
        const j = trailSegments - i;
        flat[j * 3] = p.x;
        flat[j * 3 + 1] = p.y;
        flat[j * 3 + 2] = p.z;
      }
      // Last point = satellite's actual animated position
      flat[trailSegments * 3] = meshRef.current.position.x;
      flat[trailSegments * 3 + 1] = meshRef.current.position.y;
      flat[trailSegments * 3 + 2] = meshRef.current.position.z;

      geo.setPositions(flat);
    }
  });

  const labelsEnabled = useGlobeStore((s) => s.showLabels);
  const showLabel =
    selected ||
    threatPercent != null ||
    isFriendly ||
    (labelsEnabled && (displayStatus === "threatened" || displayStatus === "watched"));
  const markerSize = displayStatus === "threatened" ? size * 1.3 : size;

  // Cached Three.js geometries & materials — avoids recreation every render
  const markerGeo = useMemo(
    () => new THREE.SphereGeometry(markerSize, 12, 12),
    [markerSize],
  );
  const markerMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: threeColor }),
    [threeColor],
  );
  const glowGeo = useMemo(
    () => new THREE.SphereGeometry(markerSize * 2.5, 12, 12),
    [markerSize],
  );
  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: threeColor,
        transparent: true,
        opacity: selected ? 0.4 : displayStatus === "threatened" ? 0.25 : 0.12,
      }),
    [threeColor, selected, displayStatus],
  );
  // Invisible hitbox — 8× the marker size for easier clicking
  const hitboxGeo = useMemo(
    () => new THREE.SphereGeometry(markerSize * 8, 8, 8),
    [markerSize],
  );
  const hitboxMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        visible: false,
      }),
    [],
  );
  const flagGeo = useMemo(
    () => new THREE.SphereGeometry(markerSize, 16, 16),
    [markerSize],
  );
  const flagMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#ffcc00"),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    [],
  );

  // Full orbit ring — clean closed loop (no maneuver splice)
  const fullOrbitRing = useMemo(() => {
    if (!showFullOrbit || scenePoints.length < 4) return null;
    return catmull([...scenePoints, scenePoints[0].clone()], true, 800);
  }, [showFullOrbit, scenePoints]);

  return (
    <group>
      {/* Full orbit ring — clean spline, no maneuver */}
      {fullOrbitRing && (
        <Line
          points={fullOrbitRing}
          color={color}
          transparent
          opacity={0.15}
          lineWidth={0.6}
          dashed
          dashSize={0.01}
          gapSize={0.008}
        />
      )}

      {/* Orbit trail — positions updated every frame in useFrame */}
      <Line
        ref={lineRef}
        points={initialTrailPoints}
        vertexColors={trailColors}
        transparent
        opacity={1}
        lineWidth={
          displayStatus === "threatened" ? 1.8 : displayStatus === "watched" ? 1.4 : 1.0
        }
      />

      {/* Satellite dot */}
      <mesh
        ref={meshRef}
        geometry={markerGeo}
        material={markerMat}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(id);
        }}
      />

      {/* Invisible hitbox — much larger click target that follows the satellite */}
      <mesh
        ref={hitboxRef}
        geometry={hitboxGeo}
        material={hitboxMat}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(id);
        }}
        onPointerOver={() => { document.body.style.cursor = "pointer" }}
        onPointerOut={() => { document.body.style.cursor = "auto" }}
      />

      {/* Sprite label — pure GPU, no DOM overhead */}
      {showLabel && name && (
        <SpriteLabel
          meshRef={meshRef}
          name={name}
          threatPercent={threatPercent}
          status={displayStatus}
          size={markerSize}
        />
      )}

      {/* Glow */}
      <mesh ref={glowRef} geometry={glowGeo} material={glowMat} />

      {/* Bayesian threat flag ring — amber pulse when posterior > threshold */}
      {isFlagged && (
        <mesh ref={flagRingRef} geometry={flagGeo} material={flagMat} />
      )}
    </group>
  );
}

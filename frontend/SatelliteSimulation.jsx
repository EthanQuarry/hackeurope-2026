// =============================================
//  Box.js  — paste this into src/Box.js
// =============================================
import React, { useRef, useEffect, useMemo } from "react";
import { useFrame } from "react-three-fiber";
import create from "zustand";
import * as THREE from "three";

const SATELLITE_COUNT = 120;
const EARTH_RADIUS = 2;
const STAR_COUNT = 2500;

// -- Orbital mechanics --------------------------------------------------------
function orbitalPosition(a, inc, raan, e, anomaly) {
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(anomaly));
  const xo = r * Math.cos(anomaly);
  const zo = r * Math.sin(anomaly);
  const xi = xo;
  const yi = zo * Math.sin(inc);
  const zi = zo * Math.cos(inc);
  return [
    xi * Math.cos(raan) + zi * Math.sin(raan),
    yi,
    -xi * Math.sin(raan) + zi * Math.cos(raan)
  ];
}

// -- Initial state ------------------------------------------------------------
const satelliteIds = new Array(SATELLITE_COUNT).fill().map((_, i) => i);

function generateInitialState() {
  const params = {};
  const anomalies = {};
  for (let i = 0; i < SATELLITE_COUNT; i++) {
    const roll = Math.random();
    let altitude;
    if (roll < 0.5) altitude = EARTH_RADIUS + 0.8 + Math.random() * 1.5;
    else if (roll < 0.8) altitude = EARTH_RADIUS + 3 + Math.random() * 2;
    else altitude = EARTH_RADIUS + 6 + Math.random() * 3;

    params[i] = {
      a: altitude,
      inc: (Math.random() - 0.5) * Math.PI * 0.85,
      raan: Math.random() * Math.PI * 2,
      e: Math.random() * 0.08,
      speed:
        0.002 +
        (0.02 * EARTH_RADIUS * EARTH_RADIUS) / (altitude * altitude)
    };
    anomalies[i] = Math.random() * Math.PI * 2;
  }
  return { params, anomalies };
}

const initial = generateInitialState();

// -- Zustand store (v3 API) ---------------------------------------------------
export const useStore = create((set, get) => ({
  satellites: satelliteIds,
  params: initial.params,
  anomalies: initial.anomalies,
  mutate: () => {
    const state = get();
    const anomalies = {};
    for (let i = 0; i < SATELLITE_COUNT; i++) {
      anomalies[i] = state.anomalies[i] + state.params[i].speed;
    }
    set({ anomalies });
  }
}));

// -- Stars --------------------------------------------------------------------
export function Stars() {
  const geo = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 60 + Math.random() * 140;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);

  return (
    <points geometry={geo}>
      <pointsMaterial
        attach="material"
        color="#ffffff"
        size={0.15}
        sizeAttenuation
        transparent
        opacity={0.85}
      />
    </points>
  );
}

// -- Earth --------------------------------------------------------------------
export function Earth() {
  const earthRef = useRef();

  useFrame(() => {
    if (earthRef.current) earthRef.current.rotation.y += 0.0007;
  });

  const latLines = useMemo(() => {
    const lines = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const rad = (lat * Math.PI) / 180;
      const ringR = EARTH_RADIUS * Math.cos(rad);
      const yPos = EARTH_RADIUS * Math.sin(rad);
      const pts = [];
      for (let j = 0; j <= 128; j++) {
        const a = (j / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(ringR * Math.cos(a), yPos, ringR * Math.sin(a)));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: "#2266aa",
        transparent: true,
        opacity: 0.2
      });
      lines.push({ obj: new THREE.Line(geo, mat), key: lat });
    }
    return lines;
  }, []);

  return (
    <group>
      <mesh ref={earthRef}>
        <sphereBufferGeometry args={[EARTH_RADIUS, 64, 64]} attach="geometry" />
        <meshPhongMaterial
          attach="material"
          color="#0d3b66"
          emissive="#061a33"
          specular="#3377bb"
          shininess={20}
        />
      </mesh>

      {/* Atmosphere outer glow */}
      <mesh scale={[1.025, 1.025, 1.025]}>
        <sphereBufferGeometry args={[EARTH_RADIUS, 64, 64]} attach="geometry" />
        <meshBasicMaterial
          attach="material"
          color="#4499ff"
          transparent
          opacity={0.08}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Atmosphere inner glow */}
      <mesh scale={[1.015, 1.015, 1.015]}>
        <sphereBufferGeometry args={[EARTH_RADIUS, 64, 64]} attach="geometry" />
        <meshBasicMaterial
          attach="material"
          color="#88bbff"
          transparent
          opacity={0.04}
          side={THREE.FrontSide}
          depthWrite={false}
        />
      </mesh>

      {latLines.map(({ obj, key }) => (
        <primitive key={key} object={obj} />
      ))}
    </group>
  );
}

// -- Orbit path ---------------------------------------------------------------
export function OrbitPath({ params }) {
  const line = useMemo(() => {
    const pts = [];
    const { a, inc, raan, e } = params;
    for (let i = 0; i <= 180; i++) {
      const angle = (i / 180) * Math.PI * 2;
      const [x, y, z] = orbitalPosition(a, inc, raan, e, angle);
      pts.push(new THREE.Vector3(x, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.05
    });
    return new THREE.Line(geo, mat);
  }, [params]);

  return <primitive object={line} />;
}

// -- Single satellite (exported as "Box" for sandbox compat) ------------------
export function Box({ id }) {
  const mesh = useRef();
  const params = useStore((s) => s.params[id]);
  const anomalyRef = useRef(useStore.getState().anomalies[id]);
  const trailPositions = useRef([]);
  const frameCount = useRef(0);

  const TRAIL_LENGTH = 40;

  // Zustand v3 subscribe(callback, selector)
  useEffect(() =>
    useStore.subscribe(
      (val) => (anomalyRef.current = val),
      (state) => state.anomalies[id]
    )
  );

  const color = useMemo(() => {
    const alt = params.a - EARTH_RADIUS;
    if (alt < 2.5) return "#00ff88";
    if (alt < 5) return "#ffaa22";
    return "#ff4466";
  }, [params.a]);

  const trailColor = useMemo(() => {
    const alt = params.a - EARTH_RADIUS;
    if (alt < 2.5) return new THREE.Color("#00ff88");
    if (alt < 5) return new THREE.Color("#ffaa22");
    return new THREE.Color("#ff4466");
  }, [params.a]);

  // Pre-allocate trail geometry + line object once
  const { trailGeo, trailLine } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(TRAIL_LENGTH * 3);
    const colors = new Float32Array(TRAIL_LENGTH * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    return { trailGeo: geo, trailLine: new THREE.Line(geo, mat) };
  }, []);

  useFrame(() => {
    if (!mesh.current) return;
    const [x, y, z] = orbitalPosition(
      params.a, params.inc, params.raan, params.e, anomalyRef.current
    );
    mesh.current.position.set(x, y, z);

    // Update trail every 3 frames
    frameCount.current++;
    if (frameCount.current % 3 === 0) {
      const trail = trailPositions.current;
      trail.push(x, y, z);
      if (trail.length > TRAIL_LENGTH * 3) trail.splice(0, 3);

      const posAttr = trailGeo.attributes.position;
      const colAttr = trailGeo.attributes.color;
      const count = trail.length / 3;
      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3] = trail[i * 3];
        posAttr.array[i * 3 + 1] = trail[i * 3 + 1];
        posAttr.array[i * 3 + 2] = trail[i * 3 + 2];
        const fade = i / count;
        colAttr.array[i * 3] = trailColor.r * fade;
        colAttr.array[i * 3 + 1] = trailColor.g * fade;
        colAttr.array[i * 3 + 2] = trailColor.b * fade;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      trailGeo.setDrawRange(0, count);
    }
  });

  return (
    <group>
      <mesh ref={mesh}>
        <octahedronBufferGeometry args={[0.045, 0]} attach="geometry" />
        <meshBasicMaterial attach="material" color={color} />
      </mesh>
      <primitive object={trailLine} />
    </group>
  );
}

// -- Camera rig ---------------------------------------------------------------
export function CameraRig() {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime() * 0.06;
    const radius = 14;
    const height = 4 + Math.sin(t * 0.7) * 3;
    camera.position.x = radius * Math.sin(t);
    camera.position.z = radius * Math.cos(t);
    camera.position.y = height;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// -- Animation driver ---------------------------------------------------------
export function AnimationDriver() {
  const mutate = useStore((s) => s.mutate);
  useFrame(() => mutate());
  return null;
}

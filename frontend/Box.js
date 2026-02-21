// src/Box.js
import React, { useRef, useEffect, useMemo } from "react";
import { useFrame } from "react-three-fiber";
import create from "zustand";
import * as THREE from "three";

var SATELLITE_COUNT = 120;
var EARTH_RADIUS = 2;

// -- Orbital mechanics --------------------------------------------------------
function orbitalPosition(a, inc, raan, e, anomaly) {
  var r = (a * (1 - e * e)) / (1 + e * Math.cos(anomaly));
  var xo = r * Math.cos(anomaly);
  var zo = r * Math.sin(anomaly);
  var xi = xo;
  var yi = zo * Math.sin(inc);
  var zi = zo * Math.cos(inc);
  return [
    xi * Math.cos(raan) + zi * Math.sin(raan),
    yi,
    -xi * Math.sin(raan) + zi * Math.cos(raan)
  ];
}

// -- Initial state ------------------------------------------------------------
var boxIds = new Array(SATELLITE_COUNT).fill().map(function(_, i) {
  return i;
});

function generateParams() {
  var params = {};
  var anomalies = {};
  for (var i = 0; i < SATELLITE_COUNT; i++) {
    var roll = Math.random();
    var altitude;
    if (roll < 0.5) altitude = EARTH_RADIUS + 0.8 + Math.random() * 1.5;
    else if (roll < 0.8) altitude = EARTH_RADIUS + 3 + Math.random() * 2;
    else altitude = EARTH_RADIUS + 6 + Math.random() * 3;

    params[i] = {
      a: altitude,
      inc: (Math.random() - 0.5) * Math.PI * 0.85,
      raan: Math.random() * Math.PI * 2,
      e: Math.random() * 0.08,
      speed: 0.002 + (0.02 * EARTH_RADIUS * EARTH_RADIUS) / (altitude * altitude)
    };
    anomalies[i] = Math.random() * Math.PI * 2;
  }
  return { params: params, anomalies: anomalies };
}

var initial = generateParams();

// -- Zustand store (v3 default export + subscribe API) ------------------------
export var useStore = create(function(set, get) {
  return {
    boxes: boxIds,
    params: initial.params,
    anomalies: initial.anomalies,
    mutate: function() {
      var state = get();
      var anomalies = {};
      for (var i = 0; i < SATELLITE_COUNT; i++) {
        anomalies[i] = state.anomalies[i] + state.params[i].speed;
      }
      set({ anomalies: anomalies });
    }
  };
});

// -- Earth --------------------------------------------------------------------
export function Earth() {
  var earthRef = useRef();

  useFrame(function() {
    if (earthRef.current) earthRef.current.rotation.y += 0.0007;
  });

  var latLines = useMemo(function() {
    var lines = [];
    for (var lat = -60; lat <= 60; lat += 30) {
      var rad = (lat * Math.PI) / 180;
      var ringR = EARTH_RADIUS * Math.cos(rad);
      var yPos = EARTH_RADIUS * Math.sin(rad);
      var pts = [];
      for (var j = 0; j <= 128; j++) {
        var a = (j / 128) * Math.PI * 2;
        pts.push(
          new THREE.Vector3(ringR * Math.cos(a), yPos, ringR * Math.sin(a))
        );
      }
      var geo = new THREE.BufferGeometry().setFromPoints(pts);
      var mat = new THREE.LineBasicMaterial({
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
      {latLines.map(function(l) {
        return <primitive key={l.key} object={l.obj} />;
      })}
    </group>
  );
}

// -- Orbit path ring ----------------------------------------------------------
export function OrbitPath({ params }) {
  var line = useMemo(
    function() {
      var pts = [];
      for (var i = 0; i <= 180; i++) {
        var angle = (i / 180) * Math.PI * 2;
        var pos = orbitalPosition(params.a, params.inc, params.raan, params.e, angle);
        pts.push(new THREE.Vector3(pos[0], pos[1], pos[2]));
      }
      var geo = new THREE.BufferGeometry().setFromPoints(pts);
      var mat = new THREE.LineBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.05
      });
      return new THREE.Line(geo, mat);
    },
    [params]
  );
  return <primitive object={line} />;
}

// -- Satellite (exported as Box) ----------------------------------------------
export function Box({ id }) {
  var mesh = useRef();
  var params = useStore(function(s) {
    return s.params[id];
  });
  var anomalyRef = useRef(useStore.getState().anomalies[id]);
  var trailPositions = useRef([]);
  var frameCount = useRef(0);
  var TRAIL_LENGTH = 40;

  // Zustand v3 subscribe: subscribe(callback, selector)
  useEffect(function() {
    return useStore.subscribe(
      function(val) {
        anomalyRef.current = val;
      },
      function(state) {
        return state.anomalies[id];
      }
    );
  });

  var color = useMemo(
    function() {
      var alt = params.a - EARTH_RADIUS;
      if (alt < 2.5) return "#00ff88";
      if (alt < 5) return "#ffaa22";
      return "#ff4466";
    },
    [params.a]
  );

  var trailColor = useMemo(
    function() {
      var alt = params.a - EARTH_RADIUS;
      if (alt < 2.5) return new THREE.Color("#00ff88");
      if (alt < 5) return new THREE.Color("#ffaa22");
      return new THREE.Color("#ff4466");
    },
    [params.a]
  );

  var trailData = useMemo(function() {
    var geo = new THREE.BufferGeometry();
    var positions = new Float32Array(TRAIL_LENGTH * 3);
    var colors = new Float32Array(TRAIL_LENGTH * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setDrawRange(0, 0);
    var mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    return { geo: geo, line: new THREE.Line(geo, mat) };
  }, []);

  useFrame(function() {
    if (!mesh.current) return;
    var pos = orbitalPosition(
      params.a,
      params.inc,
      params.raan,
      params.e,
      anomalyRef.current
    );
    mesh.current.position.set(pos[0], pos[1], pos[2]);

    frameCount.current++;
    if (frameCount.current % 3 === 0) {
      var trail = trailPositions.current;
      trail.push(pos[0], pos[1], pos[2]);
      if (trail.length > TRAIL_LENGTH * 3) trail.splice(0, 3);

      var posAttr = trailData.geo.attributes.position;
      var colAttr = trailData.geo.attributes.color;
      var count = trail.length / 3;
      for (var i = 0; i < count; i++) {
        posAttr.array[i * 3] = trail[i * 3];
        posAttr.array[i * 3 + 1] = trail[i * 3 + 1];
        posAttr.array[i * 3 + 2] = trail[i * 3 + 2];
        var fade = i / count;
        colAttr.array[i * 3] = trailColor.r * fade;
        colAttr.array[i * 3 + 1] = trailColor.g * fade;
        colAttr.array[i * 3 + 2] = trailColor.b * fade;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      trailData.geo.setDrawRange(0, count);
    }
  });

  return (
    <group>
      <mesh ref={mesh}>
        <octahedronBufferGeometry args={[0.045, 0]} attach="geometry" />
        <meshBasicMaterial attach="material" color={color} />
      </mesh>
      <primitive object={trailData.line} />
    </group>
  );
}

// -- Camera rig ---------------------------------------------------------------
export function CameraRig() {
  useFrame(function(state) {
    var t = state.clock.getElapsedTime() * 0.06;
    var radius = 14;
    var height = 4 + Math.sin(t * 0.7) * 3;
    state.camera.position.x = radius * Math.sin(t);
    state.camera.position.z = radius * Math.cos(t);
    state.camera.position.y = height;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

// -- Animation driver ---------------------------------------------------------
export function AnimationDriver() {
  var mutate = useStore(function(s) {
    return s.mutate;
  });
  useFrame(function() {
    mutate();
  });
  return null;
}

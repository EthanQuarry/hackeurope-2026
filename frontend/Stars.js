// src/Stars.js
import React, { useMemo } from "react";
import * as THREE from "three";

export function Stars() {
  var geo = useMemo(function() {
    var positions = new Float32Array(2500 * 3);
    for (var i = 0; i < 2500; i++) {
      var r = 60 + Math.random() * 140;
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    var g = new THREE.BufferGeometry();
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

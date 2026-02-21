// src/App.js
import React from "react";
import { Canvas } from "react-three-fiber";

import {
  Box,
  useStore,
  Earth,
  OrbitPath,
  CameraRig,
  AnimationDriver
} from "./Box";
import { Stars } from "./Stars";

function App() {
  var boxes = useStore(function(s) {
    return s.boxes;
  });
  var params = useStore(function(s) {
    return s.params;
  });

  return (
    <Canvas
      camera={{ position: [0, 5, 14], fov: 55, near: 0.1, far: 500 }}
      style={{ background: "#000006" }}
    >
      <AnimationDriver />
      <CameraRig />

      <ambientLight intensity={0.25} />
      <pointLight position={[25, 15, 20]} intensity={1.8} color="#ffffff" />
      <pointLight position={[-20, -10, -15]} intensity={0.4} color="#4488ff" />

      <Stars />
      <Earth />

      {boxes
        .filter(function(_, i) {
          return i % 4 === 0;
        })
        .map(function(id) {
          return <OrbitPath key={"orbit-" + id} params={params[id]} />;
        })}

      {boxes.map(function(id) {
        return <Box key={id} id={id} />;
      })}
    </Canvas>
  );
}

export default App;

import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";

function RotatingModel() {
  const modelRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/rolex.glb");

  useFrame(() => {
    if (modelRef.current) {
      modelRef.current.rotation.y += 0.005; // Adjust rotation speed
    }
  });

  return <primitive ref={modelRef} object={scene} scale={0.5} />;
}

export default function ThreeScene() {
  return (
    <Canvas
      camera={{ position: [0, 1, 5], fov: 50 }}
      style={{ width: "100%", height: "50vh" }}
    >
      {/* ✅ HDR Lighting (but hidden from the background) */}
      <Environment
        files="/hdr/mainHDR.exr" // Your HDR file in /public/hdr/
        background={false} // ✅ Keeps background transparent but applies HDR
      />

      <ambientLight intensity={0.3} />
      <directionalLight position={[2, 2, 5]} intensity={0.3} />
      <RotatingModel />
    </Canvas>
  );
}

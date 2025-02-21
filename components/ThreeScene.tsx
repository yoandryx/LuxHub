import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three"; // Import THREE for typing

function RotatingModel() {
  const modelRef = useRef<THREE.Group>(null); // Define the type for useRef
  const { scene } = useGLTF("/YC-Logo.glb");

  // Rotate the model continuously inside the Canvas component
  useFrame(() => {
    if (modelRef.current) {
      modelRef.current.rotation.y += 0.001; // Adjust rotation speed
    }
  });

  return <primitive ref={modelRef} object={scene} scale={0.5} />;
}

export default function ThreeScene() {
  return (
    <Canvas camera={{ position: [0, 1, 5], fov: 50 }} style={{ width: "100%", height: "50vh" }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 2, 5]} intensity={1} />
      <RotatingModel /> {/* Render the rotating model inside Canvas */}
    </Canvas>
  );
}

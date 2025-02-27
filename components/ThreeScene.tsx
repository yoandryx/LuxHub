import React, { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

function RotatingModel() {
  const watchModel = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/3Dmodels/RolexSub.glb");

  useFrame(() => {
    if (watchModel.current) {
      watchModel.current.rotation.set(0,-2,0); // Setting initial rotation 
    }
  });

  return <primitive ref={watchModel} object={scene} scale={0.6} />;
}

export default function ThreeScene() {
  
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient ? (
    <Canvas camera={{ position: [0, 1, 5], fov: 40 }} style={{ width: "100%", height: "50vh" }}>
      <Environment
        files="/hdr/studioHDR.exr" // HDR file for lighting
        background={false} // Keeps background transparent but applies HDR
      />
      <RotatingModel /> 
      <OrbitControls enableZoom={false} enableDamping={true} enablePan={false} autoRotate />
    </Canvas>
  ) : null;
}

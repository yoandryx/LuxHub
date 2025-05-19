import { useGLTF } from "@react-three/drei";
import { useEffect } from "react";
import * as THREE from "three";

const RolexScene = () => {
  const { scene } = useGLTF("/3Dmodels/RolexSub.glb");

  

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [scene]);

  scene.rotation.set(0, 4, 0);

  return <primitive object={scene} scale={0.2} />;
};

export default RolexScene;

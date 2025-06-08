import React, { useRef, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment, OrbitControls } from "@react-three/drei";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { useScroll, useTransform, useSpring } from "framer-motion";

function AnimatedModel({ scrollYProgress }: { scrollYProgress: any }) {
  const ref = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/3Dmodels/RolexSub.glb", true); // enable draco fallback
  const [loaded, setLoaded] = useState(false);

  const scale = useTransform(scrollYProgress, [0, 1], [0.55, 0.65]);
  const extraRotation = useTransform(scrollYProgress, [0, 1], [0, Math.PI * 0.2]);

  useEffect(() => {
    try {
      if (scene) {
        console.log("🔍 GLTF scene found:", scene);

        scene.traverse((child: any) => {
          if (child.isMesh) {
            child.visible = true;
            child.material.transparent = false;
            child.material.opacity = 1;
          }
        });

        scene.position.set(0, -1, 0);
        scene.rotation.set(0, Math.PI, 0);
        scene.scale.setScalar(0.6);

        setLoaded(true);
        console.log("✅ Rolex GLB setup complete.");
      }
    } catch (error) {
      console.error("❌ Error setting up GLTF model:", error);
    }
  }, [scene]);

  useFrame(() => {
    if (ref.current && loaded) {
      try {
        ref.current.rotation.y += 0.002;
        ref.current.scale.setScalar(scale.get());
        ref.current.rotation.y += extraRotation.get() * 0.001;
      } catch (err) {
        console.error("⚠️ Error in useFrame update:", err);
      }
    }
  });

  return <primitive ref={ref} object={scene} />;
}

export default function ThreeScene() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll();
  const smoothScroll = useSpring(scrollYProgress, {
    stiffness: 70,
    damping: 20,
    mass: 0.8,
  });

  useEffect(() => {
    try {
      const el = document.querySelector(".canvasInner");
      if (el instanceof HTMLElement) {
        setTarget(el);
        console.log("🎯 .canvasInner found and set as portal target.");
      } else {
        console.warn("⚠️ .canvasInner not found or not an HTMLElement.");
      }
    } catch (error) {
      console.error("❌ Error finding .canvasInner:", error);
    }
  }, []);

  if (!target) {
    console.warn("⏳ Waiting for canvas target...");
    return null;
  }

  return createPortal(
    <Canvas camera={{ position: [0, 1.5, 5.5], fov: 35 }} style={{ background: "transparent" }}>
      <ambientLight intensity={0.8} />
      <Environment files="/hdr/studioHDR" />
      <AnimatedModel scrollYProgress={smoothScroll} />
      <OrbitControls enableZoom={false} enablePan={false} enableDamping={true} />
    </Canvas>,
    target
  );
}

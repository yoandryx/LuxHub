import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

function WavePoints() {
  const [deviceCount, setDeviceCount] = useState(60);
  const separation = 1.5;
  const shaderRef = useRef<any>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [visible, setVisible] = useState(true);
  const [fadeIn, setFadeIn] = useState(0);
  const mouse = useRef(new THREE.Vector2(0.5, 0.5));
  const rippleStrength = useRef(1.0);
  const scrollBoost = useRef(1.0); 

  useEffect(() => {
    const isHardwareAccelerated = !navigator.userAgent.includes("SwiftShader");
    if (!isHardwareAccelerated || window.innerWidth < 768) setDeviceCount(60);
  }, []);

  useEffect(() => {
    const handleVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX / window.innerWidth;
      mouse.current.y = 1 - e.clientY / window.innerHeight;
    };
    const handleClick = () => {
      rippleStrength.current = 1.5; // Click = Ripple burst
    };
    const handleScroll = () => {
      scrollBoost.current = 0.1; // Scroll = Speed up waves temporarily
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick);
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const pointGeo = useMemo(() => {
    const count = deviceCount;
    const size = count * count;
    const pos = new Float32Array(size * 3);
    const amp = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const x = i % count;
      const y = Math.floor(i / count);
      const idx = i * 3;
      pos[idx] = separation * (x - count / 2);
      pos[idx + 1] = separation * (y - count / 2);
      pos[idx + 2] = 0;
      amp[i] = 0.6 + Math.random() * 0.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aAmplitude", new THREE.BufferAttribute(amp, 1));
    return geo;
  }, [deviceCount]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uRippleStrength: { value: 1.0 },
      uScrollSpeed: { value: 0.01 },
      colorStart: { value: new THREE.Color("#1a001f") },
      colorEnd: { value: new THREE.Color("#b991ff") },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uScrollSpeed;
      varying float vZ;
      varying vec2 vUv;
      attribute float aAmplitude;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float wave = sin((pos.x + pos.y) * 0.15 + uTime * uScrollSpeed) * 0.6 * aAmplitude;
        pos.z = wave;
        vZ = pos.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = 1.5 + 1.5 * sin(uTime + pos.x * 0.1 + pos.y * 0.1);
      }
    `,
    fragmentShader: `
      uniform vec3 colorStart;
      uniform vec3 colorEnd;
      uniform vec2 uMouse;
      uniform float uRippleStrength;
      varying float vZ;
      varying vec2 vUv;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        float alpha = 2.0 - smoothstep(0.15, 0.45, dist); // tighter core

        float ripple = sin(distance(vUv, uMouse) * 15.0 - vZ * 2.0) * uRippleStrength;
        float shimmer = 0.5 + 0.5 * ripple;

        vec3 color = mix(colorStart, colorEnd, shimmer);
        gl_FragColor = vec4(color, alpha * 0.9);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useFrame(({ clock }) => {
    if (!visible) return;
    const elapsedTime = clock.getElapsedTime();

    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = elapsedTime;
      shaderRef.current.uniforms.uMouse.value.lerp(mouse.current, 0.02);

      // Gradually decay ripple and scroll effects back to 1.0
      rippleStrength.current += (1.0 - rippleStrength.current) * 0.02;
      scrollBoost.current += (0.01 - scrollBoost.current) * 0.02;

      shaderRef.current.uniforms.uRippleStrength.value = rippleStrength.current;
      shaderRef.current.uniforms.uScrollSpeed.value = scrollBoost.current;

      if (fadeIn < 1) {
        setFadeIn((prev) => Math.min(prev + 0.02, 1));
      }
      shaderRef.current.opacity = fadeIn;
    }
  });

  return (
    <group ref={groupRef} rotation={[-Math.PI / 1.8, 0, 1]}>
      <points geometry={pointGeo} dispose={null}>
        <primitive
          object={material}
          ref={shaderRef}
          attach="material"
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

export default function WaveScene() {
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop="always"
      camera={{ position: [0, 20, 60], fov: 45 }}
      style={{ width: "100%", height: "100vh", pointerEvents: "none" }}
      gl={{
        alpha: true,
        antialias: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
        failIfMajorPerformanceCaveat: false,
      }}
    >
      <ambientLight intensity={0.4} />
      <WavePoints />
      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.2} intensity={0.25} />
      </EffectComposer>
    </Canvas>
  );
}

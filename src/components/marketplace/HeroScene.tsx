import React, { useRef, useEffect, useState, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment, useProgress, Html } from '@react-three/drei';
import * as THREE from 'three';

// Label data with detailed info for hover
const TECH_LABELS = [
  {
    text: 'ON-CHAIN ESCROW',
    detail: 'Smart contract holds funds until delivery confirmed',
    code: 'ESC',
  },
  {
    text: 'NFT-BACKED',
    detail: 'Unique NFT minted with full provenance metadata',
    code: 'NFT',
  },
  {
    text: 'VERIFIED AUTH',
    detail: 'Expert authentication before blockchain mint',
    code: 'VRF',
  },
  {
    text: '3% ROYALTY',
    detail: 'Creator royalties on all secondary sales',
    code: 'ROY',
  },
];

// Loading indicator
function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div
        style={{
          color: '#c8a1ff',
          fontSize: '14px',
          fontFamily: 'system-ui',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '100px',
            height: '2px',
            background: 'rgba(200, 161, 255, 0.2)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: '#c8a1ff',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      </div>
    </Html>
  );
}

// Smooth easing function for luxurious rotation
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

// Watch model - centered on mobile, positioned right on desktop
function WatchModel({ isMobile }: { isMobile: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/3Dmodels/RolexSub-optimized.glb');
  const rotationRef = useRef({ target: 0, current: 0, velocity: 0 });

  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const material = mesh.material as THREE.MeshStandardMaterial;
          if (material) {
            material.metalness = 0.95;
            material.roughness = 0.05;
            material.envMapIntensity = 3;
            material.needsUpdate = true;
          }
        }
      });

      scene.rotation.set(0.35, 0, 0.1);
      scene.scale.setScalar(isMobile ? 1.2 : 1.6);
    }
  }, [scene, isMobile]);

  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.elapsedTime;

      // Luxurious ease-in-out rotation using multiple sine waves
      // Creates a smooth, organic rotation that speeds up and slows down
      const slowRotation = Math.sin(t * 0.15) * 0.3; // Very slow base oscillation
      const mediumRotation = Math.sin(t * 0.4) * 0.15; // Medium speed variation
      const microVariation = Math.sin(t * 1.2) * 0.02; // Subtle micro-movement

      // Combine for a smooth, luxurious feel with occasional pauses
      const pauseFactor = easeInOutSine((Math.sin(t * 0.08) + 1) / 2);
      const baseSpeed = 0.0008 + pauseFactor * 0.003; // Variable base speed

      rotationRef.current.current += baseSpeed;
      groupRef.current.rotation.y =
        rotationRef.current.current + slowRotation + mediumRotation + microVariation;

      // Gentle floating with ease-in-out
      const floatPhase = easeInOutSine((Math.sin(t * 0.25) + 1) / 2);
      groupRef.current.position.y = (isMobile ? 0.8 : 0.5) + floatPhase * 0.08 - 0.04;

      // Subtle tilt variation for extra life
      groupRef.current.rotation.x = Math.sin(t * 0.2) * 0.02;
      groupRef.current.rotation.z = Math.sin(t * 0.18) * 0.015;
    }
  });

  // Center on mobile, right side on desktop
  const xPos = isMobile ? 0 : 2;
  const yPos = isMobile ? 0.8 : 0.5;

  return (
    <group ref={groupRef} position={[xPos, yPos, 0]}>
      <primitive object={scene} />
    </group>
  );
}

// Simplified lighting - fewer lights for performance
function StudioLighting() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={2} color="#ffffff" />
      <directionalLight position={[-4, 4, 6]} intensity={1} color="#f0e8ff" />
      <pointLight position={[3, 0, 4]} intensity={1} color="#c8a1ff" />
    </>
  );
}

// Camera controller - look at watch (centered on mobile, right on desktop)
function CameraController({ isMobile }: { isMobile: boolean }) {
  const { camera } = useThree();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Subtle camera movement with ease
    const camMovement = easeInOutSine((Math.sin(t * 0.1) + 1) / 2);
    camera.position.x = (isMobile ? 0 : 0.5) + camMovement * 0.4 - 0.2;
    camera.position.y = 1 + Math.sin(t * 0.08) * 0.1;
    // Look at watch position (centered on mobile, right on desktop)
    camera.lookAt(isMobile ? 0 : 2, isMobile ? 0.8 : 0.5, 0);
  });

  return null;
}

// Single optimized glow ring
function GlowRing({ isMobile }: { isMobile: boolean }) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.05;
    }
  });

  return (
    <mesh
      ref={ringRef}
      position={[isMobile ? 0 : 2, isMobile ? 0.8 : 0.5, 0]}
      rotation={[Math.PI / 2.2, 0, 0]}
    >
      <ringGeometry args={[2.5, 2.65, 48]} />
      <meshBasicMaterial color="#c8a1ff" transparent opacity={0.08} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Particles spread across scene - positioned in front of camera
function ParticleField() {
  const particlesRef = useRef<THREE.Points>(null);

  const { geometry } = useMemo(() => {
    const count = 80;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Spread particles across visible area, closer to camera
      positions[i * 3] = (Math.random() - 0.5) * 25; // x: wide spread
      positions[i * 3 + 1] = (Math.random() - 0.5) * 15; // y: tall spread
      positions[i * 3 + 2] = Math.random() * 6 + 1; // z: in front (1-7)
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry: geo };
  }, []);

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = state.clock.elapsedTime * 0.01;
    }
  });

  return (
    <points ref={particlesRef} geometry={geometry}>
      <pointsMaterial size={0.06} color="#c8a1ff" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
}

// Futuristic HUD-style floating label
function FloatingLabel({
  label,
  position,
  opacity,
  isHovered,
  onHover,
  onLeave,
}: {
  label: (typeof TECH_LABELS)[0];
  position: { x: number; y: number };
  opacity: number;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        right: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translateY(-50%)',
        opacity,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        cursor: 'pointer',
        pointerEvents: 'auto',
        zIndex: isHovered ? 100 : Math.round(opacity * 10),
      }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Main container - angular futuristic shape */}
      <div
        style={{
          position: 'relative',
          padding: isHovered ? '12px 18px' : '8px 14px',
          background: isHovered
            ? 'linear-gradient(135deg, rgba(200, 161, 255, 0.12) 0%, rgba(13, 13, 13, 0.9) 100%)'
            : 'rgba(13, 13, 13, 0.8)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${isHovered ? 'rgba(200, 161, 255, 0.4)' : 'rgba(200, 161, 255, 0.15)'}`,
          borderRadius: '2px',
          clipPath:
            'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isHovered
            ? '0 0 30px rgba(200, 161, 255, 0.2), inset 0 0 20px rgba(200, 161, 255, 0.05)'
            : 'none',
        }}
      >
        {/* Corner accents */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '12px',
            height: '1px',
            background: isHovered ? '#c8a1ff' : 'rgba(200, 161, 255, 0.4)',
            transition: 'all 0.3s ease',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '1px',
            height: '12px',
            background: isHovered ? '#c8a1ff' : 'rgba(200, 161, 255, 0.4)',
            transition: 'all 0.3s ease',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          {/* Tech code badge */}
          <span
            style={{
              padding: '3px 6px',
              background: isHovered ? 'rgba(200, 161, 255, 0.2)' : 'transparent',
              border: '1px solid rgba(200, 161, 255, 0.4)',
              fontSize: '0.6rem',
              fontWeight: 600,
              color: '#c8a1ff',
              letterSpacing: '1.5px',
              fontFamily: '"SF Mono", "Fira Code", monospace',
              transition: 'all 0.3s ease',
            }}
          >
            {label.code}
          </span>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 500,
              color: isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.85)',
              letterSpacing: '1.5px',
              whiteSpace: 'nowrap',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              transition: 'all 0.3s ease',
            }}
          >
            {label.text}
          </span>
        </div>

        {/* Expanded detail on hover */}
        <div
          style={{
            maxHeight: isHovered ? '50px' : '0',
            overflow: 'hidden',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            marginTop: isHovered ? '8px' : '0',
            paddingTop: isHovered ? '8px' : '0',
            borderTop: isHovered ? '1px solid rgba(200, 161, 255, 0.2)' : '1px solid transparent',
          }}
        >
          <p
            style={{
              fontSize: '0.65rem',
              color: 'rgba(255, 255, 255, 0.6)',
              margin: 0,
              lineHeight: 1.5,
              maxWidth: '220px',
              letterSpacing: '0.3px',
            }}
          >
            {label.detail}
          </p>
        </div>
      </div>

      {/* Connector line with gradient */}
      <div
        style={{
          width: isHovered ? '35px' : '20px',
          height: '1px',
          background: `linear-gradient(90deg, rgba(200, 161, 255, ${isHovered ? 0.6 : 0.3}), transparent)`,
          transition: 'all 0.3s ease',
        }}
      />

      {/* Target reticle dot */}
      <div
        style={{
          position: 'relative',
          width: isHovered ? '14px' : '10px',
          height: isHovered ? '14px' : '10px',
          transition: 'all 0.3s ease',
        }}
      >
        {/* Outer ring */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: `1px solid ${isHovered ? '#c8a1ff' : 'rgba(200, 161, 255, 0.5)'}`,
            borderRadius: '50%',
            transition: 'all 0.3s ease',
          }}
        />
        {/* Inner dot */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: isHovered ? '4px' : '3px',
            height: isHovered ? '4px' : '3px',
            background: '#c8a1ff',
            borderRadius: '50%',
            boxShadow: isHovered ? '0 0 10px #c8a1ff' : 'none',
            transition: 'all 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

export default function HeroScene() {
  const [labelPositions, setLabelPositions] = useState<{ x: number; y: number; opacity: number }[]>(
    []
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const angleRef = useRef(0);

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Animate labels - positioned on right side near watch
  useEffect(() => {
    const updateLabels = () => {
      angleRef.current += 0.0015;

      const newPositions = TECH_LABELS.map((_, i) => {
        const baseAngle = (i / TECH_LABELS.length) * Math.PI * 2 - Math.PI / 2;
        const currentAngle = baseAngle + angleRef.current;

        // Labels on the right side, orbiting around watch area
        const x = 8 + Math.cos(currentAngle) * 18;
        const y = 50 + Math.sin(currentAngle) * 30;

        const depth = Math.cos(currentAngle);
        const opacity = Math.max(0.2, Math.min(1, (depth + 0.8) * 0.6));

        return { x, y, opacity };
      });

      setLabelPositions(newPositions);
    };

    const interval = setInterval(updateLabels, 33); // ~30fps instead of 50fps
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 1, 8], fov: 55 }}
        style={{ background: 'transparent' }}
        gl={{
          antialias: false, // Disable for performance
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.4,
        }}
        dpr={1} // Fixed DPR for performance
        performance={{ min: 0.5 }}
      >
        <StudioLighting />
        <CameraController isMobile={isMobile} />

        {/* Use preset instead of heavy HDR file */}
        <Environment preset="studio" background={false} />

        <Suspense fallback={<Loader />}>
          <WatchModel isMobile={isMobile} />
        </Suspense>

        <GlowRing isMobile={isMobile} />
        <ParticleField />
      </Canvas>

      {/* Floating Labels - hidden on mobile to prevent overlap */}
      {!isMobile && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          {labelPositions.map((pos, i) => (
            <FloatingLabel
              key={i}
              label={TECH_LABELS[i]}
              position={pos}
              opacity={hoveredIndex === i ? 1 : pos.opacity}
              isHovered={hoveredIndex === i}
              onHover={() => setHoveredIndex(i)}
              onLeave={() => setHoveredIndex(null)}
            />
          ))}
        </div>
      )}

      {/* Radial glow behind watch - on right side */}
      <div
        style={{
          position: 'absolute',
          top: '40%',
          right: '15%',
          transform: 'translate(50%, -50%)',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(200, 161, 255, 0.1) 0%, transparent 55%)',
          pointerEvents: 'none',
          filter: 'blur(60px)',
        }}
      />
    </div>
  );
}

useGLTF.preload('/3Dmodels/RolexSub-optimized.glb');

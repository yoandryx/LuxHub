import React, { useRef, useEffect, useState, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment, useProgress, Html } from '@react-three/drei';
import * as THREE from 'three';
import styles from '../../styles/HeroScene.module.css';

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
      <div className={styles.loaderContainer}>
        <div className={styles.loaderTrack}>
          <div className={styles.loaderProgress} style={{ width: `${progress}%` }} />
        </div>
      </div>
    </Html>
  );
}

// Smooth easing function for luxurious rotation
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

// Watch model - responsive positioning for mobile/tablet/desktop
function WatchModel({
  isMobile,
  viewportSize,
}: {
  isMobile: boolean;
  viewportSize: 'mobile' | 'tablet' | 'desktop';
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/3Dmodels/RolexSub-optimized.glb');

  // Scale based on viewport
  const scale = viewportSize === 'mobile' ? 0.9 : viewportSize === 'tablet' ? 1.2 : 1.5;

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

      // Rotate PI (180°) on Y-axis so watch dial faces the camera
      scene.rotation.set(0, 5, 0.1);
      scene.scale.setScalar(scale);
    }
  }, [scene, scale]);

  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.elapsedTime;

      // Smooth rotation for all viewports
      const maxSwing = viewportSize === 'desktop' ? Math.PI / 4 : Math.PI / 5;
      const period = 8;
      const phase = (t % period) / period;
      const smoothSwing = Math.sin(phase * Math.PI * 2) * maxSwing;
      const microMotion = Math.sin(t * 0.5) * 0.03;

      groupRef.current.rotation.y = smoothSwing + microMotion;

      // Gentle floating
      const floatPhase = easeInOutSine((Math.sin(t * 0.2) + 1) / 2);
      groupRef.current.position.y = (isMobile ? 0.1 : 0.2) + floatPhase * 0.04 - 0.02;

      // Subtle tilt for life (mobile/tablet only)
      if (isMobile) {
        groupRef.current.rotation.x = Math.sin(t * 0.12) * 0.01;
        groupRef.current.rotation.z = Math.sin(t * 0.1) * 0.008;
      }
    }
  });

  // Position: centered on mobile/tablet, right on desktop
  // On mobile, shift slightly right to make room for left-side labels
  const xPos = viewportSize === 'mobile' ? 0.3 : viewportSize === 'tablet' ? 0 : 2;
  const yPos = viewportSize === 'mobile' ? 0.1 : viewportSize === 'tablet' ? 0.2 : 0.5;

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

// Camera controller - responsive for all viewports
function CameraController({ viewportSize }: { viewportSize: 'mobile' | 'tablet' | 'desktop' }) {
  const { camera } = useThree();

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (viewportSize === 'mobile') {
      // Mobile: Camera straight on, closer for smaller watch, slightly offset to right
      camera.position.x = 0.2 + Math.sin(t * 0.06) * 0.05;
      camera.position.y = 0.5 + Math.sin(t * 0.05) * 0.02;
      camera.position.z = 5;
      camera.lookAt(0.3, 0.1, 0);
    } else if (viewportSize === 'tablet') {
      // Tablet: Centered view with subtle movement
      camera.position.x = Math.sin(t * 0.06) * 0.1;
      camera.position.y = 0.7 + Math.sin(t * 0.05) * 0.04;
      camera.position.z = 5.5;
      camera.lookAt(0, 0.2, 0);
    } else {
      // Desktop: Original camera movement
      const camMovement = easeInOutSine((Math.sin(t * 0.1) + 1) / 2);
      camera.position.x = 0.5 + camMovement * 0.4 - 0.2;
      camera.position.y = 1 + Math.sin(t * 0.08) * 0.1;
      camera.lookAt(2, 0.5, 0);
    }
  });

  return null;
}

// Single optimized glow ring - responsive
function GlowRing({ viewportSize }: { viewportSize: 'mobile' | 'tablet' | 'desktop' }) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.05;
    }
  });

  // Position based on viewport
  const xPos = viewportSize === 'mobile' ? 0.3 : viewportSize === 'tablet' ? 0 : 1;
  const yPos = viewportSize === 'mobile' ? 0.05 : viewportSize === 'tablet' ? 0.1 : 0.5;
  const ringSize = viewportSize === 'mobile' ? 1.8 : viewportSize === 'tablet' ? 2.2 : 2.5;

  return (
    <mesh ref={ringRef} position={[xPos, yPos, 0]} rotation={[Math.PI / 2.2, 0, 0]}>
      <ringGeometry args={[ringSize, ringSize + 0.15, 48]} />
      <meshBasicMaterial color="#c8a1ff" transparent opacity={0.08} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Particles spread across scene - responsive
function ParticleField({
  isMobile,
  viewportSize,
}: {
  isMobile: boolean;
  viewportSize: 'mobile' | 'tablet' | 'desktop';
}) {
  const particlesRef = useRef<THREE.Points>(null);

  const { geometry } = useMemo(() => {
    const count = viewportSize === 'mobile' ? 80 : viewportSize === 'tablet' ? 120 : 200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = Math.random() * 8 + 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry: geo };
  }, [viewportSize]);

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = state.clock.elapsedTime * 0.01;
    }
  });

  const particleSize = viewportSize === 'mobile' ? 0.1 : viewportSize === 'tablet' ? 0.08 : 0.06;

  return (
    <points ref={particlesRef} geometry={geometry}>
      <pointsMaterial
        size={particleSize}
        color="#c8a1ff"
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

// Mobile labels - Stacked cards on the left side with animated highlight
function MobileLabelsStack({ activeIndex }: { activeIndex: number }) {
  return (
    <div className={styles.mobileLabelsStack}>
      {TECH_LABELS.map((label, i) => {
        const isActive = activeIndex === i;
        return (
          <div
            key={label.code}
            className={`${styles.mobileLabelCard} ${isActive ? styles.active : ''}`}
          >
            <span className={styles.mobileLabelBadge}>{label.code}</span>
            <span className={styles.mobileLabelText}>{label.text}</span>
          </div>
        );
      })}
    </div>
  );
}

// Tablet labels - Horizontal bar at bottom with expanded detail
function TabletLabelsBar({ activeIndex }: { activeIndex: number }) {
  return (
    <div className={styles.tabletLabelsBar}>
      {/* Active label detail */}
      <div className={styles.tabletDetailBox}>
        <p className={styles.tabletDetailText}>{TECH_LABELS[activeIndex].detail}</p>
      </div>

      {/* Badge row */}
      <div className={styles.tabletBadgeRow}>
        {TECH_LABELS.map((label, i) => {
          const isActive = activeIndex === i;
          return (
            <div
              key={label.code}
              className={`${styles.tabletBadgeItem} ${isActive ? styles.active : ''}`}
            >
              <span className={styles.tabletBadgeCode}>{label.code}</span>
              {isActive && <span className={styles.tabletBadgeText}>{label.text}</span>}
            </div>
          );
        })}
      </div>
    </div>
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
      className={`${styles.floatingLabel} ${isHovered ? styles.hovered : ''}`}
      style={{
        right: `${position.x}%`,
        top: `${position.y}%`,
        opacity,
        zIndex: isHovered ? 100 : Math.round(opacity * 10),
      }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Main container - angular futuristic shape */}
      <div className={styles.floatingLabelMain}>
        {/* Corner accents */}
        <div className={styles.cornerAccentH} />
        <div className={styles.cornerAccentV} />

        <div className={styles.floatingLabelContent}>
          {/* Tech code badge */}
          <span className={styles.floatingLabelCode}>{label.code}</span>
          <span className={styles.floatingLabelText}>{label.text}</span>
        </div>

        {/* Expanded detail on hover */}
        <div className={styles.floatingLabelDetail}>
          <p className={styles.floatingLabelDetailText}>{label.detail}</p>
        </div>
      </div>

      {/* Connector line with gradient */}
      <div className={styles.floatingLabelConnector} />

      {/* Target reticle dot */}
      <div className={styles.floatingLabelReticle}>
        <div className={styles.reticleOuter} />
        <div className={styles.reticleInner} />
      </div>
    </div>
  );
}

export default function HeroScene() {
  const [labelPositions, setLabelPositions] = useState<{ x: number; y: number; opacity: number }[]>(
    []
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [viewportSize, setViewportSize] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [mobileActiveLabel, setMobileActiveLabel] = useState(0);
  const angleRef = useRef(0);

  // Check for viewport size - mobile (<480), tablet (480-1024), desktop (>1024)
  useEffect(() => {
    const checkViewport = () => {
      const width = window.innerWidth;
      if (width < 480) {
        setViewportSize('mobile');
      } else if (width < 1024) {
        setViewportSize('tablet');
      } else {
        setViewportSize('desktop');
      }
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  const isMobile = viewportSize === 'mobile' || viewportSize === 'tablet';

  // Mobile: Cycle through labels to highlight them in sync with watch rotation
  useEffect(() => {
    if (!isMobile) return;

    const cycleLabelInterval = setInterval(() => {
      setMobileActiveLabel((prev) => (prev + 1) % TECH_LABELS.length);
    }, 2500); // Change every 2.5 seconds

    return () => clearInterval(cycleLabelInterval);
  }, [isMobile]);

  // Animate labels - fixed positions around the watch with subtle floating
  // Labels arranged: top-right, right, bottom-right, bottom
  useEffect(() => {
    // Fixed base positions for each label (positioned around the watch on the right side)
    const basePositions = [
      { x: 5, y: 18 }, // ESC - top right of watch
      { x: 2, y: 38 }, // NFT - right side upper
      { x: 2, y: 62 }, // VRF - right side lower
      { x: 5, y: 82 }, // ROY - bottom right of watch
    ];

    const updateLabels = () => {
      angleRef.current += 0.008; // Slow animation speed

      const newPositions = TECH_LABELS.map((_, i) => {
        const base = basePositions[i];
        const t = angleRef.current;

        // Subtle floating motion - each label has slightly offset timing
        const offsetPhase = i * 0.8;
        const floatX = Math.sin(t + offsetPhase) * 1.5; // Small horizontal drift
        const floatY = Math.sin(t * 0.7 + offsetPhase) * 2; // Small vertical drift

        // Slight pulsing opacity for depth effect
        const breathe = 0.85 + Math.sin(t * 0.5 + offsetPhase) * 0.15;

        return {
          x: base.x + floatX,
          y: base.y + floatY,
          opacity: breathe,
        };
      });

      setLabelPositions(newPositions);
    };

    const interval = setInterval(updateLabels, 33); // ~30fps
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.heroContainer}>
      <Canvas
        camera={{ position: [0, 1, 8], fov: 55 }}
        className={styles.canvas}
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
        <CameraController viewportSize={viewportSize} />

        {/* Use preset instead of heavy HDR file */}
        <Environment preset="studio" background={false} />

        <Suspense fallback={<Loader />}>
          <WatchModel isMobile={isMobile} viewportSize={viewportSize} />
        </Suspense>

        <GlowRing viewportSize={viewportSize} />
        <ParticleField isMobile={isMobile} viewportSize={viewportSize} />
      </Canvas>

      {/* Floating Labels - responsive display */}
      {viewportSize === 'mobile' ? (
        <MobileLabelsStack activeIndex={mobileActiveLabel} />
      ) : viewportSize === 'tablet' ? (
        <TabletLabelsBar activeIndex={mobileActiveLabel} />
      ) : (
        <div className={styles.desktopLabelsContainer}>
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

      {/* Radial glow behind watch - responsive positioning */}
      <div className={`${styles.radialGlow} ${styles[viewportSize]}`} />
    </div>
  );
}

useGLTF.preload('/3Dmodels/RolexSub-optimized.glb');

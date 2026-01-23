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
  const scale = viewportSize === 'mobile' ? 0.9 : viewportSize === 'tablet' ? 1.2 : 1.8;

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
      scene.rotation.set(0, Math.PI, 0);
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
    <div
      style={{
        position: 'absolute',
        left: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      {TECH_LABELS.map((label, i) => {
        const isActive = activeIndex === i;
        return (
          <div
            key={label.code}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: isActive ? '10px 14px' : '8px 12px',
              background: isActive ? 'rgba(200, 161, 255, 0.12)' : 'rgba(13, 13, 13, 0.7)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid ${isActive ? 'rgba(200, 161, 255, 0.4)' : 'rgba(200, 161, 255, 0.15)'}`,
              borderRadius: '6px',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isActive ? 'translateX(4px) scale(1.02)' : 'translateX(0) scale(1)',
              boxShadow: isActive ? '0 4px 20px rgba(200, 161, 255, 0.15)' : 'none',
              opacity: isActive ? 1 : 0.7,
            }}
          >
            {/* Code badge */}
            <span
              style={{
                padding: '3px 6px',
                background: isActive ? 'rgba(200, 161, 255, 0.25)' : 'rgba(200, 161, 255, 0.1)',
                border: '1px solid rgba(200, 161, 255, 0.3)',
                borderRadius: '3px',
                fontSize: '0.55rem',
                fontWeight: 700,
                color: isActive ? '#c8a1ff' : 'rgba(200, 161, 255, 0.7)',
                letterSpacing: '1px',
                fontFamily: '"SF Mono", "Fira Code", monospace',
                transition: 'all 0.3s ease',
              }}
            >
              {label.code}
            </span>
            {/* Text - only show on active */}
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 500,
                color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
                letterSpacing: '0.5px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                maxWidth: isActive ? '120px' : '0px',
                opacity: isActive ? 1 : 0,
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {label.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Tablet labels - Horizontal bar at bottom with expanded detail
function TabletLabelsBar({ activeIndex }: { activeIndex: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      {/* Active label detail */}
      <div
        style={{
          padding: '8px 16px',
          background: 'rgba(13, 13, 13, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(200, 161, 255, 0.25)',
          borderRadius: '8px',
          textAlign: 'center',
          minWidth: '200px',
        }}
      >
        <p
          style={{
            fontSize: '0.7rem',
            color: 'rgba(255, 255, 255, 0.7)',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {TECH_LABELS[activeIndex].detail}
        </p>
      </div>

      {/* Badge row */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          padding: '6px 10px',
          background: 'rgba(13, 13, 13, 0.8)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(200, 161, 255, 0.2)',
          borderRadius: '8px',
        }}
      >
        {TECH_LABELS.map((label, i) => {
          const isActive = activeIndex === i;
          return (
            <div
              key={label.code}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: isActive ? '6px 12px' : '6px 8px',
                background: isActive ? 'rgba(200, 161, 255, 0.15)' : 'transparent',
                border: `1px solid ${isActive ? 'rgba(200, 161, 255, 0.4)' : 'transparent'}`,
                borderRadius: '4px',
                transition: 'all 0.3s ease',
              }}
            >
              <span
                style={{
                  fontSize: '0.6rem',
                  fontWeight: 600,
                  color: isActive ? '#c8a1ff' : 'rgba(200, 161, 255, 0.6)',
                  letterSpacing: '1px',
                  fontFamily: '"SF Mono", "Fira Code", monospace',
                }}
              >
                {label.code}
              </span>
              {isActive && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 500,
                    color: '#ffffff',
                    letterSpacing: '0.5px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label.text}
                </span>
              )}
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

      {/* Radial glow behind watch - responsive positioning */}
      <div
        style={{
          position: 'absolute',
          top: viewportSize === 'mobile' ? '40%' : viewportSize === 'tablet' ? '45%' : '40%',
          right: viewportSize === 'mobile' ? '40%' : viewportSize === 'tablet' ? '50%' : '15%',
          transform: 'translate(50%, -50%)',
          width:
            viewportSize === 'mobile' ? '280px' : viewportSize === 'tablet' ? '400px' : '600px',
          height:
            viewportSize === 'mobile' ? '280px' : viewportSize === 'tablet' ? '400px' : '600px',
          background: 'radial-gradient(circle, rgba(200, 161, 255, 0.12) 0%, transparent 55%)',
          pointerEvents: 'none',
          filter: 'blur(60px)',
        }}
      />
    </div>
  );
}

useGLTF.preload('/3Dmodels/RolexSub-optimized.glb');

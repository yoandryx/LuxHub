import { useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import RolexScene from "../marketplace/RolexScene";
import styles from "../../styles/Home.module.css";

// const steps = [
//   {
//     title: "Verification",
//     desc: "Every luxury watch uploaded is verified using blockchain-anchored authenticity records.",
//   },
//   {
//     title: "Escrow Protection",
//     desc: "Smart contract escrow protects buyers and sellers by locking funds and NFTs.",
//   },
//   {
//     title: "Ownership Transfer",
//     desc: "Once approved, NFT ownership transfers and is stored on-chain immutably.",
//   },
// ];

const steps = [
  {
    title: "Authenticity Verification",
    desc: "Each timepiece is verified by LuxHub admins and paired with a blockchain-anchored NFT containing provenance and specs.",
  },
  {
    title: "Secure Escrow",
    desc: "Funds and NFTs are held in a Solana smart contract escrow until the sale is approved, ensuring full protection for both parties.",
  },
  {
    title: "Immutable Ownership Transfer",
    desc: "Upon admin approval, ownership of the NFT is immutably transferred on-chain, completing the transaction securely and transparently.",
  },
];


const ScrollSteps = () => {
  const wrapperRef = useRef(null);

  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start start", "end end"],
  });

  const rotationY = useTransform(scrollYProgress, [0, 1], [0, Math.PI * 2]);
  const smoothRotation = useSpring(rotationY, { stiffness: 50, damping: 20 });

  return (
    <div ref={wrapperRef} className={styles.scrollWrapper}>
      <section className={styles.scrollContainer}>
        {/* 3D Rolex Canvas */}
        <div className={styles.canvasWrapper}>
          <Canvas shadows camera={{ position: [0, 0, 4], fov: 45 }}>
            <ambientLight intensity={0.4} />
            <directionalLight intensity={1} position={[3, 5, 5]} castShadow />
            <Environment preset="studio" />
            <Suspense fallback={null}>
              <RotatingRolex rotationY={smoothRotation} />
            </Suspense>
          </Canvas>
        </div>

        {/* Scroll-over Steps */}
        <div className={styles.overlaySteps}>
          {steps.map((step, i) => {
            const start = i / steps.length;
            const end = (i + 1) / steps.length;

            const rawOpacity = useTransform(
              scrollYProgress,
              [start - 0.05, start, end, end + 0.05],
              [0, 1, 1, 0]
            );
            const rawTranslateY = useTransform(scrollYProgress, [start, end], [60, 0]);

            const opacity = useSpring(rawOpacity, { stiffness: 60, damping: 20 });
            const translateY = useSpring(rawTranslateY, { stiffness: 60, damping: 20 });

            return (
              <motion.div
                key={i}
                className={styles.stepCard}
                style={{ opacity, y: translateY }}
              >
                <h2>{step.title}</h2>
                <p>{step.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Dynamic ghost scroll area based on step count */}
      <div
        className={styles.scrollSpacer}
        style={{ height: `${(steps.length - 1) * 100}vh` }}
      />
    </div>
  );
};

export default ScrollSteps;

const RotatingRolex = ({ rotationY }: { rotationY: any }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y = rotationY.get();
    }
  });
  return (
    <group ref={ref}>
      <RolexScene />
    </group>
  );
};

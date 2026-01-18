import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import styles from "../../styles/ScrollSteps.module.css";
import { FaShieldAlt, FaLock, FaExchangeAlt } from "react-icons/fa";

const steps = [
  {
    number: "01",
    title: "Verify",
    subtitle: "Authenticity Guaranteed",
    desc: "Each timepiece is verified by LuxHub experts. Blockchain-anchored NFT ensures provenance is tamper-proof and transparent.",
    icon: FaShieldAlt,
  },
  {
    number: "02",
    title: "Escrow",
    subtitle: "Protected Transaction",
    desc: "Funds and NFTs held in Solana smart contract until sale approval. Full protection for both parties.",
    icon: FaLock,
  },
  {
    number: "03",
    title: "Transfer",
    subtitle: "Immutable Ownership",
    desc: "Upon approval, NFT ownership transfers on-chain instantly. Your asset, permanently recorded.",
    icon: FaExchangeAlt,
  },
];

const ScrollSteps = () => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start start", "end end"],
  });

  // Progress bar animation
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  const smoothProgress = useSpring(progressWidth, { stiffness: 100, damping: 30 });

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      {/* Floating ambient orbs */}
      <div className={styles.ambientOrb} />
      <div className={styles.ambientOrb2} />

      {/* Progress indicator */}
      <div className={styles.progressContainer}>
        <div className={styles.progressTrack}>
          <motion.div className={styles.progressBar} style={{ width: smoothProgress }} />
        </div>
        <div className={styles.progressSteps}>
          {steps.map((step, i) => {
            const stepProgress = (i + 1) / steps.length;
            const isActive = useTransform(scrollYProgress, (v) => v >= (i / steps.length) - 0.1);

            return (
              <motion.div
                key={i}
                className={styles.progressDot}
                animate={{
                  scale: 1,
                  backgroundColor: "rgba(185, 145, 255, 0.3)",
                }}
                whileInView={{
                  scale: 1.2,
                  backgroundColor: "#b991ff",
                }}
              >
                <span>{step.number}</span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Step cards */}
      <div className={styles.stepsContainer}>
        {steps.map((step, i) => {
          const start = i / steps.length;
          const end = (i + 1) / steps.length;

          const rawOpacity = useTransform(
            scrollYProgress,
            [start - 0.05, start + 0.05, end - 0.05, end + 0.05],
            [0, 1, 1, 0]
          );
          const rawScale = useTransform(
            scrollYProgress,
            [start - 0.05, start + 0.05, end - 0.05, end + 0.05],
            [0.9, 1, 1, 0.9]
          );
          const rawY = useTransform(scrollYProgress, [start, end], [40, -20]);

          const opacity = useSpring(rawOpacity, { stiffness: 80, damping: 20 });
          const scale = useSpring(rawScale, { stiffness: 80, damping: 20 });
          const y = useSpring(rawY, { stiffness: 80, damping: 20 });

          const IconComponent = step.icon;

          return (
            <motion.div
              key={i}
              className={styles.stepCard}
              style={{ opacity, scale, y }}
            >
              {/* Glass card inner */}
              <div className={styles.cardInner}>
                {/* Step number badge */}
                <div className={styles.stepBadge}>
                  <span className={styles.stepNumber}>{step.number}</span>
                </div>

                {/* Icon */}
                <div className={styles.iconWrapper}>
                  <IconComponent />
                </div>

                {/* Content */}
                <div className={styles.cardContent}>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <span className={styles.stepSubtitle}>{step.subtitle}</span>
                  <p className={styles.stepDesc}>{step.desc}</p>
                </div>

                {/* Decorative line */}
                <div className={styles.decorLine} />
              </div>

              {/* Glow effect */}
              <div className={styles.cardGlow} />
            </motion.div>
          );
        })}
      </div>

      {/* Scroll spacer */}
      <div className={styles.scrollSpacer} />
    </div>
  );
};

export default ScrollSteps;

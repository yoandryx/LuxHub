// components/common/Loader.tsx
import React from "react";
import styles from "../../styles/Loader.module.css";
import Image from "next/image";
import orb from "../../../public/images/purpleLGG.png"; // adjust path if needed

const Loader: React.FC = () => {
  return (
    <div className={styles.orbLoaderWrapper}>
      <div className={styles.orbGlow}>
        <Image src={orb} alt="Loading..." className={styles.orb} priority />
      </div>
      {/* <p className={styles.loadingText}>
        Loading NFTs<span className={styles.dots}><span>.</span><span>.</span><span>.</span></span>
      </p> */}
    </div>
  );
};

export default Loader;

// src/components/pool/HowItWorks.tsx
// Collapsible 4-step explainer for pool lifecycle (D-13)
// LEGAL COMPLIANCE: No "invest", "shares", "ROI", "profit", "fractional ownership", "dividends"
import React, { useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';
import styles from '../../styles/PoolDetailV2.module.css';

const STEPS = [
  {
    title: 'Token Launch',
    description:
      'A luxury asset is tokenized. Tokens represent participation in the pool.',
  },
  {
    title: 'Funding the Watch',
    description:
      'Contributors buy tokens on a bonding curve. As more people join, the price rises.',
  },
  {
    title: 'Secondary Trading',
    description:
      'After graduation, tokens trade freely on the open market.',
  },
  {
    title: 'Resale and Distribution',
    description:
      'When the asset is sold, 97% of proceeds are distributed proportionally to all token holders.',
  },
] as const;

export const HowItWorks: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.howItWorksCard}>
      <button
        className={styles.howItWorksToggle}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span>How This Works</span>
        <FaChevronDown
          className={`${styles.howChevron} ${expanded ? styles.howChevronOpen : ''}`}
          size={14}
        />
      </button>

      <div
        className={`${styles.howItWorksContent} ${expanded ? styles.howItWorksExpanded : ''}`}
      >
        <div className={styles.howSteps}>
          {STEPS.map((step, i) => (
            <div key={i} className={styles.howStep}>
              <div className={styles.howStepNumber}>{i + 1}</div>
              <div className={styles.howStepText}>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HowItWorks;

// src/components/marketplace/FilterSidebar.tsx
// Modular filter sidebar for the LuxHub marketplace
import React, { useState, memo, useCallback } from 'react';
import { HiOutlineChevronDown } from 'react-icons/hi';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../../styles/FilterSidebar.module.css';

// ── Types ──────────────────────────────────────────────
export interface FilterGroup {
  key: string;
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  defaultExpanded?: boolean;
}

export interface FilterSidebarProps {
  groups: FilterGroup[];
  activeCount: number;
  onClearAll: () => void;
}

// ── FilterSection (internal) ───────────────────────────
const FilterSection = memo(
  ({ label, options, selected, onToggle, defaultExpanded = false }: Omit<FilterGroup, 'key'>) => {
    const [expanded, setExpanded] = useState(defaultExpanded);

    return (
      <div className={styles.section}>
        <button className={styles.sectionHeader} onClick={() => setExpanded((prev) => !prev)}>
          <span>{label}</span>
          <HiOutlineChevronDown
            className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
          />
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              className={styles.sectionBody}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <div className={styles.chips}>
                {options.map((opt) => (
                  <button
                    key={opt}
                    className={`${styles.chip} ${selected.includes(opt) ? styles.chipActive : ''}`}
                    onClick={() => onToggle(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

FilterSection.displayName = 'FilterSection';

// ── FilterSidebar ──────────────────────────────────────
const FilterSidebar = memo(({ groups, activeCount, onClearAll }: FilterSidebarProps) => {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h3 className={styles.title}>Filters</h3>
        {activeCount > 0 && (
          <button className={styles.clearBtn} onClick={onClearAll}>
            Clear ({activeCount})
          </button>
        )}
      </div>

      <div className={styles.sections}>
        {groups.map((group) => (
          <FilterSection
            key={group.key}
            label={group.label}
            options={group.options}
            selected={group.selected}
            onToggle={group.onToggle}
            defaultExpanded={group.defaultExpanded}
          />
        ))}
      </div>
    </aside>
  );
});

FilterSidebar.displayName = 'FilterSidebar';

export default FilterSidebar;

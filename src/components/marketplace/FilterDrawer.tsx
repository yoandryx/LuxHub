// src/components/marketplace/FilterDrawer.tsx
// Purpose-built filter drawer for mobile — slide-in from left with glass-morphism
// Extracts MobileDrawer's animation/overlay pattern without reusing its nav-specific code
import React, { useEffect, useCallback } from 'react';
import { HiOutlineX } from 'react-icons/hi';
import styles from '../../styles/FilterDrawer.module.css';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export default function FilterDrawer({
  isOpen,
  onClose,
  title = 'Filters',
  children,
}: FilterDrawerProps) {
  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />

      {/* Drawer panel */}
      <div className={styles.drawer} role="dialog" aria-modal="true" aria-label={title}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close filters">
            <HiOutlineX />
          </button>
        </div>

        {/* Scrollable content */}
        <div className={styles.content}>{children}</div>
      </div>
    </>
  );
}

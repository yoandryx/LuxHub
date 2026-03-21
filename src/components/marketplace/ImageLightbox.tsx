import React, { useEffect, useCallback, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineX } from 'react-icons/hi';
import styles from '../../styles/ImageLightbox.module.css';

interface ImageLightboxProps {
  images: string[];
  startIndex: number;
  onClose: () => void;
}

export default function ImageLightbox({ images, startIndex, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, startIndex });

  // Track current slide index
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrentIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on overlay click (not on image)
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <AnimatePresence>
      <motion.div
        className={styles.overlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={handleOverlayClick}
      >
        {/* Close button */}
        <button
          className={styles.closeButton}
          onClick={onClose}
          type="button"
          aria-label="Close lightbox"
        >
          <HiOutlineX />
        </button>

        {/* Carousel */}
        <div
          className={styles.carouselViewport}
          ref={emblaRef}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.carouselContainer}>
            {images.map((url, i) => (
              <div className={styles.carouselSlide} key={`lightbox-${i}`}>
                <img
                  src={url}
                  alt={`Photo ${i + 1} of ${images.length}`}
                  className={styles.lightboxImage}
                  draggable={false}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Counter */}
        {images.length > 1 && (
          <span className={styles.counter}>
            {currentIndex + 1} / {images.length}
          </span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

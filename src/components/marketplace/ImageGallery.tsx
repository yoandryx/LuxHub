import React, { useState, useCallback, useEffect, useMemo } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import ImageLightbox from './ImageLightbox';
import { resolveImageUrl, PLACEHOLDER_IMAGE } from '../../utils/imageUtils';
import styles from '../../styles/ImageGallery.module.css';

interface ImageGalleryProps {
  images: string[];
  primaryImage?: string;
  alt?: string;
}

export default function ImageGallery({
  images,
  primaryImage,
  alt = 'Watch photo',
}: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxStartIndex, setLightboxStartIndex] = useState(0);

  // Merge primaryImage into images array, resolve URLs, deduplicate
  const resolvedImages = useMemo(() => {
    const raw: string[] = [];
    if (primaryImage) {
      raw.push(primaryImage);
    }
    if (images?.length) {
      raw.push(...images);
    }
    // Resolve all URLs and filter falsy
    const resolved = raw
      .filter(Boolean)
      .map((url) => resolveImageUrl(url))
      .filter((url) => url && url !== PLACEHOLDER_IMAGE);
    // Deduplicate
    const unique = [...new Set(resolved)];
    return unique.length > 0 ? unique : [PLACEHOLDER_IMAGE];
  }, [images, primaryImage]);

  // Embla carousel for mobile
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });

  const onEmblaSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onEmblaSelect);
    return () => {
      emblaApi.off('select', onEmblaSelect);
    };
  }, [emblaApi, onEmblaSelect]);

  const openLightbox = useCallback((index: number) => {
    setLightboxStartIndex(index);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const hasThumbnails = resolvedImages.length > 1;

  return (
    <>
      {/* Desktop: Hero + Thumbnails */}
      <div className={styles.desktopGallery}>
        <img
          src={resolvedImages[selectedIndex]}
          alt={`${alt} - photo ${selectedIndex + 1}`}
          className={styles.heroImage}
          onClick={() => openLightbox(selectedIndex)}
          draggable={false}
        />
        {hasThumbnails && (
          <div className={styles.thumbnailStrip}>
            {resolvedImages.map((url, i) => (
              <button
                key={`thumb-${i}`}
                className={`${styles.thumbnail} ${i === selectedIndex ? styles.thumbnailActive : ''}`}
                onClick={() => setSelectedIndex(i)}
                type="button"
                aria-label={`View photo ${i + 1}`}
              >
                <img src={url} alt={`${alt} - thumbnail ${i + 1}`} draggable={false} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile: Swipeable Carousel */}
      <div className={styles.mobileGallery}>
        <div className={styles.carouselViewport} ref={emblaRef}>
          <div className={styles.carouselContainer}>
            {resolvedImages.map((url, i) => (
              <div className={styles.carouselSlide} key={`slide-${i}`}>
                <img
                  src={url}
                  alt={`${alt} - photo ${i + 1}`}
                  className={styles.carouselImage}
                  onClick={() => openLightbox(i)}
                  draggable={false}
                />
              </div>
            ))}
          </div>
        </div>
        {hasThumbnails && (
          <div className={styles.dots}>
            {resolvedImages.map((_, i) => (
              <button
                key={`dot-${i}`}
                className={`${styles.dot} ${i === selectedIndex ? styles.dotActive : ''}`}
                type="button"
                aria-label={`Go to photo ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <ImageLightbox
          images={resolvedImages}
          startIndex={lightboxStartIndex}
          onClose={closeLightbox}
        />
      )}
    </>
  );
}

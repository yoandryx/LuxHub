// src/components/common/ImageUploadZone.tsx
import React, { useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { HiOutlineX, HiOutlinePhotograph } from 'react-icons/hi';
import styles from '../../styles/ImageUploadZone.module.css';

export interface UploadedImage {
  id: string;
  url: string;
  preview?: string;
  uploading: boolean;
  progress: number;
  error?: string;
}

interface ImageUploadZoneProps {
  images: UploadedImage[];
  onChange: React.Dispatch<React.SetStateAction<UploadedImage[]>>;
  maxFiles?: number;
  maxSizeMB?: number;
  minFiles?: number;
  disabled?: boolean;
}

// --- SortableImage sub-component ---
function SortableImage({
  image,
  onRemove,
  isFirst,
  disabled,
}: {
  image: UploadedImage;
  onRemove: () => void;
  isFirst: boolean;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: image.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const src = image.preview || image.url;

  return (
    <div ref={setNodeRef} style={style} className={styles.thumbnailWrapper}>
      <img
        src={src}
        alt=""
        className={styles.thumbnail}
        draggable={false}
        {...attributes}
        {...listeners}
      />
      {/* Delete button */}
      {!disabled && (
        <button
          type="button"
          className={styles.deleteButton}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove image"
        >
          <HiOutlineX />
        </button>
      )}
      {/* Upload progress bar */}
      {image.uploading && (
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${image.progress}%` }} />
        </div>
      )}
      {/* Error indicator */}
      {image.error && <div className={styles.errorBadge}>!</div>}
      {/* Primary badge */}
      {isFirst && !image.uploading && !image.error && (
        <div className={styles.primaryBadge}>Primary</div>
      )}
    </div>
  );
}

// --- Main component ---
export default function ImageUploadZone({
  images,
  onChange,
  maxFiles = 15,
  maxSizeMB = 10,
  minFiles = 5,
  disabled = false,
}: ImageUploadZoneProps) {
  // Track previous preview URLs for cleanup
  const prevPreviewsRef = useRef<string[]>([]);

  // Cleanup blob URLs on unmount or when images change
  useEffect(() => {
    const currentPreviews = images.map((img) => img.preview).filter((p): p is string => !!p);

    // Revoke URLs that are no longer in use
    const removed = prevPreviewsRef.current.filter((url) => !currentPreviews.includes(url));
    removed.forEach((url) => URL.revokeObjectURL(url));

    prevPreviewsRef.current = currentPreviews;

    return () => {
      // Revoke all on unmount
      currentPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [images]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (disabled) return;

      // Cap to maxFiles
      const remaining = maxFiles - images.length;
      const filesToUpload = acceptedFiles.slice(0, Math.max(0, remaining));
      if (filesToUpload.length === 0) return;

      // Create placeholder entries with local previews
      const newEntries: UploadedImage[] = filesToUpload.map((file, i) => ({
        id: `upload-${Date.now()}-${i}`,
        url: '',
        preview: URL.createObjectURL(file),
        uploading: true,
        progress: 0,
      }));

      const updatedImages = [...images, ...newEntries];
      onChange(updatedImages);

      // Upload each file concurrently
      const uploadPromises = filesToUpload.map(async (file, i) => {
        const entryId = newEntries[i].id;
        try {
          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch('/api/arweave/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Upload failed');
          }

          const result = await response.json();
          const url = result.data?.uri || result.url || '';

          return { entryId, url, error: undefined };
        } catch (err: unknown) {
          const message =
            err instanceof Error
              ? err.message
              : 'Upload failed. Check your connection and try again.';
          return { entryId, url: '', error: message };
        }
      });

      const results = await Promise.all(uploadPromises);

      // Apply all results at once using functional update pattern
      onChange((prev: UploadedImage[]) =>
        prev.map((img) => {
          const result = results.find((r) => r.entryId === img.id);
          if (!result) return img;
          return {
            ...img,
            url: result.url || img.url,
            uploading: false,
            progress: result.error ? 0 : 100,
            error: result.error,
          };
        })
      );
    },
    [images, onChange, maxFiles, disabled]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxSize: maxSizeMB * 1024 * 1024,
    multiple: true,
    onDrop,
    disabled,
  });

  const handleRemove = useCallback(
    (id: string) => {
      onChange(images.filter((img) => img.id !== id));
    },
    [images, onChange]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = images.findIndex((img) => img.id === active.id);
      const newIndex = images.findIndex((img) => img.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        onChange(arrayMove(images, oldIndex, newIndex));
      }
    },
    [images, onChange]
  );

  return (
    <div className={styles.container}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`${styles.dropzone} ${isDragActive ? styles.dropzoneActive : ''} ${disabled ? styles.dropzoneDisabled : ''}`}
      >
        <input {...getInputProps()} />
        <HiOutlinePhotograph className={styles.dropzoneIcon} />
        <p className={styles.dropzoneText}>Drag photos here or click to browse</p>
        <p className={styles.dropzoneSubtext}>
          Upload at least {minFiles} photos. JPG, PNG, or WebP, max {maxSizeMB}MB each.
        </p>
        {images.length > 0 && (
          <p className={styles.dropzoneSubtext}>
            {images.length} / {maxFiles} uploaded
          </p>
        )}
      </div>

      {/* Preview grid with drag-and-drop reordering */}
      {images.length > 0 && (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={images.map((img) => img.id)} strategy={rectSortingStrategy}>
            <div className={styles.grid}>
              {images.map((image, index) => (
                <SortableImage
                  key={image.id}
                  image={image}
                  onRemove={() => handleRemove(image.id)}
                  isFirst={index === 0}
                  disabled={disabled}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Min files warning */}
      {images.length > 0 && images.length < minFiles && (
        <p className={styles.minWarning}>
          Add at least {minFiles} photos for best results ({minFiles - images.length} more needed)
        </p>
      )}
    </div>
  );
}

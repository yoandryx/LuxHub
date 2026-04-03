// src/components/vendor/BatchItemCard.tsx
// Compact accordion card — collapsed row with thumbnail + key info, expands to edit
import React, { useState, useRef } from 'react';
import { FaImage, FaTimes, FaChevronDown, FaChevronUp, FaCheckCircle, FaExclamationTriangle, FaCamera } from 'react-icons/fa';
import styles from '../../styles/BulkUpload.module.css';
import type { MappedItem, ImageInfo } from './BulkUploadWizard';

const REQUIRED_FIELDS = ['title', 'brand', 'model', 'referenceNumber', 'priceUSD'] as const;

const FIELD_CONFIG: Array<{
  key: string;
  label: string;
  fullWidth?: boolean;
  type?: string;
}> = [
  { key: 'title', label: 'Title', fullWidth: true },
  { key: 'brand', label: 'Brand' },
  { key: 'model', label: 'Model' },
  { key: 'referenceNumber', label: 'Reference #' },
  { key: 'priceUSD', label: 'Price (USD)', type: 'number' },
  { key: 'material', label: 'Material' },
  { key: 'dialColor', label: 'Dial Color' },
  { key: 'caseSize', label: 'Case Size' },
  { key: 'movement', label: 'Movement' },
  { key: 'waterResistance', label: 'Water Resistance' },
  { key: 'productionYear', label: 'Year' },
  { key: 'condition', label: 'Condition' },
  { key: 'country', label: 'Country' },
  { key: 'boxPapers', label: 'Box & Papers' },
  { key: 'features', label: 'Features', fullWidth: true },
  { key: 'description', label: 'Description', fullWidth: true },
];

interface BatchItemCardProps {
  item: MappedItem;
  index: number;
  onUpdate: (index: number, field: string, value: string | number) => void;
  onRemove: (index: number) => void;
  onImageReassign?: (fromIndex: number, toIndex: number) => void;
  onImageDrop?: (index: number, files: FileList) => void;
  allImages?: ImageInfo[];
}

export const BatchItemCard: React.FC<BatchItemCardProps> = ({
  item,
  index,
  onUpdate,
  onRemove,
  onImageDrop,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Completion check
  const requiredFilled = REQUIRED_FIELDS.every((f) => {
    const val = (item as any)[f];
    return val !== '' && val !== undefined && val !== null;
  });
  const hasImage = !!(item.imageR2Url || item.imageUrl);
  const isComplete = requiredFilled && hasImage;
  const missingCount = REQUIRED_FIELDS.filter((f) => !(item as any)[f]).length + (hasImage ? 0 : 1);

  const getFieldHighlightClass = (field: string): string => {
    const conf = item.aiConfidence?.[field] ?? 1;
    if (conf < 0.5) return styles.veryLowConfidence;
    if (conf < 0.8) return styles.lowConfidence;
    return '';
  };

  const isRequired = (field: string) =>
    (REQUIRED_FIELDS as readonly string[]).includes(field);

  const displayTitle = item.title || item.brand || `Item ${index + 1}`;
  const displaySubtext = [item.brand, item.model].filter(Boolean).join(' · ') || 'No details yet';
  const displayPrice = item.priceUSD ? `$${Number(item.priceUSD).toLocaleString()}` : '—';

  return (
    <div className={`${styles.accordionCard} ${isComplete ? styles.accordionComplete : ''}`}>
      {/* Collapsed header row */}
      <div className={styles.accordionHeader} onClick={() => setExpanded(!expanded)}>
        {/* Thumbnail — drag-drop enabled */}
        <div
          className={`${styles.accordionThumb} ${dragOver ? styles.thumbDragOver : ''}`}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
          onDragLeave={(e) => { e.stopPropagation(); setDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation(); setDragOver(false);
            if (onImageDrop && e.dataTransfer.files.length > 0) {
              onImageDrop(index, e.dataTransfer.files);
            }
          }}
        >
          {item.imageR2Url ? (
            <img src={item.imageR2Url} alt={displayTitle} />
          ) : (
            <FaImage className={styles.thumbPlaceholder} />
          )}
        </div>

        {/* Info */}
        <div className={styles.accordionInfo}>
          <span className={styles.accordionTitle}>{displayTitle}</span>
          <span className={styles.accordionSubtext}>{displaySubtext}</span>
        </div>

        {/* Price */}
        <span className={styles.accordionPrice}>{displayPrice}</span>

        {/* Quick actions — always visible */}
        <div className={styles.quickActions} onClick={(e) => e.stopPropagation()}>
          {!hasImage && (
            <button
              className={`${styles.quickBtn} ${styles.quickBtnImage}`}
              title="Add image"
              onClick={() => fileRef.current?.click()}
            >
              <FaCamera />
            </button>
          )}
          <button
            className={`${styles.quickBtn} ${styles.quickBtnDanger}`}
            title="Remove item"
            onClick={() => onRemove(index)}
          >
            <FaTimes />
          </button>
        </div>

        {/* Status */}
        <span className={`${styles.accordionStatus} ${isComplete ? styles.statusComplete : styles.statusIncomplete}`}>
          {isComplete ? (
            <FaCheckCircle />
          ) : (
            <><FaExclamationTriangle /> <span className={styles.statusCount}>{missingCount}</span></>
          )}
        </span>

        {/* Chevron */}
        <span className={styles.accordionChevron}>
          {expanded ? <FaChevronUp /> : <FaChevronDown />}
        </span>
      </div>

      {/* Hidden file input for image */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={(e) => {
          if (e.target.files && onImageDrop) onImageDrop(index, e.target.files);
        }}
      />

      {/* Expanded edit area */}
      {expanded && (
        <div className={styles.accordionBody}>
          {/* Image section */}
          <div className={styles.accordionImageSection}>
            <div
              className={`${styles.accordionImageDrop} ${dragOver ? styles.thumbDragOver : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false);
                if (onImageDrop && e.dataTransfer.files.length > 0) onImageDrop(index, e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
            >
              {item.imageR2Url ? (
                <img src={item.imageR2Url} alt={displayTitle} className={styles.accordionImagePreview} />
              ) : (
                <div className={styles.accordionImageEmpty}>
                  <FaImage />
                  <span>Drop image or click</span>
                </div>
              )}
            </div>
          </div>

          {/* Fields */}
          <div className={styles.fieldGrid}>
            {FIELD_CONFIG.map(({ key, label, fullWidth, type }) => (
              <div
                key={key}
                className={`${styles.fieldGroup} ${fullWidth ? styles.fullWidth : ''}`}
              >
                <label className={styles.fieldLabel}>
                  {label}
                  {isRequired(key) && <span className={styles.required}>*</span>}
                </label>
                <input
                  className={`${styles.fieldInput} ${getFieldHighlightClass(key)}`}
                  type={type || 'text'}
                  value={(item as any)[key] || ''}
                  placeholder={isRequired(key) && !(item as any)[key] ? 'Required' : ''}
                  onChange={(e) => onUpdate(index, key, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ))}
          </div>

          {/* Remove */}
          <div className={styles.accordionActions}>
            <button className={styles.btnGhost} onClick={() => onRemove(index)}>
              <FaTimes style={{ marginRight: '0.25rem' }} />
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchItemCard;

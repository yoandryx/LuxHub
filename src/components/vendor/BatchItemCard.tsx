// src/components/vendor/BatchItemCard.tsx
// Card-per-item editor with image preview, editable fields, and confidence highlighting
import React, { useState } from 'react';
import { FaImage, FaTimes, FaFileAlt, FaRobot, FaCodeBranch } from 'react-icons/fa';
import styles from '../../styles/BulkUpload.module.css';
import type { MappedItem, ImageInfo } from './BulkUploadWizard';

// ── Required fields ──────────────────────────────────────
const REQUIRED_FIELDS = ['title', 'brand', 'model', 'referenceNumber', 'priceUSD'] as const;

// ── All editable fields in display order ─────────────────
const FIELD_CONFIG: Array<{
  key: string;
  label: string;
  fullWidth?: boolean;
  type?: string;
  placeholder?: string;
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
  { key: 'productionYear', label: 'Production Year' },
  { key: 'condition', label: 'Condition' },
  { key: 'country', label: 'Country' },
  { key: 'boxPapers', label: 'Box & Papers' },
  { key: 'features', label: 'Features', fullWidth: true },
  { key: 'description', label: 'Description', fullWidth: true },
  { key: 'limitedEdition', label: 'Limited Edition' },
  { key: 'certificate', label: 'Certificate' },
  { key: 'warrantyInfo', label: 'Warranty' },
  { key: 'provenance', label: 'Provenance', fullWidth: true },
];

// ── Source icon component ────────────────────────────────
function SourceIcon({ source }: { source: string }) {
  switch (source) {
    case 'csv':
      return <FaFileAlt className={styles.sourceIcon} title="From CSV" />;
    case 'image':
      return <FaRobot className={styles.sourceIcon} title="AI analyzed" />;
    case 'merged':
      return <FaCodeBranch className={styles.sourceIcon} title="CSV + AI merged" />;
    default:
      return null;
  }
}

// ── Props ────────────────────────────────────────────────
interface BatchItemCardProps {
  item: MappedItem;
  index: number;
  onUpdate: (index: number, field: string, value: string | number) => void;
  onRemove: (index: number) => void;
  onImageReassign?: (fromIndex: number, toIndex: number) => void;
  allImages?: ImageInfo[];
}

export const BatchItemCard: React.FC<BatchItemCardProps> = ({
  item,
  index,
  onUpdate,
  onRemove,
  onImageReassign,
  allImages = [],
}) => {
  const [showImagePicker, setShowImagePicker] = useState(false);

  const isRequired = (field: string) =>
    (REQUIRED_FIELDS as readonly string[]).includes(field);

  const getFieldConfidence = (field: string): number => {
    return item.aiConfidence?.[field] ?? 1;
  };

  const getFieldHighlightClass = (field: string): string => {
    const conf = getFieldConfidence(field);
    if (conf < 0.5) return styles.veryLowConfidence;
    if (conf < 0.8) return styles.lowConfidence;
    return '';
  };

  const getPlaceholder = (field: string): string => {
    const conf = getFieldConfidence(field);
    if (conf < 0.5) return 'AI uncertain — please verify';
    return '';
  };

  return (
    <div className={styles.itemCard}>
      {/* Image area */}
      <div className={styles.cardImage} onClick={() => setShowImagePicker(!showImagePicker)}>
        {item.imageR2Url ? (
          <img src={item.imageR2Url} alt={item.title || `Item ${index + 1}`} />
        ) : (
          <div className={styles.cardImagePlaceholder}>
            <FaImage />
          </div>
        )}
        <span className={styles.itemBadge}>#{index + 1}</span>

        {/* Image reassignment overlay */}
        {showImagePicker && allImages.length > 0 && (
          <div
            className={styles.imageReassignDropdown}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ color: '#fff', fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
              Select image:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {allImages.map((img, imgIdx) => (
                <img
                  key={imgIdx}
                  src={img.r2Url}
                  alt={img.originalName}
                  className={`${styles.reassignThumb} ${img.r2Url === item.imageR2Url ? styles.selected : ''}`}
                  onClick={() => {
                    // Find which item currently has this image and swap
                    if (onImageReassign) {
                      // Simple: just set this item's image
                      onUpdate(index, 'imageR2Url', img.r2Url);
                    }
                    setShowImagePicker(false);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fields */}
      <div className={styles.cardBody}>
        <div className={styles.fieldGrid}>
          {FIELD_CONFIG.map(({ key, label, fullWidth, type }) => (
            <div
              key={key}
              className={`${styles.fieldGroup} ${fullWidth ? styles.fullWidth : ''}`}
            >
              <label className={styles.fieldLabel}>
                {label}
                {isRequired(key) && <span className={styles.required}>*</span>}
                <SourceIcon source={item.aiSource} />
              </label>
              <input
                className={`${styles.fieldInput} ${getFieldHighlightClass(key)}`}
                type={type || 'text'}
                value={(item as any)[key] || ''}
                placeholder={getPlaceholder(key)}
                onChange={(e) =>
                  onUpdate(index, key, type === 'number' ? e.target.value : e.target.value)
                }
              />
            </div>
          ))}
        </div>

        {/* Remove button */}
        <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
          <button className={styles.btnGhost} onClick={() => onRemove(index)}>
            <FaTimes style={{ marginRight: '0.25rem' }} />
            Remove item
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchItemCard;

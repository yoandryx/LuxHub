// src/components/vendor/CsvMappingPreview.tsx
// Editable table showing AI column mapping with confidence indicators
import React from 'react';
import styles from '../../styles/BulkUpload.module.css';

// NFT schema fields available for mapping
export const NFT_SCHEMA_FIELDS = [
  'title',
  'brand',
  'model',
  'referenceNumber',
  'priceUSD',
  'description',
  'material',
  'dialColor',
  'caseSize',
  'movement',
  'waterResistance',
  'productionYear',
  'condition',
  'features',
  'country',
  'boxPapers',
  'limitedEdition',
  'certificate',
  'warrantyInfo',
  'provenance',
  'imageUrl',
] as const;

export type NftSchemaField = (typeof NFT_SCHEMA_FIELDS)[number] | '';

interface CsvMappingPreviewProps {
  mapping: Record<string, string>;
  confidence: Record<string, number>;
  headers: string[];
  sampleData: Record<string, string>[];
  onMappingChange: (header: string, field: string) => void;
}

function getConfidenceLevel(conf: number): 'high' | 'medium' | 'low' {
  if (conf > 0.8) return 'high';
  if (conf >= 0.5) return 'medium';
  return 'low';
}

function getSelectClass(conf: number): string {
  if (conf > 0.8) return styles.highConfidence;
  if (conf >= 0.5) return styles.medConfidence;
  return styles.lowConfidence;
}

export const CsvMappingPreview: React.FC<CsvMappingPreviewProps> = ({
  mapping,
  confidence,
  headers,
  sampleData,
  onMappingChange,
}) => {
  // Get first sample row for preview
  const sample = sampleData[0] || {};

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className={styles.mappingTable}>
        <thead>
          <tr>
            <th>CSV Header</th>
            <th>Sample Value</th>
            <th>Mapped To</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {headers.map((header) => {
            const mapped = mapping[header] || '';
            const conf = confidence[header] ?? 0;
            const level = mapped ? getConfidenceLevel(conf) : 'low';

            return (
              <tr key={header} className={styles.mappingRow}>
                <td className={styles.csvHeader}>{header}</td>
                <td className={styles.sampleValue}>{sample[header] ?? '—'}</td>
                <td>
                  <select
                    className={`${styles.mappingSelect} ${mapped ? getSelectClass(conf) : ''}`}
                    value={mapped}
                    onChange={(e) => onMappingChange(header, e.target.value)}
                  >
                    <option value="">Not mapped</option>
                    {NFT_SCHEMA_FIELDS.map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {mapped ? (
                    <span
                      className={`${styles.confidenceDot} ${styles[level]}`}
                      title={`${Math.round(conf * 100)}% confidence`}
                    />
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default CsvMappingPreview;

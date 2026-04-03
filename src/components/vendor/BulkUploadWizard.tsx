// src/components/vendor/BulkUploadWizard.tsx
// 4-step wizard: CSV Upload -> Mapping Preview -> Image Upload + AI Analysis -> Review + Submit
import React, { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import Link from 'next/link';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { matchAllImages } from '../../utils/imageMatching';
import { CsvMappingPreview, NFT_SCHEMA_FIELDS } from './CsvMappingPreview';
import { BatchItemCard } from './BatchItemCard';
import { FaUpload, FaCheckCircle, FaImages, FaEdit } from 'react-icons/fa';
import toast from 'react-hot-toast';
import styles from '../../styles/BulkUpload.module.css';

// ── Types ──────────────────────────────────────────────
export interface MappedItem {
  title: string;
  brand: string;
  model: string;
  referenceNumber: string;
  priceUSD: number | string;
  description: string;
  material: string;
  dialColor: string;
  caseSize: string;
  movement: string;
  waterResistance: string;
  productionYear: string;
  condition: string;
  features: string;
  country: string;
  boxPapers: string;
  limitedEdition: string;
  certificate: string;
  warrantyInfo: string;
  provenance: string;
  imageUrl: string;
  imageR2Url: string;
  aiConfidence: Record<string, number>;
  aiSource: 'csv' | 'image' | 'merged';
  matched: boolean;
}

export interface ImageInfo {
  originalName: string;
  r2Url: string;
  preview?: string;
}

const STEP_LABELS = ['Upload File', 'Map Columns', 'Review & Submit'];

// ── Component ──────────────────────────────────────────
export const BulkUploadWizard: React.FC = () => {
  const { publicKey } = useEffectiveWallet();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  // Step 1: CSV data
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);

  // Step 2: Mapping
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<Record<string, number>>({});

  // Step 3: Images
  const [uploadedImages, setUploadedImages] = useState<ImageInfo[]>([]);
  const [imageDragOver, setImageDragOver] = useState(false);

  // Step 4: Merged items
  const [items, setItems] = useState<MappedItem[]>([]);

  // Success screen
  const [submitted, setSubmitted] = useState(false);
  const [batchResult, setBatchResult] = useState<{ batchId: string; count: number } | null>(null);

  // ── Supported file formats ─────────────────────────────
  const ACCEPTED_EXTENSIONS = ['.csv', '.tsv', '.xlsx', '.xls'];
  const ACCEPTED_MIME = '.csv,.tsv,.xlsx,.xls,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

  const isExcelFile = (name: string) => name.endsWith('.xlsx') || name.endsWith('.xls');
  const isSupportedFile = (name: string) => ACCEPTED_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

  // Parse Excel files into { headers, rows } — dynamic import to keep bundle small
  const parseExcelFile = async (file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> => {
    const XLSX = await import('xlsx');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) return reject(new Error('No sheets found in file'));
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
          if (jsonData.length === 0) return reject(new Error('Spreadsheet appears empty'));
          const headers = Object.keys(jsonData[0]);
          const rows = jsonData.map((row) =>
            Object.fromEntries(headers.map((h) => [h, String(row[h] ?? '')]))
          );
          resolve({ headers, rows });
        } catch (err: any) {
          reject(new Error(`Excel parse error: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  // Shared handler: after headers/rows are extracted, run AI mapping
  const processHeadersAndRows = useCallback(
    async (headers: string[], rows: Record<string, string>[]) => {
      setCsvHeaders(headers);
      setCsvRows(rows);

      setLoadingText('AI is mapping your columns...');
      try {
        const sampleRows = rows.slice(0, 3).map((row) => headers.map((h) => row[h] || ''));
        const allRows = rows.map((row) => headers.map((h) => row[h] || ''));

        const res = await fetch('/api/ai/map-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headers, sampleRows, allRows }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'AI mapping failed');
        }

        const data = await res.json();
        setMapping(data.mapping || {});
        setConfidence(data.confidence || {});
        setStep(2);
      } catch (err: any) {
        toast.error(err.message || 'Failed to map columns');
      } finally {
        setLoading(false);
        setLoadingText('');
      }
    },
    []
  );

  // ── Step 1: File Upload (CSV, TSV, Excel) ─────────────
  const handleCsvFile = useCallback(
    async (file: File) => {
      if (!isSupportedFile(file.name)) {
        toast.error('Supported formats: CSV, TSV, XLS, XLSX');
        return;
      }

      setLoading(true);
      const ext = file.name.split('.').pop()?.toLowerCase();
      setLoadingText(`Parsing ${ext?.toUpperCase()} file...`);

      if (isExcelFile(file.name)) {
        // Excel path
        try {
          const { headers, rows } = await parseExcelFile(file);
          if (headers.length === 0 || rows.length === 0) {
            toast.error('Spreadsheet appears empty or has no headers');
            setLoading(false);
            return;
          }
          await processHeadersAndRows(headers, rows);
        } catch (err: any) {
          toast.error(err.message || 'Failed to parse Excel file');
          setLoading(false);
        }
      } else {
        // CSV / TSV path — PapaParse auto-detects delimiter
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          encoding: 'UTF-8',
          complete: async (results) => {
            const headers = results.meta.fields || [];
            const rows = results.data;

            if (headers.length === 0 || rows.length === 0) {
              toast.error('File appears empty or has no headers');
              setLoading(false);
              return;
            }
            await processHeadersAndRows(headers, rows);
          },
          error: (err) => {
            toast.error(`Parse error: ${err.message}`);
            setLoading(false);
          },
        });
      }
    },
    [processHeadersAndRows]
  );

  const handleCsvDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleCsvFile(file);
    },
    [handleCsvFile]
  );

  // ── Step 2: Apply mapping ──────────────────────────────
  const handleMappingChange = useCallback((header: string, field: string) => {
    setMapping((prev) => ({ ...prev, [header]: field }));
  }, []);

  const applyMapping = useCallback(async () => {
    // Convert CSV rows using the mapping
    const mapped: MappedItem[] = csvRows.map((row) => {
      const item: any = {
        title: '',
        brand: '',
        model: '',
        referenceNumber: '',
        priceUSD: '',
        description: '',
        material: '',
        dialColor: '',
        caseSize: '',
        movement: '',
        waterResistance: '',
        productionYear: '',
        condition: '',
        features: '',
        country: '',
        boxPapers: '',
        limitedEdition: '',
        certificate: '',
        warrantyInfo: '',
        provenance: '',
        imageUrl: '',
        imageR2Url: '',
        aiConfidence: {} as Record<string, number>,
        aiSource: 'csv' as const,
        matched: false,
      };

      // Apply mapping
      for (const [csvHeader, nftField] of Object.entries(mapping)) {
        if (nftField && row[csvHeader]) {
          item[nftField] = row[csvHeader];
          item.aiConfidence[nftField] = confidence[csvHeader] ?? 0.5;
        }
      }

      return item as MappedItem;
    });

    // If CSV has image URLs, auto-fetch them to R2 in background
    const itemsWithUrls = mapped.filter((item) => item.imageUrl && !item.imageR2Url);
    if (itemsWithUrls.length > 0) {
      setItems(mapped);
      setStep(3); // Go to review — images load in background
      setLoading(true);
      setLoadingText(`Fetching ${itemsWithUrls.length} images from CSV URLs...`);

      try {
        const toFetch = mapped
          .map((item, i) => ({ url: item.imageUrl, index: i }))
          .filter((x) => x.url);

        const fetchRes = await fetch('/api/bulk-upload/fetch-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: toFetch }),
        });

        if (fetchRes.ok) {
          const fetchData = await fetchRes.json();
          const fetchResults = fetchData.results || [];

          setItems((prev) => {
            const updated = [...prev];
            for (const result of fetchResults) {
              if (result.r2Url && result.index < updated.length) {
                updated[result.index] = {
                  ...updated[result.index],
                  imageR2Url: result.r2Url,
                  matched: true,
                };
              }
            }
            return updated;
          });

          const newImages: ImageInfo[] = fetchResults
            .filter((r: any) => r.r2Url)
            .map((r: any) => ({ originalName: `item-${r.index}`, r2Url: r.r2Url }));
          setUploadedImages((prev) => [...prev, ...newImages]);

          const failed = fetchResults.filter((r: any) => !r.r2Url).length;
          if (failed > 0) toast.error(`${failed} image URLs failed to load`);
          else toast.success(`${newImages.length} images loaded from CSV`);
        }
      } catch (err: any) {
        toast.error('Failed to fetch CSV images — add them manually');
      } finally {
        setLoading(false);
        setLoadingText('');
      }
    } else {
      setItems(mapped);
      setStep(3); // Skip straight to review
    }
  }, [csvRows, mapping, confidence]);

  // ── Step 3: Image Upload + AI Analysis ─────────────────
  const handleImageFiles = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length === 0) {
        toast.error('No image files detected');
        return;
      }
      if (imageFiles.length > 25) {
        toast.error('Maximum 25 images per batch');
        return;
      }

      setLoading(true);
      setLoadingText(`Uploading ${imageFiles.length} images...`);

      try {
        // 1. Upload to R2
        const formData = new FormData();
        imageFiles.forEach((f) => formData.append('images', f));

        const uploadRes = await fetch('/api/bulk-upload/images', {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.error || 'Image upload failed');
        }

        const uploadData = await uploadRes.json();
        const newImages: ImageInfo[] = (uploadData.images || []).map(
          (img: { originalName: string; r2Url: string }) => ({
            originalName: img.originalName,
            r2Url: img.r2Url,
          })
        );

        setUploadedImages((prev) => [...prev, ...newImages]);

        // 2. Run AI batch analysis
        const r2Urls = newImages.map((img) => img.r2Url);
        if (r2Urls.length > 0) {
          setLoadingText(`Analyzing ${r2Urls.length} images with AI...`);

          const analyzeRes = await fetch('/api/ai/analyze-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrls: r2Urls }),
          });

          if (analyzeRes.ok) {
            const analyzeData = await analyzeRes.json();
            const results = analyzeData.results || [];

            // 3. Match images to rows client-side
            const filenames = newImages.map((img) => img.originalName);
            const matches = matchAllImages(filenames, items);

            // 4. Merge AI analysis with existing items
            setItems((prevItems) => {
              const updated = [...prevItems];

              for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const match = matches[i];
                const analysis = result?.analysis;

                if (!analysis) continue;

                const targetIdx = match?.rowIndex;
                if (targetIdx !== null && targetIdx !== undefined && targetIdx < updated.length) {
                  const item = { ...updated[targetIdx] };

                  // Merge: keep CSV value where both exist, fill AI where CSV empty
                  const aiFields: Record<string, string> = {
                    title: analysis.title || '',
                    brand: analysis.brand || '',
                    model: analysis.model || '',
                    description: analysis.description || '',
                    material: analysis.material || '',
                    dialColor: analysis.dialColor || '',
                    caseSize: analysis.caseSize || '',
                    movement: analysis.movement || '',
                    waterResistance: analysis.waterResistance || '',
                    productionYear: analysis.productionYear || '',
                    condition: analysis.condition || '',
                    features: analysis.features || '',
                    country: analysis.country || '',
                  };

                  for (const [field, aiVal] of Object.entries(aiFields)) {
                    if (!item[field as keyof MappedItem] && aiVal) {
                      (item as any)[field] = aiVal;
                      item.aiConfidence[field] = (analysis.confidence ?? 80) / 100;
                    }
                  }

                  // Assign image
                  item.imageR2Url = newImages[i]?.r2Url || item.imageR2Url;
                  item.matched = true;
                  item.aiSource = item.aiSource === 'csv' ? 'merged' : 'image';

                  updated[targetIdx] = item;
                } else {
                  // No match — create a new item from image analysis
                  const newItem: MappedItem = {
                    title: analysis.title || '',
                    brand: analysis.brand || '',
                    model: analysis.model || '',
                    referenceNumber: analysis.referenceNumber || '',
                    priceUSD: '',
                    description: analysis.description || '',
                    material: analysis.material || '',
                    dialColor: analysis.dialColor || '',
                    caseSize: analysis.caseSize || '',
                    movement: analysis.movement || '',
                    waterResistance: analysis.waterResistance || '',
                    productionYear: analysis.productionYear || '',
                    condition: analysis.condition || '',
                    features: analysis.features || '',
                    country: analysis.country || '',
                    boxPapers: '',
                    limitedEdition: '',
                    certificate: '',
                    warrantyInfo: '',
                    provenance: '',
                    imageUrl: '',
                    imageR2Url: newImages[i]?.r2Url || '',
                    aiConfidence: Object.fromEntries(
                      Object.keys(analysis).map((k) => [k, (analysis.confidence ?? 80) / 100])
                    ),
                    aiSource: 'image',
                    matched: false,
                  };
                  updated.push(newItem);
                }
              }

              return updated;
            });
          }
        }

        toast.success(`${newImages.length} images processed`);
      } catch (err: any) {
        toast.error(err.message || 'Image processing failed');
      } finally {
        setLoading(false);
        setLoadingText('');
      }
    },
    [items]
  );

  const handleImageDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setImageDragOver(false);
      handleImageFiles(e.dataTransfer.files);
    },
    [handleImageFiles]
  );

  // ── Item editing + Submit ──────────────────────────────
  const handleItemUpdate = useCallback(
    (index: number, field: string, value: string | number) => {
      setItems((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
    },
    []
  );

  const handleRemoveItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleImageReassign = useCallback(
    (fromIndex: number, toIndex: number) => {
      setItems((prev) => {
        const updated = [...prev];
        const fromUrl = updated[fromIndex]?.imageR2Url || '';
        const toUrl = updated[toIndex]?.imageR2Url || '';
        if (updated[fromIndex]) updated[fromIndex] = { ...updated[fromIndex], imageR2Url: toUrl };
        if (updated[toIndex]) updated[toIndex] = { ...updated[toIndex], imageR2Url: fromUrl };
        return updated;
      });
    },
    []
  );

  // ── Single card image drop — upload one image to a specific card ──
  const handleSingleCardImageDrop = useCallback(
    async (index: number, files: FileList) => {
      const file = Array.from(files).find((f) => f.type.startsWith('image/'));
      if (!file) return;

      setLoading(true);
      setLoadingText(`Uploading image for item ${index + 1}...`);

      try {
        const formData = new FormData();
        formData.append('images', file);

        const uploadRes = await fetch('/api/bulk-upload/images', {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) throw new Error('Upload failed');
        const uploadData = await uploadRes.json();
        const img = uploadData.images?.[0];

        if (img?.r2Url) {
          setItems((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], imageR2Url: img.r2Url, matched: true };
            return updated;
          });
          setUploadedImages((prev) => [...prev, { originalName: file.name, r2Url: img.r2Url }]);
          toast.success(`Image added to item ${index + 1}`);
        }
      } catch (err: any) {
        toast.error(err.message || 'Image upload failed');
      } finally {
        setLoading(false);
        setLoadingText('');
      }
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!publicKey) {
      toast.error('Wallet not connected');
      return;
    }

    // Validate required fields
    const incomplete = items.filter(
      (item) => !item.title || !item.brand || !item.model || !item.referenceNumber || !item.priceUSD
    );
    if (incomplete.length > 0) {
      toast.error(`${incomplete.length} items are missing required fields (title, brand, model, referenceNumber, priceUSD)`);
      return;
    }

    setLoading(true);
    setLoadingText('Submitting batch...');

    try {
      const now = new Date();
      const batchName = `Upload - ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

      const submitItems = items.map((item) => ({
        title: item.title,
        brand: item.brand,
        model: item.model,
        referenceNumber: item.referenceNumber,
        priceUSD: typeof item.priceUSD === 'string' ? parseFloat(item.priceUSD) || 0 : item.priceUSD,
        description: item.description,
        material: item.material,
        dialColor: item.dialColor,
        caseSize: item.caseSize,
        movement: item.movement,
        waterResistance: item.waterResistance,
        productionYear: item.productionYear,
        condition: item.condition,
        features: item.features,
        country: item.country,
        boxPapers: item.boxPapers,
        limitedEdition: item.limitedEdition,
        certificate: item.certificate,
        warrantyInfo: item.warrantyInfo,
        provenance: item.provenance,
        imageUrl: item.imageR2Url || item.imageUrl,
        imageR2Url: item.imageR2Url,
        aiConfidence: item.aiConfidence,
        aiSource: item.aiSource,
      }));

      const res = await fetch('/api/bulk-upload/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: submitItems,
          batchName,
          wallet: publicKey.toBase58(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Submission failed');
      }

      const data = await res.json();
      setBatchResult({ batchId: data.batchId, count: data.count });
      setSubmitted(true);
      toast.success(`Batch submitted! ${data.count} items sent for admin review.`);
    } catch (err: any) {
      toast.error(err.message || 'Submission failed');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  }, [items, publicKey]);

  // ── Render ─────────────────────────────────────────────
  if (submitted && batchResult) {
    return (
      <div className={`${styles.wizardRoot} ${styles.wizardPanel}`}>
        <div className={styles.successScreen}>
          <div className={styles.successIcon}>
            <FaCheckCircle />
          </div>
          <h2 className={styles.successTitle}>Batch Submitted!</h2>
          <p className={styles.successText}>
            {batchResult.count} items sent for admin review.
            <br />
            Batch ID: <code>{batchResult.batchId}</code>
          </p>
          <Link href="/vendor/vendorDashboard" className={styles.btnPrimary}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wizardRoot}>
      {/* Step Indicator */}
      <div className={styles.stepIndicator}>
        {STEP_LABELS.map((label, i) => {
          const num = i + 1;
          const isActive = num === step;
          const isCompleted = num < step;
          return (
            <React.Fragment key={label}>
              {i > 0 && (
                <div
                  className={`${styles.stepLine} ${isCompleted ? styles.completed : isActive ? styles.active : ''}`}
                />
              )}
              <div
                className={`${styles.stepPill} ${isActive ? styles.active : ''} ${isCompleted ? styles.completed : ''}`}
                title={label}
              >
                {isCompleted ? '\u2713' : num}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className={styles.wizardPanel}>
        {/* Loading overlay */}
        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>{loadingText}</p>
          </div>
        )}

        {/* Step 1: File Upload */}
        {!loading && step === 1 && (
          <>
            <h3 className={styles.stepTitle}>
              <FaUpload style={{ marginRight: '0.5rem', color: 'var(--accent)' }} />
              Upload Inventory
            </h3>
            <p className={styles.stepDescription}>
              Upload your watch inventory file. We&apos;ll use AI to map your columns to our schema.
            </p>
            <div
              className={styles.dropZone}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add(styles.dragOver);
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove(styles.dragOver)}
              onDrop={handleCsvDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={styles.dropIcon}>
                <FaUpload />
              </div>
              <p className={styles.dropText}>
                <strong>Click to browse</strong> or drag &amp; drop your file
              </p>
              <p className={styles.dropFormats}>CSV, TSV, Excel (.xlsx, .xls)</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_MIME}
              className={styles.hiddenInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCsvFile(file);
              }}
            />
          </>
        )}

        {/* Step 2: Mapping Preview */}
        {!loading && step === 2 && (
          <>
            <h3 className={styles.stepTitle}>
              <FaEdit style={{ marginRight: '0.5rem', color: 'var(--accent)' }} />
              Review Column Mapping
            </h3>
            <p className={styles.stepDescription}>
              AI mapped your CSV columns. Review and adjust if needed. Green = high confidence,
              yellow = check, red = uncertain.
            </p>
            <CsvMappingPreview
              mapping={mapping}
              confidence={confidence}
              headers={csvHeaders}
              sampleData={csvRows.slice(0, 3)}
              onMappingChange={handleMappingChange}
            />
            <div className={styles.buttonRow}>
              <button className={styles.btnSecondary} onClick={() => setStep(1)}>
                Back
              </button>
              <button className={styles.btnPrimary} onClick={applyMapping}>
                Apply Mapping &amp; Continue
              </button>
            </div>
          </>
        )}

        {/* Step 3: Review + Submit (with inline image support) */}
        {!loading && step === 3 && (() => {
          const REQUIRED = ['title', 'brand', 'model', 'referenceNumber', 'priceUSD'];
          const completeCount = items.filter((item) =>
            REQUIRED.every((f) => (item as any)[f]) && (item.imageR2Url || item.imageUrl)
          ).length;
          const needsImageCount = items.filter((item) => !item.imageR2Url && !item.imageUrl).length;

          return <>
            <h3 className={styles.stepTitle}>
              <FaCheckCircle style={{ marginRight: '0.5rem', color: 'var(--accent)' }} />
              Review &amp; Submit
            </h3>

            {/* Completion summary bar */}
            <div className={styles.completionBar}>
              <div className={styles.completionStats}>
                <span className={styles.completionReady}>
                  <FaCheckCircle /> {completeCount}/{items.length} ready
                </span>
                {needsImageCount > 0 && (
                  <span className={styles.completionWarning}>
                    {needsImageCount} need{needsImageCount === 1 ? 's' : ''} image
                  </span>
                )}
              </div>
              <div className={styles.completionTrack}>
                <div
                  className={styles.completionFill}
                  style={{ width: `${items.length > 0 ? (completeCount / items.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <p className={styles.stepDescription}>
              Tap to expand and edit. Drag an image onto any row, or drop multiple below.
            </p>

            {/* Batch image drop zone — AI matches to cards */}
            <div
              className={`${styles.batchImageDrop} ${imageDragOver ? styles.dragOver : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setImageDragOver(true);
              }}
              onDragLeave={() => setImageDragOver(false)}
              onDrop={handleImageDrop}
              onClick={() => imageInputRef.current?.click()}
            >
              <FaImages style={{ color: 'var(--accent)', fontSize: '1.25rem' }} />
              <span>
                <strong>Drop images here</strong> to auto-match to items, or click to browse
              </span>
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className={styles.hiddenInput}
              onChange={(e) => {
                if (e.target.files) handleImageFiles(e.target.files);
              }}
            />

            <div className={styles.cardsGrid}>
              {items.map((item, i) => (
                <BatchItemCard
                  key={i}
                  item={item}
                  index={i}
                  onUpdate={handleItemUpdate}
                  onRemove={handleRemoveItem}
                  onImageReassign={handleImageReassign}
                  onImageDrop={handleSingleCardImageDrop}
                  allImages={uploadedImages}
                />
              ))}
            </div>

            <div className={styles.buttonRow}>
              <button className={styles.btnSecondary} onClick={() => setStep(2)}>
                Back
              </button>
              <button
                className={styles.btnPrimary}
                onClick={handleSubmit}
                disabled={items.length === 0}
              >
                Submit for Review ({items.length} items)
              </button>
            </div>
          </>;
        })()}
      </div>
    </div>
  );
};

export default BulkUploadWizard;

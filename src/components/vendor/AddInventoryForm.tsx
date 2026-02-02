// src/components/vendor/AddInventoryForm.tsx
'use client';
import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Papa, { ParseResult } from 'papaparse';
import JSZip from 'jszip';
import styles from '../../styles/AddInventoryForm.module.css';
import RadixSelect from '../admins/RadixSelect';
import toast from 'react-hot-toast';
import { FaEdit, FaLayerGroup, FaUpload, FaFileDownload, FaSpinner, FaImage } from 'react-icons/fa';
import {
  HiOutlinePhotograph,
  HiOutlineDocumentText,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineX,
  HiCheck,
} from 'react-icons/hi';
import NFTPreviewCard from '../admins/NFTPreviewCard';

type Mode = 'single' | 'bulk';

interface AssetRow {
  brand: string;
  model: string;
  reference?: string;
  title?: string;
  description?: string;
  priceUSD: number;
  primary_image_url: string;
  gallery_image_urls?: string;
  primary_image_file?: string;
  gallery_image_files?: string;
  condition?: string;
  productionYear?: string;
  boxPapers?: string;
  material?: string;
  movement?: string;
  caseSize?: string;
  waterResistance?: string;
  dialColor?: string;
  country?: string;
  releaseDate?: string;
  limitedEdition?: string;
  certificate?: string;
  warrantyInfo?: string;
  provenance?: string;
  features?: string;
}

export default function AddInventoryForm({ onSuccess }: { onSuccess: () => void }) {
  const { publicKey } = useWallet();
  const [mode, setMode] = useState<Mode>('single');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>('');

  const [single, setSingle] = useState({
    brand: '',
    model: '',
    reference: '',
    title: '',
    description: '',
    priceUSD: 0,
    condition: 'Excellent',
    productionYear: '',
    boxPapers: 'Yes',
    material: '',
    movement: '',
    caseSize: '',
    waterResistance: '',
    dialColor: '',
    country: '',
    releaseDate: '',
    limitedEdition: '',
    certificate: '',
    warrantyInfo: '',
    provenance: '',
    features: '',
    images: [] as File[],
  });

  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<AssetRow[]>([]);
  const [previewRows, setPreviewRows] = useState<AssetRow[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Form validation helpers
  const requiredFields = [
    { key: 'images', label: 'Image', value: single.images.length > 0 },
    { key: 'brand', label: 'Brand', value: !!single.brand.trim() },
    { key: 'model', label: 'Model', value: !!single.model.trim() },
    { key: 'reference', label: 'Reference #', value: !!single.reference.trim() },
    { key: 'priceUSD', label: 'Price', value: single.priceUSD > 0 },
  ];

  const optionalFields = [
    { key: 'title', label: 'Title', value: !!single.title.trim() },
    { key: 'description', label: 'Description', value: !!single.description.trim() },
    { key: 'condition', label: 'Condition', value: !!single.condition },
    { key: 'material', label: 'Material', value: !!single.material.trim() },
    { key: 'movement', label: 'Movement', value: !!single.movement.trim() },
    { key: 'caseSize', label: 'Case Size', value: !!single.caseSize.trim() },
    { key: 'productionYear', label: 'Production Year', value: !!single.productionYear.trim() },
    { key: 'dialColor', label: 'Dial Color', value: !!single.dialColor.trim() },
    { key: 'waterResistance', label: 'Water Resistance', value: !!single.waterResistance.trim() },
    { key: 'boxPapers', label: 'Box & Papers', value: !!single.boxPapers },
    { key: 'country', label: 'Country', value: !!single.country.trim() },
    { key: 'limitedEdition', label: 'Limited Edition', value: !!single.limitedEdition.trim() },
    { key: 'features', label: 'Features', value: !!single.features.trim() },
    { key: 'provenance', label: 'Provenance', value: !!single.provenance.trim() },
  ];

  const requiredComplete = requiredFields.filter((f) => f.value).length;
  const optionalComplete = optionalFields.filter((f) => f.value).length;
  const totalRequired = requiredFields.length;
  const totalOptional = optionalFields.length;
  const isFormValid = requiredComplete === totalRequired;
  const completionPercent = Math.round(
    ((requiredComplete + optionalComplete) / (totalRequired + totalOptional)) * 100
  );

  const handleSingleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setSingle((prev) => ({ ...prev, images: files }));
      // Create preview for first image
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(files[0]);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    setLoading(true);
    setProgress('Processing file...');

    try {
      let rows: AssetRow[] = [];
      let imageFiles: Record<string, File> = {};

      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const result = Papa.parse<AssetRow>(text, { header: true, skipEmptyLines: true });
        rows = result.data.filter((row) => row.brand && row.model && row.priceUSD);
      } else if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        let csvText = '';
        const csvEntry = Object.values(zip.files).find((f) => f.name.endsWith('.csv') && !f.dir);
        if (!csvEntry) throw new Error('No CSV found in zip');

        csvText = await csvEntry.async('text');
        const result = Papa.parse<AssetRow>(csvText, { header: true, skipEmptyLines: true });
        rows = result.data.filter((row) => row.brand && row.model && row.priceUSD);

        for (const entry of Object.values(zip.files)) {
          if (!entry.dir && /\.(jpe?g|png|gif|webp)$/i.test(entry.name)) {
            const blob = await entry.async('blob');
            const filename = entry.name.split('/').pop()!;
            imageFiles[filename] = new File([blob], filename);
          }
        }
      } else {
        throw new Error('Please upload .csv or .zip');
      }

      setProgress('Preparing images...');
      const processedRows = await Promise.all(
        rows.map(async (row) => {
          let primaryBase64 = '';
          let galleryBase64s: string[] = [];

          if (row.primary_image_file && imageFiles[row.primary_image_file]) {
            primaryBase64 = await fileToBase64(imageFiles[row.primary_image_file]);
          } else if (row.primary_image_url) {
            primaryBase64 = row.primary_image_url;
          }

          if (row.gallery_image_files) {
            const filenames = row.gallery_image_files.split(',').map((f) => f.trim());
            galleryBase64s = await Promise.all(
              filenames.map(async (name) => {
                if (imageFiles[name]) {
                  return fileToBase64(imageFiles[name]);
                }
                return '';
              })
            ).then((b64s) => b64s.filter(Boolean));
          } else if (row.gallery_image_urls) {
            galleryBase64s = row.gallery_image_urls.split(',').map((u) => u.trim());
          }

          const allBase64s = primaryBase64 ? [primaryBase64, ...galleryBase64s] : galleryBase64s;
          return { ...row, imageBase64s: allBase64s };
        })
      );

      setParsedRows(processedRows);
      setPreviewRows(processedRows.slice(0, 5));
      setProgress('');
      toast.success(`Processed ${rows.length} assets – ready to submit`);
    } catch (err: any) {
      toast.error(err.message || 'File processing failed');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  const submitSingle = async () => {
    if (!publicKey || single.images.length === 0)
      return toast.error('Complete required fields and upload images');
    if (!single.brand || !single.model) return toast.error('Brand and Model are required');
    if (!single.reference) return toast.error('Reference number is required');
    if (!single.priceUSD || single.priceUSD <= 0) return toast.error('Valid price is required');

    setLoading(true);
    try {
      const imageBase64s = await Promise.all(single.images.map(fileToBase64));

      const res = await fetch('/api/vendor/mint-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          title: single.title || `${single.brand} ${single.model}`,
          brand: single.brand,
          model: single.model,
          referenceNumber: single.reference,
          description: single.description,
          priceUSD: single.priceUSD,
          imageBase64: imageBase64s[0], // Primary image
          // Optional attributes
          condition: single.condition,
          productionYear: single.productionYear,
          boxPapers: single.boxPapers,
          material: single.material,
          movement: single.movement,
          waterResistance: single.waterResistance,
          dialColor: single.dialColor,
          country: single.country,
          releaseDate: single.releaseDate,
          limitedEdition: single.limitedEdition,
          certificate: single.certificate,
          warrantyInfo: single.warrantyInfo,
          caseSize: single.caseSize,
          provenance: single.provenance,
          features: single.features,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      toast.success('Mint request submitted for admin review!');
      onSuccess();
      setSingle((prev) => ({
        ...prev,
        images: [],
        brand: '',
        model: '',
        reference: '',
        title: '',
        description: '',
        priceUSD: 0,
      }));
      setImagePreview(null);
    } catch (err: any) {
      toast.error(err.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  const submitBulk = async () => {
    if (parsedRows.length === 0) return toast.error('No assets to submit');
    if (!publicKey) return toast.error('Connect wallet first');
    setLoading(true);
    setProgress(`Submitting 0/${parsedRows.length}...`);

    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        setProgress(`Submitting ${i + 1}/${parsedRows.length}...`);

        const imageBase64s = (row as any).imageBase64s || [];
        const primaryImage = imageBase64s[0] || row.primary_image_url || '';

        if (!primaryImage) {
          console.warn(`Row ${i + 1}: No image, skipping`);
          failCount++;
          continue;
        }

        if (!row.reference) {
          console.warn(`Row ${i + 1}: No reference number, skipping`);
          failCount++;
          continue;
        }

        try {
          const res = await fetch('/api/vendor/mint-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet: publicKey.toBase58(),
              title: row.title || `${row.brand} ${row.model}`,
              brand: row.brand,
              model: row.model,
              referenceNumber: row.reference,
              description: row.description,
              priceUSD: row.priceUSD,
              imageBase64: primaryImage,
              // Optional attributes
              condition: row.condition,
              productionYear: row.productionYear,
              boxPapers: row.boxPapers,
              material: row.material,
              movement: row.movement,
              waterResistance: row.waterResistance,
              dialColor: row.dialColor,
              country: row.country,
              releaseDate: row.releaseDate,
              limitedEdition: row.limitedEdition,
              certificate: row.certificate,
              warrantyInfo: row.warrantyInfo,
              caseSize: row.caseSize,
              provenance: row.provenance,
              features: row.features,
            }),
          });

          if (res.ok) {
            successCount++;
          } else {
            const data = await res.json();
            console.warn(`Row ${i + 1} failed:`, data.error);
            failCount++;
          }
        } catch (err) {
          console.warn(`Row ${i + 1} error:`, err);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} mint request(s) submitted for admin review!`);
        onSuccess();
      }
      if (failCount > 0) {
        toast.error(`${failCount} item(s) failed to submit`);
      }

      setParsedRows([]);
      setPreviewRows([]);
      setBulkFile(null);
    } catch (err) {
      toast.error('Bulk submission failed');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  return (
    <div className={styles.inventoryContainer}>
      {/* Single Mode */}
      {mode === 'single' && (
        <div className={styles.formLayout}>
          <div className={styles.formColumn}>
            {/* Image Upload Section */}
            <div className={styles.formCard}>
              <div className={styles.formSectionTitle}>
                <HiOutlinePhotograph />
                <span>Asset Images</span>
              </div>

              <div className={styles.imageUploadZone}>
                <input
                  type="file"
                  id="imageUpload"
                  multiple
                  accept="image/*"
                  onChange={handleSingleImage}
                  className={styles.hiddenInput}
                />
                <label htmlFor="imageUpload" className={styles.uploadLabel}>
                  <FaImage className={styles.uploadIcon} />
                  <span className={styles.uploadText}>
                    {single.images.length > 0
                      ? `${single.images.length} image${single.images.length > 1 ? 's' : ''} selected`
                      : 'Click to upload images'}
                  </span>
                  <span className={styles.uploadHint}>PNG, JPG, WEBP up to 10MB each</span>
                </label>
              </div>

              {single.images.length > 0 && (
                <div className={styles.imagePreviewGrid}>
                  {single.images.map((file, idx) => (
                    <div key={idx} className={styles.imagePreviewItem}>
                      <img src={URL.createObjectURL(file)} alt={`Preview ${idx + 1}`} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Basic Information */}
            <div className={styles.formCard}>
              <div className={styles.formSectionTitle}>
                <HiOutlineDocumentText />
                <span>Basic Information</span>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Brand *</label>
                  <input
                    className={styles.formInput}
                    value={single.brand}
                    onChange={(e) => setSingle((p) => ({ ...p, brand: e.target.value }))}
                    placeholder="Rolex"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Model *</label>
                  <input
                    className={styles.formInput}
                    value={single.model}
                    onChange={(e) => setSingle((p) => ({ ...p, model: e.target.value }))}
                    placeholder="Submariner"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Reference *</label>
                  <input
                    className={styles.formInput}
                    value={single.reference}
                    onChange={(e) => setSingle((p) => ({ ...p, reference: e.target.value }))}
                    placeholder="126610LN"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Price (USD) *</label>
                  <input
                    className={styles.formInput}
                    type="number"
                    value={single.priceUSD || ''}
                    onChange={(e) =>
                      setSingle((p) => ({ ...p, priceUSD: Number(e.target.value) || 0 }))
                    }
                    placeholder="15000"
                  />
                </div>

                <div className={styles.formFieldFull}>
                  <label className={styles.formLabel}>Title (Optional)</label>
                  <input
                    className={styles.formInput}
                    value={single.title}
                    onChange={(e) => setSingle((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Custom display title"
                  />
                </div>

                <div className={styles.formFieldFull}>
                  <label className={styles.formLabel}>Description</label>
                  <textarea
                    className={styles.formTextarea}
                    rows={4}
                    value={single.description}
                    onChange={(e) => setSingle((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Detailed description of the asset..."
                  />
                </div>
              </div>
            </div>

            {/* Specifications */}
            <div className={styles.formCard}>
              <div className={styles.formSectionTitle}>
                <HiOutlineCheckCircle />
                <span>Specifications</span>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Condition</label>
                  <RadixSelect
                    value={single.condition}
                    onValueChange={(v) => setSingle((p) => ({ ...p, condition: v }))}
                    options={['New', 'Mint', 'Excellent', 'Very Good', 'Good', 'Fair']}
                    placeholder={single.condition}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Production Year</label>
                  <input
                    className={styles.formInput}
                    value={single.productionYear}
                    onChange={(e) => setSingle((p) => ({ ...p, productionYear: e.target.value }))}
                    placeholder="2023"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Box & Papers</label>
                  <RadixSelect
                    value={single.boxPapers}
                    onValueChange={(v) => setSingle((p) => ({ ...p, boxPapers: v }))}
                    options={['Yes', 'Box Only', 'Papers Only', 'No']}
                    placeholder="Included?"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Material</label>
                  <input
                    className={styles.formInput}
                    value={single.material}
                    onChange={(e) => setSingle((p) => ({ ...p, material: e.target.value }))}
                    placeholder="Stainless Steel"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Movement</label>
                  <input
                    className={styles.formInput}
                    value={single.movement}
                    onChange={(e) => setSingle((p) => ({ ...p, movement: e.target.value }))}
                    placeholder="Automatic"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Case Size</label>
                  <input
                    className={styles.formInput}
                    value={single.caseSize}
                    onChange={(e) => setSingle((p) => ({ ...p, caseSize: e.target.value }))}
                    placeholder="41mm"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Water Resistance</label>
                  <input
                    className={styles.formInput}
                    value={single.waterResistance}
                    onChange={(e) => setSingle((p) => ({ ...p, waterResistance: e.target.value }))}
                    placeholder="300m"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Dial Color</label>
                  <input
                    className={styles.formInput}
                    value={single.dialColor}
                    onChange={(e) => setSingle((p) => ({ ...p, dialColor: e.target.value }))}
                    placeholder="Black"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Country</label>
                  <input
                    className={styles.formInput}
                    value={single.country}
                    onChange={(e) => setSingle((p) => ({ ...p, country: e.target.value }))}
                    placeholder="Switzerland"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Features</label>
                  <input
                    className={styles.formInput}
                    value={single.features}
                    onChange={(e) => setSingle((p) => ({ ...p, features: e.target.value }))}
                    placeholder="Chronograph, Date Display"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Provenance</label>
                  <input
                    className={styles.formInput}
                    value={single.provenance}
                    onChange={(e) => setSingle((p) => ({ ...p, provenance: e.target.value }))}
                    placeholder="Original owner history"
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button onClick={submitSingle} disabled={loading} className={styles.submitButton}>
              {loading ? (
                <>
                  <FaSpinner className={styles.spinner} />
                  <span>SUBMITTING...</span>
                </>
              ) : (
                <span>SUBMIT FOR REVIEW</span>
              )}
            </button>
          </div>

          {/* Preview & Review Sidebar */}
          <div className={styles.instructionsColumn}>
            {/* NFT Preview Card */}
            {imagePreview && (
              <div className={styles.previewCard}>
                <h3 className={styles.instructionsTitle}>NFT Preview</h3>
                <NFTPreviewCard
                  imagePreview={imagePreview}
                  title={single.title || `${single.brand} ${single.model}` || 'Untitled'}
                  description={single.description || 'No description'}
                  priceUSD={single.priceUSD}
                  brand={single.brand}
                />
              </div>
            )}

            {/* Form Review Section */}
            <div className={styles.reviewCard}>
              <h3 className={styles.instructionsTitle}>Form Review</h3>

              {/* Completion Progress */}
              <div className={styles.completionSection}>
                <div className={styles.completionHeader}>
                  <span>Completion</span>
                  <span
                    className={styles.completionPercent}
                    style={{
                      color:
                        completionPercent === 100
                          ? '#4caf50'
                          : completionPercent >= 50
                            ? '#ffc107'
                            : '#f44336',
                    }}
                  >
                    {completionPercent}%
                  </span>
                </div>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{
                      width: `${completionPercent}%`,
                      background:
                        completionPercent === 100
                          ? '#4caf50'
                          : completionPercent >= 50
                            ? 'linear-gradient(90deg, #ffc107, #ff9800)'
                            : '#f44336',
                    }}
                  />
                </div>
              </div>

              {/* Required Fields */}
              <div className={styles.fieldSection}>
                <div className={styles.fieldSectionHeader}>
                  <span>Required Fields</span>
                  <span
                    className={styles.fieldCount}
                    style={{ color: isFormValid ? '#4caf50' : '#f44336' }}
                  >
                    {requiredComplete}/{totalRequired}
                  </span>
                </div>
                <div className={styles.fieldList}>
                  {requiredFields.map((field) => (
                    <div
                      key={field.key}
                      className={`${styles.fieldItem} ${field.value ? styles.fieldComplete : styles.fieldMissing}`}
                    >
                      {field.value ? (
                        <HiCheck className={styles.fieldIconComplete} />
                      ) : (
                        <HiOutlineExclamationCircle className={styles.fieldIconMissing} />
                      )}
                      <span>{field.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Optional Fields */}
              <div className={styles.fieldSection}>
                <div className={styles.fieldSectionHeader}>
                  <span>Optional Fields</span>
                  <span className={styles.fieldCount} style={{ color: '#888' }}>
                    {optionalComplete}/{totalOptional}
                  </span>
                </div>
                <div className={styles.fieldList}>
                  {optionalFields.map((field) => (
                    <div
                      key={field.key}
                      className={`${styles.fieldItem} ${field.value ? styles.fieldComplete : styles.fieldOptional}`}
                    >
                      {field.value ? (
                        <HiCheck className={styles.fieldIconComplete} />
                      ) : (
                        <HiOutlineX className={styles.fieldIconOptional} />
                      )}
                      <span>{field.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Status */}
              <div className={styles.submitStatus}>
                {isFormValid ? (
                  <div className={styles.statusReady}>
                    <HiOutlineCheckCircle />
                    <span>Ready to submit for review</span>
                  </div>
                ) : (
                  <div className={styles.statusNotReady}>
                    <HiOutlineExclamationCircle />
                    <span>Complete required fields to submit</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tips Card */}
            <div className={styles.instructionsCard}>
              <h3 className={styles.instructionsTitle}>Tips for Approval</h3>
              <div className={styles.tipsList}>
                <div className={styles.tipItem}>
                  <HiOutlineCheckCircle className={styles.tipIcon} />
                  <span>Use high-quality, well-lit photos</span>
                </div>
                <div className={styles.tipItem}>
                  <HiOutlineCheckCircle className={styles.tipIcon} />
                  <span>Include serial/reference numbers</span>
                </div>
                <div className={styles.tipItem}>
                  <HiOutlineCheckCircle className={styles.tipIcon} />
                  <span>Provide accurate pricing in USD</span>
                </div>
                <div className={styles.tipItem}>
                  <HiOutlineCheckCircle className={styles.tipIcon} />
                  <span>Fill optional fields for better visibility</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Mode */}
      {mode === 'bulk' && (
        <div className={styles.formLayout}>
          <div className={styles.formColumn}>
            {/* Download Template */}
            <div className={styles.formCard}>
              <div className={styles.formSectionTitle}>
                <FaFileDownload />
                <span>Download Template</span>
              </div>

              <p className={styles.templateDescription}>
                Download our inventory template to ensure your data is formatted correctly.
              </p>

              <a
                href="/templates/luxhub_inventory_template.csv"
                download
                className={styles.downloadButton}
              >
                <FaFileDownload />
                <span>Download CSV Template</span>
              </a>
            </div>

            {/* Upload Section */}
            <div className={styles.formCard}>
              <div className={styles.formSectionTitle}>
                <FaUpload />
                <span>Upload Inventory</span>
              </div>

              <p className={styles.uploadDescription}>
                Upload a CSV file with your inventory data, or a ZIP file containing CSV and images.
              </p>

              <div className={styles.bulkUploadZone}>
                <input
                  type="file"
                  id="bulkUpload"
                  accept=".csv,.zip"
                  onChange={handleBulkUpload}
                  disabled={loading}
                  className={styles.hiddenInput}
                />
                <label htmlFor="bulkUpload" className={styles.uploadLabel}>
                  <FaUpload className={styles.uploadIcon} />
                  <span className={styles.uploadText}>
                    {bulkFile ? bulkFile.name : 'Click to upload CSV or ZIP'}
                  </span>
                  <span className={styles.uploadHint}>Supports .csv and .zip files</span>
                </label>
              </div>

              {progress && (
                <div className={styles.progressBar}>
                  <div className={styles.progressText}>{progress}</div>
                </div>
              )}
            </div>

            {/* Preview Table */}
            {previewRows.length > 0 && (
              <div className={styles.formCard}>
                <div className={styles.formSectionTitle}>
                  <HiOutlineDocumentText />
                  <span>Preview ({parsedRows.length} assets)</span>
                </div>

                <div className={styles.previewTableWrapper}>
                  <table className={styles.previewTable}>
                    <thead>
                      <tr>
                        <th>Brand</th>
                        <th>Model</th>
                        <th>Reference</th>
                        <th>Price</th>
                        <th>Condition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i}>
                          <td>{row.brand}</td>
                          <td>{row.model}</td>
                          <td>{row.reference || '-'}</td>
                          <td>${Number(row.priceUSD).toLocaleString()}</td>
                          <td>{row.condition || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {parsedRows.length > 5 && (
                  <p className={styles.previewNote}>
                    Showing first 5 of {parsedRows.length} assets
                  </p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={submitBulk}
              disabled={loading || parsedRows.length === 0}
              className={styles.submitButton}
            >
              {loading ? (
                <>
                  <FaSpinner className={styles.spinner} />
                  <span>{progress || 'PROCESSING...'}</span>
                </>
              ) : (
                <span>SUBMIT {parsedRows.length} ASSETS FOR REVIEW</span>
              )}
            </button>
          </div>

          {/* Instructions Sidebar */}
          <div className={styles.instructionsColumn}>
            <div className={styles.instructionsCard}>
              <h3 className={styles.instructionsTitle}>Bulk Upload Guide</h3>

              <div className={styles.stepsList}>
                <div className={styles.step}>
                  <div className={styles.stepNumber}>1</div>
                  <div className={styles.stepContent}>
                    <h4>Download Template</h4>
                    <p>Get the CSV template with all required columns</p>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNumber}>2</div>
                  <div className={styles.stepContent}>
                    <h4>Fill Your Data</h4>
                    <p>Add your inventory with image URLs or filenames</p>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNumber}>3</div>
                  <div className={styles.stepContent}>
                    <h4>Upload Files</h4>
                    <p>Upload CSV or ZIP (with images) file</p>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNumber}>4</div>
                  <div className={styles.stepContent}>
                    <h4>Review & Submit</h4>
                    <p>Verify preview and submit for admin review</p>
                  </div>
                </div>
              </div>

              <div className={styles.tipBox}>
                <strong>Tip:</strong> For ZIP uploads, include images in the same folder as your CSV
                and reference them by filename.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode Switcher */}
      <div className={styles.modeTabs}>
        <button
          className={mode === 'single' ? styles.active : ''}
          onClick={() => {
            setMode('single');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <FaEdit className={styles.modeIcon} />
          <span>Manual</span>
        </button>
        <button
          className={mode === 'bulk' ? styles.active : ''}
          onClick={() => {
            setMode('bulk');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <FaLayerGroup className={styles.modeIcon} />
          <span>Bulk</span>
        </button>
      </div>
    </div>
  );
}

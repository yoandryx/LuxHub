// src/components/vendor/AddInventoryForm.tsx
'use client';
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/AddInventoryForm.module.css';
import RadixSelect from '../admins/RadixSelect';
import toast from 'react-hot-toast';
import { FaUpload, FaSpinner, FaImage } from 'react-icons/fa';
import { FaWandMagicSparkles } from 'react-icons/fa6';
import {
  HiOutlinePhotograph,
  HiOutlineDocumentText,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineX,
  HiCheck,
} from 'react-icons/hi';
import NFTPreviewCard from '../admins/NFTPreviewCard';

export default function AddInventoryForm({ onSuccess }: { onSuccess: () => void }) {
  const { publicKey } = useWallet();
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
    serialNumber: '',
    images: [] as File[],
  });

  const [aiLoading, setAiLoading] = useState(false);

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

  // AI autofill — analyze uploaded image and fill form fields
  const handleAiAutofill = async () => {
    if (single.images.length === 0) {
      toast.error('Upload an image first');
      return;
    }

    setAiLoading(true);
    try {
      const base64 = await fileToBase64(single.images[0]);
      const res = await fetch('/api/ai/analyze-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: base64 }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'AI analysis failed');
      }

      const json = await res.json();
      const data = json.data || json; // API wraps in { success, data }
      setSingle((prev) => ({
        ...prev,
        brand: data.brand || prev.brand,
        model: data.model || prev.model,
        title: data.title || prev.title,
        description: data.description || prev.description,
        material: data.material || prev.material,
        dialColor: data.dialColor || prev.dialColor,
        caseSize: data.caseSize || prev.caseSize,
        movement: data.movement || prev.movement,
        waterResistance: data.waterResistance || prev.waterResistance,
        productionYear: data.productionYear || prev.productionYear,
        condition: data.condition || prev.condition,
        features: data.features || prev.features,
        country: data.country || prev.country,
        priceUSD: data.estimatedPriceUSD || prev.priceUSD,
      }));

      toast.success(
        `AI identified: ${data.brand} ${data.model} (${data.confidence}% confidence) — please review all fields for accuracy`,
        { duration: 6000 }
      );
    } catch (err: any) {
      toast.error(err.message || 'AI analysis failed');
    } finally {
      setAiLoading(false);
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
          serialNumber: single.serialNumber || undefined,
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

  return (
    <div className={styles.inventoryContainer}>
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
                <>
                  <div className={styles.imagePreviewGrid}>
                    {single.images.map((file, idx) => (
                      <div key={idx} className={styles.imagePreviewItem}>
                        <img src={URL.createObjectURL(file)} alt={`Preview ${idx + 1}`} />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={styles.aiButton}
                    onClick={handleAiAutofill}
                    disabled={aiLoading}
                  >
                    {aiLoading ? (
                      <>
                        <FaSpinner className={styles.spinner} />
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <FaWandMagicSparkles />
                        <span>AI Autofill</span>
                      </>
                    )}
                  </button>
                </>
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
                  <label className={styles.formLabel}>Serial Number</label>
                  <input
                    className={styles.formInput}
                    value={single.serialNumber}
                    onChange={(e) => setSingle((p) => ({ ...p, serialNumber: e.target.value }))}
                    placeholder="Internal only — not shown on-chain"
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
                    options={['Unworn', 'Excellent', 'Very Good', 'Good', 'Fair']}
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
    </div>
  );
}

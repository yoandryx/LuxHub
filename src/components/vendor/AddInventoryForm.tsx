// src/components/vendor/AddInventoryForm.tsx
'use client';
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Papa, { ParseResult } from 'papaparse';
import JSZip from 'jszip';
import styles from '../../styles/AddInventoryForm.module.css';
import RadixSelect from '../admins/RadixSelect';
import toast from 'react-hot-toast';
import { FaEdit, FaLayerGroup, FaUpload, FaFileDownload, FaSpinner, FaImage } from 'react-icons/fa';
import { HiOutlinePhotograph, HiOutlineDocumentText, HiOutlineCheckCircle } from 'react-icons/hi';

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
  waterResistance?: string;
  dialColor?: string;
  country?: string;
  releaseDate?: string;
  limitedEdition?: string;
  certificate?: string;
  warrantyInfo?: string;
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
    waterResistance: '',
    dialColor: '',
    country: '',
    releaseDate: '',
    limitedEdition: '',
    certificate: '',
    warrantyInfo: '',
    images: [] as File[],
  });

  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<AssetRow[]>([]);
  const [previewRows, setPreviewRows] = useState<AssetRow[]>([]);

  const handleSingleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setSingle((prev) => ({ ...prev, images: Array.from(e.target.files!) }));
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

    setLoading(true);
    try {
      const imageBase64s = await Promise.all(single.images.map(fileToBase64));

      await fetch('/api/asset/createPending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          title: single.title || `${single.brand} ${single.model}`,
          brand: single.brand,
          model: single.model,
          reference: single.reference,
          description: single.description,
          priceUSD: single.priceUSD,
          imageBase64s,
          attributes: [
            { trait_type: 'Condition', value: single.condition },
            { trait_type: 'Production Year', value: single.productionYear },
            { trait_type: 'Box & Papers', value: single.boxPapers },
            { trait_type: 'Material', value: single.material },
            { trait_type: 'Movement', value: single.movement },
            { trait_type: 'Water Resistance', value: single.waterResistance },
            { trait_type: 'Dial Color', value: single.dialColor },
            { trait_type: 'Country', value: single.country },
          ].filter((attr) => attr.value),
        }),
      });

      toast.success('Asset submitted for review!');
      onSuccess();
      setSingle((prev) => ({
        ...prev,
        images: [],
        brand: '',
        model: '',
        title: '',
        description: '',
        priceUSD: 0,
      }));
    } catch (err) {
      toast.error('Submission failed');
    } finally {
      setLoading(false);
    }
  };

  const submitBulk = async () => {
    if (parsedRows.length === 0) return toast.error('No assets to submit');
    setLoading(true);
    setProgress(`Submitting 0/${parsedRows.length}...`);

    try {
      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        setProgress(`Submitting ${i + 1}/${parsedRows.length}...`);

        await fetch('/api/asset/createPending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: publicKey?.toBase58(),
            title: row.title || `${row.brand} ${row.model}`,
            brand: row.brand,
            model: row.model,
            reference: row.reference,
            description: row.description,
            priceUSD: row.priceUSD,
            imageBase64s: (row as any).imageBase64s || [],
            attributes: [
              { trait_type: 'Condition', value: row.condition },
              { trait_type: 'Production Year', value: row.productionYear },
              { trait_type: 'Box & Papers', value: row.boxPapers },
              { trait_type: 'Material', value: row.material },
              { trait_type: 'Movement', value: row.movement },
              { trait_type: 'Water Resistance', value: row.waterResistance },
              { trait_type: 'Dial Color', value: row.dialColor },
              { trait_type: 'Country', value: row.country },
            ].filter((attr) => attr.value),
          }),
        });
      }

      toast.success('Bulk submission complete!');
      onSuccess();
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
                  <label className={styles.formLabel}>Reference</label>
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

          {/* Instructions Sidebar */}
          <div className={styles.instructionsColumn}>
            <div className={styles.instructionsCard}>
              <h3 className={styles.instructionsTitle}>How It Works</h3>

              <div className={styles.stepsList}>
                <div className={styles.step}>
                  <div className={styles.stepNumber}>1</div>
                  <div className={styles.stepContent}>
                    <h4>Upload Images</h4>
                    <p>Add high-quality photos of your asset</p>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNumber}>2</div>
                  <div className={styles.stepContent}>
                    <h4>Fill Details</h4>
                    <p>Provide accurate information about your asset</p>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNumber}>3</div>
                  <div className={styles.stepContent}>
                    <h4>Submit for Review</h4>
                    <p>LuxHub admins will verify authenticity</p>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNumber}>4</div>
                  <div className={styles.stepContent}>
                    <h4>NFT Minted</h4>
                    <p>Once approved, NFT is minted to your wallet</p>
                  </div>
                </div>
              </div>

              <div className={styles.tipBox}>
                <strong>Tip:</strong> Provide as much detail as possible for better marketplace
                visibility and faster approval.
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

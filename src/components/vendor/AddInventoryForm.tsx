// src/components/vendor/AddInventoryForm.tsx
'use client';
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Papa, { ParseResult } from 'papaparse';
import pLimit from 'p-limit';
import JSZip from 'jszip';
import { uploadToPinata } from '@/utils/pinata';
import styles from '../../styles/VendorDashboard.module.css';
import RadixSelect from '../admins/RadixSelect';
import toast from 'react-hot-toast';
import { SlArrowDown } from 'react-icons/sl';
import { FaFileDownload } from 'react-icons/fa';

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
  primary_image_file?: string; // New: local filename in zip
  gallery_image_files?: string; // New: comma-separated local filenames
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
  const [csvFile, setCsvFile] = useState<File | null>(null);
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

  // const handleCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = e.target.files?.[0];
  //   if (!file) return;
  //   setCsvFile(file);
  //   Papa.parse<AssetRow>(file, {
  //     header: true,
  //     skipEmptyLines: true,
  //     complete: (results: ParseResult<AssetRow>) => {
  //       const valid = results.data.filter(row => row.brand && row.model && row.priceUSD && row.primary_image_url);
  //       setParsedRows(valid);
  //       setPreviewRows(valid.slice(0, 10));
  //       toast.success(`Loaded ${valid.length} valid assets${valid.length > 10 ? " (showing first 10)" : ""}`);
  //     },
  //     error: () => toast.error("Invalid CSV file"),
  //   });
  // };

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

      // Convert images to base64 for pending storage
      setProgress('Preparing images...');
      const processedRows = await Promise.all(
        rows.map(async (row) => {
          let primaryBase64 = '';
          let galleryBase64s: string[] = [];

          // Primary image
          if (row.primary_image_file && imageFiles[row.primary_image_file]) {
            primaryBase64 = await fileToBase64(imageFiles[row.primary_image_file]);
          } else if (row.primary_image_url) {
            primaryBase64 = row.primary_image_url; // Keep URL for admin to verify/upload
          }

          // Gallery images
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
      setPreviewRows(processedRows.slice(0, 10));
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
            /* build from single state */
          ],
        }),
      });

      toast.success('Asset submitted for review!');
      onSuccess();
      setSingle((prev) => ({ ...prev, images: [] }));
    } catch (err) {
      toast.error('Submission failed');
    } finally {
      setLoading(false);
    }
  };

  const submitBulk = async () => {
    if (parsedRows.length === 0) return toast.error('No assets to submit');
    setLoading(true);
    try {
      for (const row of parsedRows) {
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
              /* build from row */
            ],
          }),
        });
      }

      toast.success('Bulk submission complete!');
      onSuccess();
    } catch (err) {
      toast.error('Bulk submission failed');
    } finally {
      setLoading(false);
    }
  };

  const buildMetadata = (data: typeof single | AssetRow, cids: string[]) => ({
    name: data.title || `${data.brand} ${data.model}`,
    description: data.description || '',
    image: `${process.env.NEXT_PUBLIC_GATEWAY_URL}${cids[0]}`,
    attributes: [
      { trait_type: 'Brand', value: data.brand },
      { trait_type: 'Model', value: data.model },
      { trait_type: 'Reference', value: data.reference || '' },
      { trait_type: 'Condition', value: data.condition || 'Excellent' },
      { trait_type: 'Production Year', value: data.productionYear || '' },
      { trait_type: 'Box & Papers', value: data.boxPapers || 'No' },
      { trait_type: 'Material', value: data.material || '' },
      { trait_type: 'Movement', value: data.movement || '' },
      { trait_type: 'Water Resistance', value: data.waterResistance || '' },
      { trait_type: 'Dial Color', value: data.dialColor || '' },
      { trait_type: 'Country', value: data.country || '' },
      { trait_type: 'Release Date', value: data.releaseDate || '' },
      { trait_type: 'Limited Edition', value: data.limitedEdition || '' },
      { trait_type: 'Certificate', value: data.certificate || '' },
      { trait_type: 'Warranty Info', value: data.warrantyInfo || '' },
    ],
    properties: {
      files: cids.map((cid) => ({
        uri: `${process.env.NEXT_PUBLIC_GATEWAY_URL}${cid}`,
        type: 'image/jpeg',
      })),
      category: 'image',
    },
  });

  const renderField = (label: string, input: React.ReactNode) => (
    <div className={styles.formField}>
      <label className={styles.formLabel}>{label}</label>
      {input}
    </div>
  );

  const singleInstructions = (
    <>
      <div className={styles.sectionHeading}>
        <h2 className={styles.editHeading}>How to Add a Single Asset</h2>
      </div>
      <div className={styles.step}>
        <p>Fill in all required fields with accurate details about your asset.</p>
      </div>
      <SlArrowDown className={styles.arrow} />
      <div className={styles.step}>
        <p>Upload high-quality images</p>
      </div>
      <SlArrowDown className={styles.arrow} />
      <div className={styles.step}>
        <p>Review your entry and click "Submit for Review".</p>
      </div>
      <SlArrowDown className={styles.arrow} />
      <div className={styles.step}>
        <p>
          LuxHub admins will verify authenticity and mint the NFT directly to your wallet or store
          vault.
        </p>
      </div>
      <p className={styles.instructionsTip}>
        Tip: Provide as much detail as possible for better marketplace visibility.
      </p>
    </>
  );

  const bulkInstructions = (
    <>
      <div className={styles.sectionHeading}>
        <h2 className={styles.editHeading}>How to Bulk Upload Inventory</h2>
      </div>
      <div className={styles.step}>
        <p>
          Download our template and fill it with your inventory data, or upload an exported CSV file
        </p>
      </div>
      <SlArrowDown className={styles.arrow} />
      <div className={styles.step}>
        <p>
          Ensure image URLs are public direct links to high-quality photos, or include your photos
          on your upload.
        </p>
      </div>
      <SlArrowDown className={styles.arrow} />
      <div className={styles.step}>
        <p>Upload the completed CSV file below.</p>
      </div>
      <SlArrowDown className={styles.arrow} />
      <div className={styles.step}>
        <p>Preview the data and submit for review.</p>
      </div>
      <p className={styles.instructionsTip}>
        Luxhub will handle blockchain listing after verification and mint the Asset directly to your
        wallet or store vault.
      </p>
    </>
  );

  return (
    <div className={styles.tabContentColumn}>
      <div className={styles.tabContent}>
        <div className={styles.sectionHeading}>
          <h2 className={styles.editHeading}>Add Inventory</h2>
        </div>

        <div className={styles.tabContentRow}>
          <div className={styles.tabContentLeft}>
            {' '}
            {/* Tab Content*/}
            {mode === 'single' && (
              <div>
                <div className={styles.formSection}>
                  <div className={styles.sectionHeading}>
                    <h2 className={styles.editHeading}>Basic Information</h2>
                  </div>
                  <div className={styles.formGrid}>
                    {renderField(
                      'Brand *',
                      <input
                        className={styles.formInput}
                        value={single.brand}
                        onChange={(e) => setSingle((p) => ({ ...p, brand: e.target.value }))}
                        placeholder="Rolex"
                        required
                      />
                    )}
                    {renderField(
                      'Model *',
                      <input
                        className={styles.formInput}
                        value={single.model}
                        onChange={(e) => setSingle((p) => ({ ...p, model: e.target.value }))}
                        placeholder="Submariner"
                        required
                      />
                    )}
                    {renderField(
                      'Reference',
                      <input
                        className={styles.formInput}
                        value={single.reference}
                        onChange={(e) => setSingle((p) => ({ ...p, reference: e.target.value }))}
                        placeholder="126610LN"
                      />
                    )}
                    {renderField(
                      'Title',
                      <input
                        className={styles.formInput}
                        value={single.title}
                        onChange={(e) => setSingle((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Custom display title"
                      />
                    )}
                    <div className={styles.formFullWidth}>
                      {renderField(
                        'Description',
                        <textarea
                          className={styles.formTextarea}
                          rows={4}
                          value={single.description}
                          onChange={(e) =>
                            setSingle((p) => ({ ...p, description: e.target.value }))
                          }
                          placeholder="Detailed description..."
                        />
                      )}
                    </div>
                    <div className={styles.formFullWidth}>
                      {renderField(
                        'Price USD *',
                        <input
                          className={styles.formInput}
                          type="number"
                          value={single.priceUSD || ''}
                          onChange={(e) =>
                            setSingle((p) => ({ ...p, priceUSD: Number(e.target.value) || 0 }))
                          }
                          required
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.formSection}>
                  <div className={styles.sectionHeading}>
                    <h2 className={styles.editHeading}>Specifications</h2>
                  </div>
                  <div className={styles.formGrid}>
                    {renderField(
                      'Condition',
                      <RadixSelect
                        value={single.condition}
                        onValueChange={(v) => setSingle((p) => ({ ...p, condition: v }))}
                        options={['New', 'Mint', 'Excellent', 'Very Good', 'Good', 'Fair']}
                        placeholder={single.condition}
                      />
                    )}
                    {renderField(
                      'Production Year',
                      <input
                        className={styles.formInput}
                        value={single.productionYear}
                        onChange={(e) =>
                          setSingle((p) => ({ ...p, productionYear: e.target.value }))
                        }
                        placeholder="2023"
                      />
                    )}
                    {renderField(
                      'Box & Papers',
                      <RadixSelect
                        value={single.boxPapers}
                        onValueChange={(v) => setSingle((p) => ({ ...p, boxPapers: v }))}
                        options={['Yes', 'No']}
                        placeholder="Included?"
                      />
                    )}
                    {renderField(
                      'Material',
                      <input
                        className={styles.formInput}
                        value={single.material}
                        onChange={(e) => setSingle((p) => ({ ...p, material: e.target.value }))}
                        placeholder="Steel"
                      />
                    )}
                    {renderField(
                      'Movement',
                      <input
                        className={styles.formInput}
                        value={single.movement}
                        onChange={(e) => setSingle((p) => ({ ...p, movement: e.target.value }))}
                        placeholder="Automatic"
                      />
                    )}
                    {renderField(
                      'Water Resistance',
                      <input
                        className={styles.formInput}
                        value={single.waterResistance}
                        onChange={(e) =>
                          setSingle((p) => ({ ...p, waterResistance: e.target.value }))
                        }
                        placeholder="300m"
                      />
                    )}
                    {renderField(
                      'Dial Color',
                      <input
                        className={styles.formInput}
                        value={single.dialColor}
                        onChange={(e) => setSingle((p) => ({ ...p, dialColor: e.target.value }))}
                        placeholder="Black"
                      />
                    )}
                    {renderField(
                      'Country',
                      <input
                        className={styles.formInput}
                        value={single.country}
                        onChange={(e) => setSingle((p) => ({ ...p, country: e.target.value }))}
                        placeholder="Switzerland"
                      />
                    )}
                    {renderField(
                      'Release Date',
                      <input
                        className={styles.formInput}
                        type="date"
                        value={single.releaseDate}
                        onChange={(e) => setSingle((p) => ({ ...p, releaseDate: e.target.value }))}
                      />
                    )}
                    {renderField(
                      'Limited Edition',
                      <input
                        className={styles.formInput}
                        value={single.limitedEdition}
                        onChange={(e) =>
                          setSingle((p) => ({ ...p, limitedEdition: e.target.value }))
                        }
                        placeholder="No"
                      />
                    )}
                    {renderField(
                      'Certificate',
                      <input
                        className={styles.formInput}
                        value={single.certificate}
                        onChange={(e) => setSingle((p) => ({ ...p, certificate: e.target.value }))}
                        placeholder="Original certificate"
                      />
                    )}
                    {renderField(
                      'Warranty Info',
                      <input
                        className={styles.formInput}
                        value={single.warrantyInfo}
                        onChange={(e) => setSingle((p) => ({ ...p, warrantyInfo: e.target.value }))}
                        placeholder="2-year warranty remaining"
                      />
                    )}
                  </div>
                </div>

                <div className={styles.formSection}>
                  <div className={styles.sectionHeading}>
                    <h2 className={styles.editHeading}>Images</h2>
                  </div>
                  <div className={styles.formFullWidth}>
                    {renderField(
                      '1 Image per asset *',
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleSingleImage}
                        className={styles.fileInput}
                        required
                      />
                    )}
                    {single.images.length > 0 && (
                      <p className="mt-3 text-cyan-300">{single.images.length} images selected</p>
                    )}
                  </div>
                </div>

                <button onClick={submitSingle} disabled={loading} className={styles.mintButton}>
                  {loading ? 'Submitting...' : 'Submit to Luxhub'}
                </button>
              </div>
            )}
            {mode === 'bulk' && (
              <div>
                <div className={styles.downloadZone}>
                  <p> Inventory template Download </p>
                  <FaFileDownload className={styles.fileIcon} />
                  .csv{' '}
                  <a href="/templates/luxhub_inventory_template.csv" download>
                    {/* <FaFileDownload  /> */}
                  </a>{' '}
                </div>
                <div className={styles.sectionHeading}>
                  <h2 className={styles.editHeading}>Upload Files</h2>
                </div>

                <div>
                  To upload your inventory in bulk, please provide a CSV file, or a ZIP file
                  containing a CSV and associated images
                </div>

                <div className={styles.formSection}>
                  {/* <h2 >Upload Inventory here</h2> */}
                  <input
                    type="file"
                    accept=".csv,.zip"
                    onChange={handleBulkUpload}
                    className={styles.fileInput}
                  />
                  {progress && <p>{progress}</p>}
                </div>

                {previewRows.length > 0 && (
                  <div className={styles.previewTable}>
                    <h4>Preview</h4>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          {Object.keys(previewRows[0]).map((key) => (
                            <th key={key} className="border border-gray-600 p-2 text-left">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i}>
                            {Object.values(row).map((val, j) => (
                              <td key={j} className="border border-gray-600 p-2">
                                {String(val ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <button
                  onClick={submitBulk}
                  disabled={loading || parsedRows.length === 0}
                  className={styles.mintButton}
                >
                  {loading ? 'Processing...' : `Submit ${parsedRows.length} Assets`}
                </button>
              </div>
            )}
          </div>

          <div className={styles.tabContentRight}>
            {' '}
            {/* Insstruction Content*/}
            {mode === 'single' ? singleInstructions : bulkInstructions}
          </div>
        </div>

        <div className={styles.modeTabs}>
          <button
            className={mode === 'single' ? styles.active : ''}
            onClick={() => {
              setMode('single');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            Manual
          </button>
          <button
            className={mode === 'bulk' ? styles.active : ''}
            onClick={() => {
              setMode('bulk');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            Bulk
          </button>
        </div>
      </div>
    </div>
  );
}

// src/components/admins/NftForm.tsx
import React, { JSX, useEffect, useState, useCallback } from 'react';
import styles from '../../styles/CreateNFT.module.css';
import RadixSelect from './RadixSelect';
import { ImageUploader } from './ImageUploader';
import useSWR from 'swr';
import { FaMagic, FaSpinner } from 'react-icons/fa';

// SWR fetcher
const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface NftFormProps {
  fileCid: string;
  setFileCid: (val: string) => void;
  title: string;
  setTitle: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  priceSol: number;
  setPriceSol: (val: number) => void;
  brand: string;
  setBrand: (val: string) => void;
  model: string;
  setModel: (val: string) => void;
  serialNumber: string;
  setSerialNumber: (val: string) => void;
  material: string;
  setMaterial: (val: string) => void;
  productionYear: string;
  setProductionYear: (val: string) => void;
  limitedEdition: string;
  setLimitedEdition: (val: string) => void;
  certificate: string;
  setCertificate: (val: string) => void;
  warrantyInfo: string;
  setWarrantyInfo: (val: string) => void;
  provenance: string;
  setProvenance: (val: string) => void;
  movement: string;
  setMovement: (val: string) => void;
  caseSize: string;
  setCaseSize: (val: string) => void;
  waterResistance: string;
  setWaterResistance: (val: string) => void;
  dialColor: string;
  setDialColor: (val: string) => void;
  country: string;
  setCountry: (val: string) => void;
  releaseDate: string;
  setReleaseDate: (val: string) => void;
  boxPapers: string;
  setBoxPapers: (val: string) => void;
  condition: string;
  setCondition: (val: string) => void;
  features: string;
  setFeatures: (val: string) => void;
  mintNFT: () => Promise<void>;
  minting: boolean;
  // AI Analysis
  onAnalyzeImage?: (imageUrl: string) => Promise<void>;
  analyzingImage?: boolean;
  analysisError?: string | null;
}

export const NftForm: React.FC<NftFormProps> = ({
  fileCid,
  setFileCid,
  title,
  setTitle,
  description,
  setDescription,
  priceSol,
  setPriceSol,
  brand,
  setBrand,
  model,
  setModel,
  serialNumber,
  setSerialNumber,
  material,
  setMaterial,
  productionYear,
  setProductionYear,
  limitedEdition,
  setLimitedEdition,
  certificate,
  setCertificate,
  warrantyInfo,
  setWarrantyInfo,
  provenance,
  setProvenance,
  movement,
  setMovement,
  caseSize,
  setCaseSize,
  waterResistance,
  setWaterResistance,
  dialColor,
  setDialColor,
  country,
  setCountry,
  releaseDate,
  setReleaseDate,
  boxPapers,
  setBoxPapers,
  condition,
  setCondition,
  features,
  setFeatures,
  mintNFT,
  minting,
  onAnalyzeImage,
  analyzingImage = false,
  analysisError,
}) => {
  const [usdInput, setUsdInput] = useState('');
  const [showShimmer, setShowShimmer] = useState(false);
  const prevSolRef = React.useRef<number>(0);

  // Use SWR for SOL price with automatic revalidation (client-swr-dedup rule)
  const { data: solPriceData } = useSWR('/api/users/sol-price', fetcher, {
    refreshInterval: 60000, // Refresh every 60 seconds
    revalidateOnFocus: false,
    dedupingInterval: 30000, // Dedupe requests within 30 seconds
  });

  const solRate = solPriceData?.price || 0;

  // Show shimmer effect when price changes
  useEffect(() => {
    if (solRate && solRate !== prevSolRef.current) {
      prevSolRef.current = solRate;
      setShowShimmer(true);
      const timer = setTimeout(() => setShowShimmer(false), 500);
      return () => clearTimeout(timer);
    }
  }, [solRate]);

  // Handle image upload completion
  const handleImageUploadComplete = useCallback(
    (cid: string) => {
      setFileCid(cid);
    },
    [setFileCid]
  );

  const handleUsdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const usd = e.target.value;
    setUsdInput(usd);
    if (solRate > 0 && !isNaN(parseFloat(usd))) {
      const sol = parseFloat(usd) / solRate;
      setPriceSol(parseFloat(sol.toFixed(3)));
    }
  };

  const renderField = (label: string, desc: string, element: JSX.Element) => (
    <div className={styles.formFieldWrapper}>
      <label className={styles.formLabel}>{label}</label>
      <small className={styles.formHint}>{desc}</small>
      {React.cloneElement(element, { className: styles.formInput })}
    </div>
  );

  return (
    <div className={styles.formContainer}>
      <h1 className={styles.formTitle}>Mint a Luxury Watch NFT</h1>
      <p className={styles.formSubtitle}>
        Fill out the form below to mint your verified luxury watch NFT. Fields marked with * are
        required.
      </p>

      {/* Image Upload */}
      <div className={styles.formSection}>
        <div className={styles.formSectionTitle}>Asset Image</div>
        <div className={styles.formFieldWrapper} style={{ gridColumn: '1 / -1', maxWidth: '100%' }}>
          <label className={styles.formLabel}>* Upload Image</label>
          <small className={styles.formHint}>
            Drag and drop or click to upload your asset image to IPFS
          </small>
          <ImageUploader
            onUploadComplete={handleImageUploadComplete}
            currentCid={fileCid}
            disabled={minting}
          />
        </div>

        {/* AI Analysis Button */}
        {fileCid && onAnalyzeImage && (
          <div className={styles.formFieldWrapper} style={{ gridColumn: '1 / -1' }}>
            <button
              type="button"
              className={styles.aiAnalyzeButton}
              onClick={() =>
                onAnalyzeImage(
                  `${process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/'}${fileCid}`
                )
              }
              disabled={analyzingImage || minting}
            >
              {analyzingImage ? (
                <>
                  <FaSpinner className={styles.spinningIcon} />
                  <span>Analyzing with AI...</span>
                </>
              ) : (
                <>
                  <FaMagic />
                  <span>Auto-fill with AI</span>
                </>
              )}
            </button>
            {analysisError && <small className={styles.formError}>{analysisError}</small>}
            <small className={styles.formHint}>
              AI will analyze your watch image and auto-fill form fields. Review and adjust as
              needed.
            </small>
          </div>
        )}

        {/* Manual CID input as fallback */}
        {renderField(
          'Or enter CID manually',
          'If you already have an IPFS CID, enter it here',
          <input value={fileCid} onChange={(e) => setFileCid(e.target.value)} placeholder="Qm..." />
        )}
      </div>

      {/* Core Info */}
      <div className={styles.formSection}>
        <div className={styles.formSectionTitle}>Core Info</div>
        {renderField(
          '* Title ',
          'Enter a recognizable name for this NFT',
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        )}
        {renderField(
          '* Description ',
          'Brief description including story, history, or standout features',
          <input value={description} onChange={(e) => setDescription(e.target.value)} required />
        )}
        {renderField(
          '* Price in USD ',
          'Enter a USD price, it will auto-convert to SOL',
          <div className={styles.inlineSolInput}>
            <input
              type="number"
              value={usdInput}
              onChange={handleUsdChange}
              required
              className={styles.formInput}
            />
            <span className={`${styles.solPriceWrapper} ${showShimmer ? styles.shimmer : ''}`}>
              {solRate > 0 ? `≈ ${priceSol} SOL` : 'Fetching SOL...'}
            </span>
          </div>
        )}
      </div>

      {/* Watch Details */}
      <div className={styles.formSection}>
        <div className={styles.formSectionTitle}>Watch Details</div>
        {renderField(
          '* Brand',
          'Manufacturer or brand name (e.g., Rolex)',
          <input value={brand} onChange={(e) => setBrand(e.target.value)} required />
        )}
        {renderField(
          '* Model',
          'Model name or number (e.g., Submariner)',
          <input value={model} onChange={(e) => setModel(e.target.value)} required />
        )}
        {renderField(
          '* Serial Number',
          'Unique identifier engraved on the watch',
          <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} required />
        )}
        {renderField(
          'Material',
          'Case material (e.g., stainless steel, gold)',
          <input value={material} onChange={(e) => setMaterial(e.target.value)} />
        )}
        {renderField(
          'Production Year',
          'The year this watch was produced',
          <input value={productionYear} onChange={(e) => setProductionYear(e.target.value)} />
        )}
        {renderField(
          'Movement',
          'Watch movement type (e.g., Automatic, Quartz)',
          <input value={movement} onChange={(e) => setMovement(e.target.value)} />
        )}
      </div>

      {/* Attributes */}
      <div className={styles.formSection}>
        <div className={styles.formSectionTitle}>Attributes</div>
        {renderField(
          'Limited Edition',
          'Specify if this is a limited release',
          <RadixSelect
            value={limitedEdition}
            onValueChange={setLimitedEdition}
            placeholder="Limited Edition?"
            options={['Yes', 'No']}
          />
        )}
        {renderField(
          'Warranty Info',
          'Include any warranty details or duration',
          <input value={warrantyInfo} onChange={(e) => setWarrantyInfo(e.target.value)} />
        )}
        {renderField(
          'Certificate URL',
          'Link to digital certification (e.g., IPFS)',
          <input value={certificate} onChange={(e) => setCertificate(e.target.value)} />
        )}
        {renderField(
          'Features / Service History',
          'Mention notable features or service events',
          <input value={features} onChange={(e) => setFeatures(e.target.value)} />
        )}
      </div>

      {/* Specs */}
      <div className={styles.formSection}>
        <div className={styles.formSectionTitle}>Specs</div>
        {renderField(
          'Case Size (mm)',
          'Diameter of the case in millimeters',
          <input value={caseSize} onChange={(e) => setCaseSize(e.target.value)} />
        )}
        {renderField(
          'Water Resistance (ATM)',
          'Enter ATM rating (e.g., 5, 10, 20)',
          <input value={waterResistance} onChange={(e) => setWaterResistance(e.target.value)} />
        )}
        {renderField(
          'Dial Color',
          "The dial's color (e.g., black, silver)",
          <input value={dialColor} onChange={(e) => setDialColor(e.target.value)} />
        )}
        {renderField(
          'Country of Origin',
          'Where the watch was manufactured',
          <input value={country} onChange={(e) => setCountry(e.target.value)} />
        )}
        {renderField(
          'Release Date',
          'Date the watch was released to market',
          <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
        )}
        {renderField(
          'Box & Papers Included?',
          'Select whether original packaging is included',
          <RadixSelect
            value={boxPapers}
            onValueChange={setBoxPapers}
            placeholder="Box & Papers Included?"
            options={['Yes', 'No']}
          />
        )}
        {renderField(
          'Condition',
          'Overall condition of the watch',
          <RadixSelect
            value={condition}
            onValueChange={setCondition}
            placeholder="Condition"
            options={['New', 'Excellent', 'Good', 'Fair', 'Poor']}
          />
        )}
      </div>

      {/* Provenance */}
      <div className={styles.formSection}>
        <div className={styles.formSectionTitle}>Provenance</div>
        {renderField(
          'Provenance Hash',
          'System-generated fingerprint for traceability',
          <input value={provenance} disabled />
        )}
      </div>

      <button onClick={mintNFT} disabled={minting} className={styles.mintButton}>
        {minting ? 'Minting...' : 'Mint NFT'}
      </button>
    </div>
  );
};

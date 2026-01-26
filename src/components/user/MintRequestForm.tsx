import React, { useState, useEffect, JSX } from 'react';
import styles from '../../styles/CreateNFT.module.css';
import RadixSelect from '../admins/RadixSelect';
import { useWallet } from '@solana/wallet-adapter-react';
import NFTPreviewCard from '../admins/NFTPreviewCard';

const MintRequestForm = () => {
  const wallet = useWallet();

  // Image upload
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageBase64(reader.result as string);
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Core fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceSol, setPriceSol] = useState(0);
  const [usdInput, setUsdInput] = useState('');
  const [solRate, setSolRate] = useState(0);
  const [showShimmer, setShowShimmer] = useState(false);
  const [status, setStatus] = useState('');

  // Watch fields
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [referenceNumber, setReferenceNumber] = useState(''); // Alphanumeric (e.g., "116595RBOW-2024")
  const [material, setMaterial] = useState('');
  const [productionYear, setProductionYear] = useState('');
  const [limitedEdition, setLimitedEdition] = useState('');
  const [certificate, setCertificate] = useState('');
  const [warrantyInfo, setWarrantyInfo] = useState('');
  const [provenance, setProvenance] = useState('');
  const [movement, setMovement] = useState('');
  const [caseSize, setCaseSize] = useState('');
  const [waterResistance, setWaterResistance] = useState('');
  const [dialColor, setDialColor] = useState('');
  const [country, setCountry] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [boxPapers, setBoxPapers] = useState('');
  const [condition, setCondition] = useState('');
  const [features, setFeatures] = useState('');

  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        const res = await fetch('/api/users/sol-price');
        const data = await res.json();
        if (data.price && data.price !== solRate) {
          setSolRate(data.price);
          setShowShimmer(true);
          setTimeout(() => setShowShimmer(false), 500);
        }
      } catch (err) {
        console.error('Failed to fetch SOL price:', err);
      }
    };
    fetchSolPrice();
    const interval = setInterval(fetchSolPrice, 60000);
    return () => clearInterval(interval);
  }, []);

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

  const handleSubmit = async () => {
    if (!wallet.publicKey || !imageBase64) {
      return alert('Wallet must be connected and image must be uploaded.');
    }

    // Parse USD price as the source of truth
    const priceUSD = parseFloat(usdInput) || 0;

    const payload = {
      imageBase64,
      title,
      description,
      priceUSD, // USD as source of truth
      brand,
      model,
      referenceNumber, // Alphanumeric reference (e.g., "116595RBOW-2024")
      material,
      productionYear,
      limitedEdition,
      certificate,
      warrantyInfo,
      provenance,
      movement,
      caseSize,
      waterResistance,
      dialColor,
      country,
      releaseDate,
      boxPapers,
      condition,
      features,
      wallet: wallet.publicKey.toBase58(),
      timestamp: Date.now(),
    };

    const res = await fetch('/api/nft/requestMint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setStatus('✅ Mint request submitted!');
    } else {
      setStatus('❌ Failed to submit mint request.');
    }
  };

  return (
    <>
      <div className={styles.previewContainer}>
        <h2>Request Admin Mint</h2>
        <p>Upload your luxury watch info and an admin will review it for minting.</p>
        {imageBase64 && (
          <div className={styles.rightColumn}>
            <div className={styles.formTitle}>NFT Preview</div>
            <p style={{ fontSize: 'small', margin: '10px 0' }}>
              This is a preview of how your NFT will look like.
            </p>
            <NFTPreviewCard
              imagePreview={imageBase64}
              title={title}
              description={description}
              priceUSD={parseFloat(usdInput) || 0}
              estimatedSol={priceSol}
              brand={brand}
            />
          </div>
        )}
      </div>

      <div className={styles.formContainer}>
        <div className={styles.formSection}>
          <div className={styles.formSectionTitle}>Watch Image</div>
          <input
            className={styles.formUploadButton}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
          />
          {/* {imagePreview && <img src={imagePreview} className={styles.previewImage} />} */}
        </div>

        <div className={styles.formSection}>
          <div className={styles.formSectionTitle}>Core Info</div>
          {renderField(
            '* Title',
            'Enter a recognizable name',
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          )}
          {renderField(
            '* Description',
            'Brief summary or background',
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          )}
          {renderField(
            '* Price in USD',
            'Enter a USD price',
            <div className={styles.inlineSolInput}>
              <input type="number" value={usdInput} onChange={handleUsdChange} />
              <span className={`${styles.solPriceWrapper} ${showShimmer ? styles.shimmer : ''}`}>
                {solRate > 0 ? `≈ ${priceSol} SOL` : 'Fetching SOL...'}
              </span>
            </div>
          )}
        </div>

        <div className={styles.formSection}>
          <div className={styles.formSectionTitle}>Watch Details</div>
          {renderField(
            '* Brand',
            '',
            <input value={brand} onChange={(e) => setBrand(e.target.value)} />
          )}
          {renderField(
            '* Model',
            '',
            <input value={model} onChange={(e) => setModel(e.target.value)} />
          )}
          {renderField(
            '* Reference Number',
            'Alphanumeric (e.g., 116595RBOW-2024)',
            <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
          )}
          {renderField(
            'Material',
            '',
            <input value={material} onChange={(e) => setMaterial(e.target.value)} />
          )}
          {renderField(
            'Production Year',
            '',
            <input value={productionYear} onChange={(e) => setProductionYear(e.target.value)} />
          )}
          {renderField(
            'Movement',
            '',
            <input value={movement} onChange={(e) => setMovement(e.target.value)} />
          )}
        </div>

        <div className={styles.formSection}>
          <div className={styles.formSectionTitle}>Attributes</div>
          {renderField(
            'Limited Edition',
            '',
            <RadixSelect
              value={limitedEdition}
              onValueChange={setLimitedEdition}
              placeholder="Limited?"
              options={['Yes', 'No']}
            />
          )}
          {renderField(
            'Warranty Info',
            '',
            <input value={warrantyInfo} onChange={(e) => setWarrantyInfo(e.target.value)} />
          )}
          {renderField(
            'Certificate URL',
            '',
            <input value={certificate} onChange={(e) => setCertificate(e.target.value)} />
          )}
          {renderField(
            'Features',
            '',
            <input value={features} onChange={(e) => setFeatures(e.target.value)} />
          )}
        </div>

        <div className={styles.formSection}>
          <div className={styles.formSectionTitle}>Specs</div>
          {renderField(
            'Case Size',
            '',
            <input value={caseSize} onChange={(e) => setCaseSize(e.target.value)} />
          )}
          {renderField(
            'Water Resistance',
            '',
            <input value={waterResistance} onChange={(e) => setWaterResistance(e.target.value)} />
          )}
          {renderField(
            'Dial Color',
            '',
            <input value={dialColor} onChange={(e) => setDialColor(e.target.value)} />
          )}
          {renderField(
            'Country of Origin',
            '',
            <input value={country} onChange={(e) => setCountry(e.target.value)} />
          )}
          {renderField(
            'Release Date',
            '',
            <input
              type="date"
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
            />
          )}
          {renderField(
            'Box & Papers?',
            '',
            <RadixSelect
              value={boxPapers}
              onValueChange={setBoxPapers}
              placeholder="Included?"
              options={['Yes', 'No']}
            />
          )}
          {renderField(
            'Condition',
            '',
            <RadixSelect
              value={condition}
              onValueChange={setCondition}
              placeholder="Condition"
              options={['New', 'Excellent', 'Good', 'Fair', 'Poor']}
            />
          )}
        </div>

        <button onClick={handleSubmit} className={styles.mintButton}>
          Submit Mint Request
        </button>
        {status && <p>{status}</p>}
      </div>
    </>
  );
};

export default MintRequestForm;

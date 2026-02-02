import React, { useState, useEffect, JSX } from 'react';
import styles from '../../styles/CreateNFT.module.css';
import RadixSelect from '../admins/RadixSelect';
import { useWallet } from '@solana/wallet-adapter-react';
import NFTPreviewCard from '../admins/NFTPreviewCard';
import toast from 'react-hot-toast';

interface MintRequestStatus {
  _id: string;
  title: string;
  brand: string;
  model: string;
  referenceNumber: string;
  priceUSD: number;
  status: 'pending' | 'approved' | 'minted' | 'rejected';
  rejectionNotes?: string;
  createdAt: string;
}

const MintRequestForm = () => {
  const wallet = useWallet();
  const [myRequests, setMyRequests] = useState<MintRequestStatus[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

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

  // Fetch SOL price
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

  // Fetch user's mint requests
  const fetchMyRequests = async () => {
    if (!wallet.publicKey) return;
    setLoadingRequests(true);
    try {
      const res = await fetch(`/api/vendor/mint-request?wallet=${wallet.publicKey.toBase58()}`);
      const data = await res.json();
      if (res.ok) {
        setMyRequests(data.requests || []);
      }
    } catch (err) {
      console.error('Failed to fetch mint requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    fetchMyRequests();
  }, [wallet.publicKey]);

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
      return toast.error('Wallet must be connected and image must be uploaded.');
    }

    if (!brand || !model) {
      return toast.error('Brand and Model are required.');
    }

    if (!referenceNumber) {
      return toast.error('Reference number is required.');
    }

    // Parse USD price as the source of truth
    const priceUSD = parseFloat(usdInput) || 0;
    if (priceUSD <= 0) {
      return toast.error('Valid price in USD is required.');
    }

    setStatus('Submitting...');

    const payload = {
      imageBase64,
      title: title || `${brand} ${model}`,
      description,
      priceUSD,
      brand,
      model,
      referenceNumber,
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
    };

    try {
      const res = await fetch('/api/vendor/mint-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Mint request submitted for admin review!');
        setStatus('');
        // Reset form
        setTitle('');
        setDescription('');
        setBrand('');
        setModel('');
        setReferenceNumber('');
        setUsdInput('');
        setPriceSol(0);
        setImageBase64(null);
        setImagePreview(null);
        // Refresh requests list
        fetchMyRequests();
      } else {
        toast.error(data.error || 'Failed to submit mint request.');
        setStatus('');
      }
    } catch (err) {
      toast.error('Network error. Please try again.');
      setStatus('');
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

        <button onClick={handleSubmit} className={styles.mintButton} disabled={!!status}>
          {status || 'Submit Mint Request'}
        </button>
      </div>

      {/* My Mint Requests Section */}
      <div className={styles.formContainer} style={{ marginTop: '30px' }}>
        <div className={styles.formSection}>
          <div className={styles.formSectionTitle}>My Mint Requests</div>
          {loadingRequests ? (
            <p style={{ color: '#888' }}>Loading requests...</p>
          ) : myRequests.length === 0 ? (
            <p style={{ color: '#888' }}>No mint requests yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {myRequests.map((req) => (
                <div
                  key={req._id}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    padding: '12px 16px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#fff' }}>{req.title}</strong>
                      <span style={{ color: '#888', marginLeft: '8px', fontSize: '12px' }}>
                        {req.referenceNumber}
                      </span>
                    </div>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        background:
                          req.status === 'pending'
                            ? 'rgba(255, 193, 7, 0.2)'
                            : req.status === 'approved'
                              ? 'rgba(33, 150, 243, 0.2)'
                              : req.status === 'minted'
                                ? 'rgba(76, 175, 80, 0.2)'
                                : 'rgba(244, 67, 54, 0.2)',
                        color:
                          req.status === 'pending'
                            ? '#ffc107'
                            : req.status === 'approved'
                              ? '#2196f3'
                              : req.status === 'minted'
                                ? '#4caf50'
                                : '#f44336',
                      }}
                    >
                      {req.status}
                    </span>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '13px', color: '#aaa' }}>
                    ${req.priceUSD?.toLocaleString()} ·{' '}
                    {new Date(req.createdAt).toLocaleDateString()}
                  </div>
                  {req.status === 'rejected' && req.rejectionNotes && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '8px',
                        background: 'rgba(244, 67, 54, 0.1)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: '#f44336',
                      }}
                    >
                      <strong>Reason:</strong> {req.rejectionNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default MintRequestForm;

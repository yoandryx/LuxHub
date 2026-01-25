// pages/vendor/onboard.tsx
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState, useLayoutEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import AvatarBannerUploader from '../../components/vendor/AvatarBannerUploader';
import styles from '../../styles/VendorOnboard.module.css';
import toast from 'react-hot-toast';

import * as multisig from '@sqds/multisig';
import { Keypair, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

import {
  FaUser,
  FaImage,
  FaCheckCircle,
  FaArrowLeft,
  FaArrowRight,
  FaCopy,
  FaDownload,
  FaShieldAlt,
  FaCheck,
  FaInfoCircle,
  FaExclamationTriangle,
} from 'react-icons/fa';
import { HiSparkles } from 'react-icons/hi';
import { BiLoaderAlt } from 'react-icons/bi';

const { Permission, Permissions } = multisig.types;

export default function VendorOnboard() {
  const router = useRouter();
  const { query } = router;
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  // Wizard step state (0: Account Info, 1: Images, 2: Review)
  const [currentStep, setCurrentStep] = useState(0);

  /* ---------- PROFILE STATE ---------- */
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    bio: '',
    instagram: '',
    x: '',
    website: '',
    avatarUrl: '',
    bannerUrl: '',
  });

  const [errors, setErrors] = useState({
    name: false,
    username: false,
    bio: false,
    instagram: false,
    x: false,
    website: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);

  /* ---------- OPTIONAL TREASURY STATE ---------- */
  const [enableTreasury, setEnableTreasury] = useState(false);
  const [multisigState, setMultisigState] = useState({
    pda: '',
    members: publicKey ? [publicKey.toBase58()] : [],
    threshold: 1,
  });
  const [multisigLoading, setMultisigLoading] = useState(false);
  const [multisigCreated, setMultisigCreated] = useState(false);
  const [multisigError, setMultisigError] = useState('');
  const [createKey, setCreateKey] = useState<Keypair | null>(null);
  const [lastTxSignature, setLastTxSignature] = useState<string>('');
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  /* ---------- VALIDATION HELPERS ---------- */
  const isBlobUrl = (url: string) => url.startsWith('blob:');
  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };
  const isSocialHandleValid = (h: string) => /^[a-zA-Z0-9._]{2,30}$/.test(h);

  /* ---------- STEP VALIDATION ---------- */
  const isStep1Valid = useMemo(() => {
    return (
      publicKey &&
      formData.name.trim() &&
      formData.username.trim() &&
      formData.bio.trim() &&
      !errors.name &&
      !errors.username &&
      !errors.bio &&
      !errors.instagram &&
      !errors.x &&
      !errors.website
    );
  }, [formData, errors, publicKey]);

  const isStep2Valid = useMemo(() => {
    return (
      formData.avatarUrl &&
      formData.bannerUrl &&
      !isBlobUrl(formData.avatarUrl) &&
      !isBlobUrl(formData.bannerUrl)
    );
  }, [formData.avatarUrl, formData.bannerUrl]);

  // Treasury is optional - only validate if enabled
  const isTreasuryValid = useMemo(() => {
    if (!enableTreasury) return true;
    return multisigCreated && backupConfirmed;
  }, [enableTreasury, multisigCreated, backupConfirmed]);

  const canSubmit = isStep1Valid && isStep2Valid && isTreasuryValid;

  /* ---------- UPDATE ERRORS ---------- */
  useEffect(() => {
    setErrors((prev) => ({
      ...prev,
      name: formData.name.trim() !== '' && formData.name.trim().length < 2,
      username: formData.username.trim() !== '' && formData.username.trim().length < 3,
      bio: formData.bio.trim() !== '' && formData.bio.trim().length < 10,
      instagram: formData.instagram.trim() !== '' && !isSocialHandleValid(formData.instagram),
      x: formData.x.trim() !== '' && !isSocialHandleValid(formData.x),
      website: formData.website.trim() !== '' && !isValidUrl(formData.website),
    }));
  }, [formData]);

  /* ---------- SYNC WALLET ---------- */
  useEffect(() => {
    if (publicKey) {
      setMultisigState((prev) => {
        const newMembers = [...prev.members];
        if (newMembers[0] !== publicKey.toBase58()) {
          newMembers[0] = publicKey.toBase58();
        }
        return { ...prev, members: newMembers };
      });
    }
  }, [publicKey]);

  /* ---------- SCROLL TO TOP ON STEP CHANGE ---------- */
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  /* ---------- CHECK USERNAME AVAILABILITY ---------- */
  const checkUsername = async (username: string) => {
    const trimmed = username.trim();
    if (!trimmed || trimmed.length < 3) {
      setErrors((prev) => ({ ...prev, username: true }));
      return;
    }

    setUsernameChecking(true);
    try {
      const res = await fetch('/api/vendor/checkUsername', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed }),
      });
      const data = await res.json();
      setErrors((prev) => ({ ...prev, username: !data.available }));
    } catch {
      setErrors((prev) => ({ ...prev, username: true }));
    } finally {
      setUsernameChecking(false);
    }
  };

  /* ---------- DOWNLOAD BACKUP ---------- */
  const downloadVaultBackup = () => {
    if (!publicKey || !createKey || !multisigState.pda) {
      toast.error('Missing required data');
      return;
    }

    const isDevnet = connection.rpcEndpoint.includes('devnet');
    const programConfigPda = new PublicKey(
      isDevnet
        ? 'HM5y4mz3Bt9JY9mr1hkyhnvqxSH4H2u2451j7Hc2dtvK'
        : 'BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr'
    );

    const txt = [
      '=== LUXHUB VENDOR TREASURY BACKUP ===',
      '',
      `Network: ${isDevnet ? 'Devnet' : 'Mainnet Beta'}`,
      `Date: ${new Date().toISOString()}`,
      `Vendor: ${formData.name}`,
      `Wallet: ${publicKey.toBase58()}`,
      '',
      'TREASURY VAULT ADDRESS:',
      multisigState.pda,
      '',
      'RECOVERY KEY (KEEP THIS SAFE!):',
      bs58.encode(createKey.secretKey),
      '',
      'CREATION TRANSACTION:',
      lastTxSignature,
      '',
      'TREASURY CONFIG PDA:',
      programConfigPda.toBase58(),
      '',
      '=== IMPORTANT ===',
      '- This recovery key controls your treasury vault',
      '- LuxHub does NOT store this key',
      '- Store this file offline in a secure location',
      '- Import into app.squads.so to manage your vault',
      '',
      'Generated by LuxHub Vendor Onboarding',
    ].join('\n');

    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `luxhub-treasury-${formData.username || publicKey.toBase58().slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    setBackupConfirmed(true);
    toast.success('Backup downloaded successfully!');
  };

  /* ---------- CREATE TREASURY (MULTISIG) ---------- */
  const createTreasury = async () => {
    if (!publicKey || !signTransaction) {
      toast.error('Please connect your wallet');
      return;
    }

    setMultisigLoading(true);
    setMultisigError('');

    try {
      const isDevnet = connection.rpcEndpoint.includes('devnet');
      const programConfigPda = new PublicKey(
        isDevnet
          ? 'HM5y4mz3Bt9JY9mr1hkyhnvqxSH4H2u2451j7Hc2dtvK'
          : 'BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr'
      );

      const newCreateKey = Keypair.generate();
      const [multisigPda] = multisig.getMultisigPda({ createKey: newCreateKey.publicKey });

      const members = multisigState.members.map((addr, idx) => ({
        key: new PublicKey(addr),
        permissions: idx === 0 ? Permissions.all() : Permissions.fromPermissions([Permission.Vote]),
      }));

      const ix = multisig.instructions.multisigCreateV2({
        createKey: newCreateKey.publicKey,
        creator: publicKey,
        multisigPda,
        configAuthority: null,
        timeLock: 0,
        members,
        threshold: multisigState.threshold,
        rentCollector: null,
        treasury: programConfigPda,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const message = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message();

      const tx = new VersionedTransaction(message);
      tx.sign([newCreateKey]);
      const signed = await signTransaction(tx);
      const sig = await connection.sendTransaction(signed, { skipPreflight: false });

      setLastTxSignature(sig);

      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        'processed'
      );

      setCreateKey(newCreateKey);
      setMultisigState((s) => ({ ...s, pda: multisigPda.toBase58() }));
      setMultisigCreated(true);
      toast.success('Treasury vault created!');
    } catch (e: any) {
      console.error('Treasury creation error:', e);
      setMultisigError(e?.message ?? 'Failed to create treasury');
      toast.error('Treasury creation failed');
    } finally {
      setMultisigLoading(false);
    }
  };

  /* ---------- FINAL SUBMIT ---------- */
  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error('Please complete all required fields');
      return;
    }

    const payload = {
      ...formData,
      wallet: publicKey?.toBase58(),
      inviteCode: query.v,
      socialLinks: {
        instagram: formData.instagram,
        x: formData.x,
        website: formData.website,
      },
      multisigPda: enableTreasury ? multisigState.pda : null,
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/vendor/onboard-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      console.log('API RESPONSE:', res.status, text);

      if (res.ok) {
        toast.success('Application submitted successfully!');
        router.push(`/vendor/${publicKey?.toBase58()}`);
      } else {
        const data = text ? JSON.parse(text) : {};
        toast.error(data?.error ?? 'Submission failed');
      }
    } catch (e) {
      console.error(e);
      toast.error('Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- NAVIGATION ---------- */
  const handleNext = () => {
    if (currentStep === 0 && !isStep1Valid) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (currentStep === 1 && !isStep2Valid) {
      toast.error('Please upload both profile images');
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, 2));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  /* ---------- RENDER ---------- */
  return (
    <div className={styles.onboardContainer}>
      <div className={styles.wizardWrapper}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Become a LuxHub Vendor</h1>
          <p className={styles.pageSubtitle}>
            Join our marketplace and reach luxury collectors worldwide
          </p>
        </div>

        {/* Progress Stepper */}
        <div className={styles.progressStepper}>
          {[
            { label: 'Account', icon: <FaUser /> },
            { label: 'Images', icon: <FaImage /> },
            { label: 'Review', icon: <FaCheckCircle /> },
          ].map((step, idx) => (
            <div key={idx} className={styles.stepItem}>
              {idx > 0 && (
                <div
                  className={`${styles.stepConnector} ${
                    currentStep > idx - 1 ? styles.completed : ''
                  }`}
                />
              )}
              <div
                className={`${styles.stepCircle} ${
                  currentStep === idx ? 'active' : ''
                } ${currentStep > idx ? styles.completed : ''} ${
                  currentStep === idx ? styles.active : ''
                }`}
              >
                {currentStep > idx ? <FaCheck /> : idx + 1}
              </div>
              <span
                className={`${styles.stepLabel} ${
                  currentStep === idx ? styles.active : ''
                } ${currentStep > idx ? styles.completed : ''}`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Wizard Card */}
        <div className={styles.wizardCard}>
          {/* STEP 1: Account Info */}
          {currentStep === 0 && (
            <>
              <div className={styles.sectionHeading}>
                <FaUser className={styles.sectionIcon} />
                <h2>Business Information</h2>
              </div>
              <p className={styles.sectionSubtext}>
                Tell us about your business. This information will be displayed on your vendor
                profile.
              </p>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Business Name *</label>
                <input
                  type="text"
                  className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
                  placeholder="Your brand or business name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                {errors.name && (
                  <span className={styles.errorMessage}>Name must be at least 2 characters</span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Username *</label>
                <input
                  type="text"
                  className={`${styles.formInput} ${errors.username ? styles.inputError : ''}`}
                  placeholder="@yourusername"
                  value={formData.username}
                  onChange={(e) => {
                    const value = e.target.value.trim().toLowerCase();
                    setFormData({ ...formData, username: value });
                  }}
                  onBlur={(e) => checkUsername(e.target.value.trim())}
                />
                {usernameChecking && (
                  <span className={styles.errorMessage} style={{ color: 'var(--text-muted)' }}>
                    Checking availability...
                  </span>
                )}
                {errors.username && !usernameChecking && formData.username.trim() && (
                  <span className={styles.errorMessage}>
                    {formData.username.trim().length < 3
                      ? 'Username must be at least 3 characters'
                      : 'This username is not available'}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Bio *</label>
                <textarea
                  className={`${styles.formTextarea} ${errors.bio ? styles.inputError : ''}`}
                  placeholder="Tell collectors about your brand, what you sell, and your expertise..."
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={4}
                />
                {errors.bio && (
                  <span className={styles.errorMessage}>Bio must be at least 10 characters</span>
                )}
              </div>

              <div className={styles.sectionHeading}>
                <HiSparkles className={styles.sectionIcon} />
                <h2>Social Links</h2>
              </div>
              <p className={styles.sectionSubtext}>
                Optional: Add your social media profiles for verification and credibility.
              </p>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Instagram</label>
                  <input
                    type="text"
                    className={`${styles.formInput} ${errors.instagram ? styles.inputError : ''}`}
                    placeholder="username (without @)"
                    value={formData.instagram}
                    onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>X (Twitter)</label>
                  <input
                    type="text"
                    className={`${styles.formInput} ${errors.x ? styles.inputError : ''}`}
                    placeholder="username (without @)"
                    value={formData.x}
                    onChange={(e) => setFormData({ ...formData, x: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Website</label>
                <input
                  type="text"
                  className={`${styles.formInput} ${errors.website ? styles.inputError : ''}`}
                  placeholder="https://yourwebsite.com"
                  value={formData.website}
                  onChange={(e) => {
                    let value = e.target.value.trim();
                    if (value && !/^https?:\/\//i.test(value)) {
                      value = 'https://' + value;
                    }
                    setFormData({ ...formData, website: value });
                  }}
                />
              </div>
            </>
          )}

          {/* STEP 2: Images */}
          {currentStep === 1 && (
            <>
              <div className={styles.sectionHeading}>
                <FaImage className={styles.sectionIcon} />
                <h2>Profile Images</h2>
              </div>
              <p className={styles.sectionSubtext}>
                Upload a profile picture and banner image. These will be displayed on your vendor
                page.
              </p>

              {/* Preview Section */}
              <div className={styles.previewSection}>
                {formData.bannerUrl ? (
                  <img src={formData.bannerUrl} className={styles.bannerPreview} alt="Banner" />
                ) : (
                  <div className={`${styles.bannerPlaceholder} ${styles.imagePlaceholder}`}>
                    Banner Preview
                  </div>
                )}
                {formData.avatarUrl ? (
                  <img src={formData.avatarUrl} className={styles.avatarPreview} alt="Avatar" />
                ) : (
                  <div className={`${styles.avatarPlaceholder} ${styles.imagePlaceholder}`}>
                    Avatar
                  </div>
                )}
              </div>

              <div className={styles.sectionHeading}>
                <HiSparkles className={styles.sectionIcon} />
                <h2>Upload Images</h2>
              </div>

              <AvatarBannerUploader
                onUploadComplete={(avatar, banner) => {
                  setFormData((prev) => ({
                    ...prev,
                    avatarUrl: avatar || prev.avatarUrl,
                    bannerUrl: banner || prev.bannerUrl,
                  }));
                }}
                onPreviewUpdate={() => {}}
              />

              {!isStep2Valid && (
                <div className={styles.infoCallout}>
                  <FaInfoCircle />
                  <span className={styles.infoText}>
                    Please upload both an avatar and banner image to continue.
                  </span>
                </div>
              )}
            </>
          )}

          {/* STEP 3: Review & Optional Treasury */}
          {currentStep === 2 && (
            <>
              <div className={styles.sectionHeading}>
                <FaCheckCircle className={styles.sectionIcon} />
                <h2>Review Your Profile</h2>
              </div>

              {/* Profile Preview Card */}
              <div className={styles.profilePreview}>
                {formData.bannerUrl && (
                  <img src={formData.bannerUrl} className={styles.profileBanner} alt="Banner" />
                )}
                <div className={styles.profileInfo}>
                  {formData.avatarUrl && (
                    <img src={formData.avatarUrl} className={styles.profileAvatar} alt="Avatar" />
                  )}
                  <h3 className={styles.profileName}>{formData.name || 'Your Business Name'}</h3>
                  <p className={styles.profileUsername}>@{formData.username || 'username'}</p>
                  <p className={styles.profileBio}>
                    {formData.bio || 'Your bio will appear here...'}
                  </p>
                </div>
              </div>

              {/* Review Details */}
              <div className={styles.reviewGrid}>
                <div className={styles.reviewItem}>
                  <span className={styles.reviewLabel}>Wallet</span>
                  <span className={`${styles.reviewValue} ${styles.truncate}`}>
                    {publicKey
                      ? `${publicKey.toBase58().slice(0, 6)}...${publicKey.toBase58().slice(-4)}`
                      : 'Not connected'}
                  </span>
                </div>
                {formData.instagram && (
                  <div className={styles.reviewItem}>
                    <span className={styles.reviewLabel}>Instagram</span>
                    <span className={styles.reviewValue}>@{formData.instagram}</span>
                  </div>
                )}
                {formData.x && (
                  <div className={styles.reviewItem}>
                    <span className={styles.reviewLabel}>X (Twitter)</span>
                    <span className={styles.reviewValue}>@{formData.x}</span>
                  </div>
                )}
                {formData.website && (
                  <div className={styles.reviewItem}>
                    <span className={styles.reviewLabel}>Website</span>
                    <span className={`${styles.reviewValue} ${styles.truncate}`}>
                      {formData.website}
                    </span>
                  </div>
                )}
              </div>

              {/* Optional Treasury Section */}
              <div className={styles.sectionHeading}>
                <FaShieldAlt className={styles.sectionIcon} />
                <h2>Vendor Treasury</h2>
              </div>

              {!multisigCreated ? (
                <div className={styles.treasuryOption}>
                  <div className={styles.treasuryHeader}>
                    <div className={styles.treasuryTitle}>
                      <FaShieldAlt />
                      Squads Treasury Vault
                    </div>
                    <span className={styles.treasuryBadge}>Optional</span>
                  </div>
                  <p className={styles.treasuryDescription}>
                    Create a dedicated treasury vault to manage your LuxHub earnings. Great for
                    tracking sales, managing taxes, and separating business funds.
                  </p>

                  <div className={styles.treasuryBenefits}>
                    <div className={styles.benefitItem}>
                      <FaCheck /> Separate business from personal funds
                    </div>
                    <div className={styles.benefitItem}>
                      <FaCheck /> Easier tax tracking & reporting
                    </div>
                    <div className={styles.benefitItem}>
                      <FaCheck /> Add team members later (accountant, partner)
                    </div>
                    <div className={styles.benefitItem}>
                      <FaCheck /> Institutional-grade security via Squads Protocol
                    </div>
                  </div>

                  <div
                    className={styles.treasuryToggle}
                    onClick={() => setEnableTreasury(!enableTreasury)}
                  >
                    <div
                      className={`${styles.toggleSwitch} ${enableTreasury ? styles.active : ''}`}
                    />
                    <span className={styles.toggleLabel}>
                      {enableTreasury ? 'Treasury enabled' : 'Enable treasury vault'}
                    </span>
                  </div>

                  {enableTreasury && (
                    <div className={styles.mt20}>
                      <div className={styles.infoCallout}>
                        <FaInfoCircle />
                        <span className={styles.infoText}>
                          Your wallet ({publicKey?.toBase58().slice(0, 8)}...) will be the sole
                          owner of this vault. You can add more members later from your dashboard.
                        </span>
                      </div>

                      {multisigError && (
                        <div className={styles.warningBox}>
                          <FaExclamationTriangle />
                          <span className={styles.warningText}>{multisigError}</span>
                        </div>
                      )}

                      <button
                        className={styles.secondaryButton}
                        onClick={createTreasury}
                        disabled={multisigLoading}
                      >
                        {multisigLoading ? (
                          <>
                            <BiLoaderAlt className={styles.loadingSpinner} />
                            Creating Vault...
                          </>
                        ) : (
                          <>
                            <FaShieldAlt />
                            Create Treasury Vault
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.treasurySuccess}>
                  <div className={styles.successHeader}>
                    <FaCheckCircle />
                    Treasury Vault Created
                  </div>

                  <div className={styles.vaultAddress}>
                    <code>
                      {multisigState.pda.slice(0, 12)}...{multisigState.pda.slice(-8)}
                    </code>
                    <button
                      className={styles.copyButton}
                      onClick={() => {
                        navigator.clipboard.writeText(multisigState.pda);
                        toast.success('Address copied!');
                      }}
                    >
                      <FaCopy />
                    </button>
                  </div>

                  <div className={styles.warningBox}>
                    <FaExclamationTriangle />
                    <span className={styles.warningText}>
                      <strong>Important:</strong> Download your backup file now. It contains your
                      recovery key. LuxHub cannot recover this for you.
                    </span>
                  </div>

                  <div className={styles.actionButtons}>
                    <button className={styles.secondaryButton} onClick={downloadVaultBackup}>
                      <FaDownload />
                      Download Backup
                    </button>
                    <a
                      href={`https://explorer.solana.com/address/${multisigState.pda}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.secondaryButton}
                      style={{ textDecoration: 'none' }}
                    >
                      View on Explorer
                    </a>
                  </div>

                  <div className={styles.checkboxGroup}>
                    <input
                      type="checkbox"
                      id="backup-confirmed"
                      checked={backupConfirmed}
                      onChange={(e) => setBackupConfirmed(e.target.checked)}
                    />
                    <label htmlFor="backup-confirmed" className={styles.checkboxLabel}>
                      I have downloaded and securely stored my backup file
                    </label>
                  </div>
                </div>
              )}

              {/* Skip Treasury Notice */}
              {!enableTreasury && !multisigCreated && (
                <div className={styles.infoCallout}>
                  <FaInfoCircle />
                  <span className={styles.infoText}>
                    You can skip the treasury for now. Sales proceeds will be sent directly to your
                    connected wallet. You can set up a treasury later from your vendor dashboard.
                  </span>
                </div>
              )}
            </>
          )}

          {/* Navigation Buttons */}
          <div className={styles.navButtons}>
            {currentStep > 0 ? (
              <button className={styles.backButton} onClick={handleBack}>
                <FaArrowLeft />
                Back
              </button>
            ) : (
              <div />
            )}

            {currentStep < 2 ? (
              <button
                className={styles.nextButton}
                onClick={handleNext}
                disabled={currentStep === 0 ? !isStep1Valid : !isStep2Valid}
              >
                Continue
                <FaArrowRight />
              </button>
            ) : (
              <button
                className={styles.submitButton}
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
              >
                {submitting ? (
                  <>
                    <BiLoaderAlt className={styles.loadingSpinner} />
                    Submitting...
                  </>
                ) : (
                  <>
                    <FaCheckCircle />
                    Submit Profile
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

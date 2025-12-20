// pages/vendor/onboard.tsx
import { useRouter } from "next/router";
import { useEffect, useMemo, useState, useLayoutEffect } from "react";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import AvatarBannerUploader from "../../components/vendor/AvatarBannerUploader";
import styles from "../../styles/VendorDashboard.module.css";
import { SlArrowDown } from "react-icons/sl";
import toast from "react-hot-toast";

import * as multisig from "@sqds/multisig";
import {
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

import { LuShieldAlert } from "react-icons/lu";
import { IoKeyOutline } from "react-icons/io5";
import { BiHide } from "react-icons/bi";
import { FaTimes, FaCopy } from "react-icons/fa";

const getBase58SecretKey = (keypair: Keypair) => {
  return bs58.encode(keypair.secretKey);
};

const { Permission, Permissions } = multisig.types;

export default function OnboardingForm() {
  const router = useRouter();
  const { query } = router;
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  // Wizard step state
  const [currentStep, setCurrentStep] = useState(0);

  const [showRecoveryKey, setShowRecoveryKey] = useState(true);

  /* ---------- PROFILE STATE ---------- */
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    bio: "",
    instagram: "",
    x: "",
    website: "",
    avatarUrl: "",
    bannerUrl: "",
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

  /* ---------- MULTISIG STATE ---------- */
  const [multisigState, setMultisigState] = useState({
    pda: "",
    members: publicKey ? [publicKey.toBase58()] : [],
    threshold: 1,
  });
  const [multisigLoading, setMultisigLoading] = useState(false);
  const [multisigCreated, setMultisigCreated] = useState(false);
  const [multisigError, setMultisigError] = useState("");
  const [createKey, setCreateKey] = useState<Keypair | null>(null); // ← Store temporarily
  const [lastTxSignature, setLastTxSignature] = useState<string>("");
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  /* ---------- AUTO-LOAD SAVED PDA ---------- */
  // useEffect(() => {
  //   if (!publicKey) return;

  //   const savedPda = localStorage.getItem("luxhub_multisig_pda");
  //   if (savedPda) {
  //     setMultisigState((prev) => ({
  //       ...prev,
  //       pda: savedPda,
  //       members: [publicKey.toBase58()],
  //       threshold: 1,
  //     }));
  //     setMultisigCreated(true);
  //     toast.success("Multisig vault loaded from previous session!");
  //   }
  // }, [publicKey]);

  /* ---------- VALIDATION HELPERS ---------- */
  const isBlobUrl = (url: string) => url.startsWith("blob:");
  const isValidUrl = (url: string) => {
    try { new URL(url); return true; } catch { return false; }
  };
  const isSocialHandleValid = (h: string) =>
    /^[a-zA-Z0-9._]{2,30}$/.test(h);

  /* ---------- DEBUG LOGGER ---------- */
  const debugLog = (label: string, data: any) => {
    const entry = {
      timestamp: new Date().toISOString(),
      label,
      data: typeof data === "object" ? JSON.parse(JSON.stringify(data)) : data,
    };
    const logs = JSON.parse(localStorage.getItem("multisigDebug") || "[]");
    logs.push(entry);
    localStorage.setItem("multisigDebug", JSON.stringify(logs.slice(-50)));
    console.log(`[DEBUG] ${label}`, data);
  };

  /* ---------- VALIDATION LOGIC ---------- */
  const profileValid = useMemo(() => {
    return (
      publicKey &&
      formData.name.trim() &&
      formData.username.trim() &&
      formData.bio.trim() &&
      formData.avatarUrl &&
      formData.bannerUrl &&
      !isBlobUrl(formData.avatarUrl) &&
      !isBlobUrl(formData.bannerUrl) &&
      Object.values(errors).every((e) => !e)
    );
  }, [formData, errors, publicKey]);

  const multisigValid = useMemo(() => {
    const membersOk = multisigState.members.every((m) => {
      try { new PublicKey(m); return true; } catch { return false; }
    });
    return (
      multisigState.threshold >= 1 &&
      multisigState.threshold <= multisigState.members.length &&
      membersOk &&
      multisigState.members.length >= 1
    );
  }, [multisigState]);

  /* ---------- STEP VALIDATION (must be BEFORE isCurrentStepValid) ---------- */

  const isBusinessInfoStepValid =
    formData.name.trim() &&
    formData.username.trim() &&
    formData.bio.trim() &&
    Object.values(errors).every((e) => !e);

  const isImagesStepValid =
    formData.avatarUrl &&
    formData.bannerUrl &&
    !isBlobUrl(formData.avatarUrl) &&
    !isBlobUrl(formData.bannerUrl);

    const isMultisigStepValid = multisigCreated && backupConfirmed;

  /* ---------- NOW we can safely reference them ---------- */
  const isCurrentStepValid = useMemo(() => {
    if (currentStep === 0) return isBusinessInfoStepValid;   // Business Info
    if (currentStep === 1) return isImagesStepValid;         // Images
    if (currentStep === 2) return isMultisigStepValid;       // Multisig
    return true;                                            // Submit step
  }, [
    currentStep,
    isBusinessInfoStepValid,
    isImagesStepValid,
    isMultisigStepValid,
  ]);
    

  /* ---------- UPDATE ERRORS ---------- */
  useEffect(() => {
    setErrors((prev) => ({
      ...prev,
      name: !formData.name.trim(),
      username: !formData.username.trim(),
      bio: !formData.bio.trim(),
      instagram:
        formData.instagram.trim() !== "" &&
        !isSocialHandleValid(formData.instagram),
      x: formData.x.trim() !== "" && !isSocialHandleValid(formData.x),
      website:
        formData.website.trim() !== "" && !isValidUrl(formData.website),
    }));
  }, [formData]);

  /* ---------- SYNC FIRST MEMBER WITH WALLET ---------- */
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

  // NEW EFFECT 
  useLayoutEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [currentStep]);

  /* ---------- MULTISIG UI HELPERS ---------- */
  const addMember = () => {
    setMultisigState((s) => ({ ...s, members: [...s.members, ""] }));
  };

  const removeMember = (i: number) => {
    setMultisigState((s) => ({
      ...s,
      members: s.members.filter((_, idx) => idx !== i),
    }));
  };

  const updateMember = (i: number, val: string) => {
    if (i === 0) return;
    setMultisigState((s) => {
      const m = [...s.members];
      m[i] = val;
      return { ...s, members: m };
    });
  };

  /* ---------- DOWNLOAD BACKUP ---------- */
  const downloadVaultBackup = () => {
    if (!publicKey || !createKey || !multisigState.pda) {
      toast.error("Missing required data");
      return;
    }

    const isDevnet = connection.rpcEndpoint.includes("devnet");
    const programConfigPda = new PublicKey(
      isDevnet
        ? "HM5y4mz3Bt9JY9mr1hkyhnvqxSH4H2u2451j7Hc2dtvK"
        : "BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr"
    );

    const txt = [
      "=== LUXHUB VENDOR MULTISIG VAULT BACKUP ===",
      "",
      `Network: ${isDevnet ? "Devnet" : "Mainnet Beta"}`,
      `Date: ${new Date().toISOString()}`,
      `Your Wallet: ${publicKey.toBase58()}`,
      "",
      "VAULT PDA (Multisig Address):",
      multisigState.pda,
      "",
      "RECOVERY KEY (Create Key - SAVE THIS!):",
      bs58.encode(createKey.secretKey),
      "",
      "CREATION TRANSACTION:",
      lastTxSignature,
      "",
      "TREASURY CONFIG PDA:",
      programConfigPda.toBase58(),
      "",
      "=== SECURITY WARNING ===",
      "• This recovery key controls your vault.",
      "• LuxHub does NOT store it.",
      "• Store offline. Never share.",
      "• Import into Squads.so to recover.",
      "",
      "Backup generated by LuxHub onboarding.",
    ].join("\n");

    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `luxhub-vault-backup-${publicKey.toBase58().slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    setShowRecoveryKey(false);
    setBackupConfirmed(true);
    toast.success("Backup saved as .txt – key hidden!");
  };

  /* ---------- CREATE MULTISIG ON-CHAIN ---------- */
  const createMultisig = async () => {
    if (!publicKey || !signTransaction) return toast.error("Wallet not connected");
    if (!multisigValid) return toast.error("Fix multisig fields first");

    setMultisigLoading(true);
    setMultisigError("");

    try {
      const isDevnet = connection.rpcEndpoint.includes("devnet");
      const programConfigPda = new PublicKey(
        isDevnet
          ? "HM5y4mz3Bt9JY9mr1hkyhnvqxSH4H2u2451j7Hc2dtvK"
          : "BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr"
      );

      const newCreateKey = Keypair.generate();
      const [multisigPda] = multisig.getMultisigPda({ createKey: newCreateKey.publicKey });

      debugLog("Create Key", newCreateKey.publicKey.toBase58());
      debugLog("Multisig PDA", multisigPda.toBase58());

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
      debugLog("Transaction Sent", sig);

      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "processed"
      );

      debugLog("Multisig Created", { pda: multisigPda.toBase58(), signature: sig });

      setCreateKey(newCreateKey);
      setMultisigState((s) => ({ ...s, pda: multisigPda.toBase58() }));
      setMultisigCreated(true);
      // localStorage.setItem("luxhub_multisig_pda", multisigPda.toBase58());
      toast.success(`Multisig created! PDA: ${multisigPda.toBase58().slice(0, 8)}…`);
    } catch (e: any) {
      debugLog("ERROR", { message: e.message, logs: e.logs?.join("\n") });
      setMultisigError(e?.message ?? "Unknown error");
      toast.error("Multisig creation failed");
    } finally {
      setMultisigLoading(false);
    }
  };

  /* ---------- FINAL SUBMIT ---------- */
  const handleSubmit = async () => {
    if (!profileValid) {
      toast.error("Please fill all required fields and upload images.");
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
      multisigPda: multisigState.pda || null,
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/vendor/onboard-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      console.log("API RESPONSE:", res.status, text);

      if (res.ok) {
        localStorage.removeItem("multisigDebug");
        toast.success("Vendor profile submitted!");
        router.push(`/vendor/${publicKey?.toBase58()}`);
      } else {
        const data = text ? JSON.parse(text) : {};
        toast.error(data?.error ?? "Server error");
      }
    } catch (e) {
      console.error(e);
      toast.error("Submission failed – check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const progressPercent = useMemo(() => {
    if (currentStep === 0) return isBusinessInfoStepValid ? 25 : 0;
    if (currentStep === 1) return isImagesStepValid ? 50 : 25;
    if (currentStep === 2) return isMultisigStepValid ? 75 : 50;
    return 100;
  }, [
    currentStep,
    isBusinessInfoStepValid,
    isImagesStepValid,
    isMultisigStepValid,
  ]);

  // Navigation
  const handleNext = () => {
    if (currentStep === 0 && !isBusinessInfoStepValid) {
      toast.error("Please fill all business info.");
      return;
    }
    if (currentStep === 1 && !isImagesStepValid) {
      toast.error("Please upload both images.");
      return;
    }
    if (currentStep === 2 && !isMultisigStepValid) {
      toast.error("Please create your multisig and confirm backup.");
      return;
    }

    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  /* ---------- RENDER ---------- */
  return (
    <div className={styles.dashboardContainer}>
      {/* <h2>Vendor Account</h2> */}

      {/* Progress Bar */}
      {/* <div className={styles.progressBarContainer}>
        <div className={styles.progressBar}>
          <div
            className={styles.progress}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div> */}

      <div className={styles.tabContentColumn}>
        <div className={styles.tabContentMain}>
          <div className={styles.tabContentRow}>
            <div className={styles.tabContentLeft}>

              {/* Step 1: Business Info */}
              {currentStep === 0 && (
                <>
                  <div className={styles.sectionHeading}><h2>Account Info</h2></div>

                  <p>NAME</p>
                  <input
                    id="name"
                    required
                    className={errors.name ? styles.inputError : ""}
                    placeholder="Business Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />

                  <p>USERNAME</p>
                  <input
                    id="username"
                    required
                    className={errors.username ? styles.inputError : ""}
                    placeholder="@username"
                    value={formData.username}
                    onChange={async (e) => {
                      const value = e.target.value.trim();
                      setFormData((prev) => ({ ...prev, username: value }));
                      if (!value) return setErrors((prev) => ({ ...prev, username: true }));
                      setErrors((prev) => ({ ...prev, username: false }));

                      try {
                        const res = await fetch("/api/vendor/checkUsername", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ username: value }),
                        });
                        const data = await res.json();
                        setErrors((prev) => ({ ...prev, username: !data.available }));
                      } catch (err) {
                        setErrors((prev) => ({ ...prev, username: true }));
                      }
                    }}
                  />
                  {errors.username && formData.username.trim() && (
                    <p className={styles.inputErrorMsg}>This username is already taken.</p>
                  )}

                  <p>BIO</p>
                  <textarea
                    id="bio"
                    required
                    className={errors.bio ? styles.inputError : ""}
                    placeholder="Your brand story"
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  />

                  <p>INSTAGRAM</p>
                  <input
                    id="instagram"
                    className={errors.instagram ? styles.inputError : ""}
                    placeholder="Instagram handle"
                    value={formData.instagram}
                    onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                  />

                  <p>X</p>
                  <input
                    id="x"
                    className={errors.x ? styles.inputError : ""}
                    placeholder="x handle"
                    value={formData.x}
                    onChange={(e) => setFormData({ ...formData, x: e.target.value })}
                  />

                  <p>WEBSITE (optional)</p>
                  <input
                    id="website"
                    className={errors.website ? styles.inputError : ""}
                    placeholder="Website URL"
                    value={formData.website}
                    onChange={(e) => {
                      let value = e.target.value.trim();
                      if (value && !/^https?:\/\//i.test(value)) value = "https://" + value;
                      setFormData({ ...formData, website: value });
                    }}
                  />

                  {!isBusinessInfoStepValid && (
                    <p style={{ color: "#ff6b6b", marginTop: "0.5rem" }}>
                      Fill all required business info fields.
                    </p>
                  )}
                </>
              )}


              {/* Step 2: Images */}
              {currentStep === 1 && (
                <>
                  {/* <h2>Upload Profile Images</h2> */}
                  {/* <AvatarBannerUploader
                    onUploadComplete={(avatar, banner) => {
                      setFormData((p) => ({
                        ...p,
                        avatarUrl: avatar || p.avatarUrl,
                        bannerUrl: banner || p.bannerUrl,
                      }));
                    }}
                    onPreviewUpdate={() => {}}
                  /> */}

                  <div className={styles.sectionHeading}><h2>Preview</h2></div>

                  {formData.bannerUrl ? (
                    <img src={formData.bannerUrl} className={` ${styles.skeletonImgBanner}`} alt="Banner" />
                  ) : (
                    <div className={`${styles.skeleton} ${styles.skeletonImgBanner}`} />
                  )}

                  {formData.avatarUrl ? (
                    <img src={formData.avatarUrl} className={`${styles.skeletonImgAvatar}`} alt="Avatar" />
                  ) : (
                    <div className={`${styles.skeleton} ${styles.skeletonImgAvatar}`} />
                  )}
                    {/* {formData.name ? <h1 className={styles.profileHeader}>{formData.name}</h1> : <div className={`${styles.skeleton} ${styles.skeletonText}`} />}
                  <div>
                    {formData.username ? <p className={styles.profileContent}>@{formData.username}</p> : <div className={`${styles.skeleton} ${styles.skeletonText}`} />}
                    <p>
                      {publicKey
                        ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
                        : "No wallet"}
                    </p>
                    {formData.bio ? <p className={styles.bioContent}>{formData.bio}</p> : <div className={`${styles.skeleton} ${styles.skeletonText}`} />}
                  </div> */}

                  <div className={styles.sectionHeading}><h2>Upload Profile Images</h2></div>
                  
                  <AvatarBannerUploader
                    onUploadComplete={(avatar, banner) => {
                      setFormData((p) => ({
                        ...p,
                        avatarUrl: avatar || p.avatarUrl,
                        bannerUrl: banner || p.bannerUrl,
                      }));
                    }}
                    onPreviewUpdate={() => {}}
                  />

                  {!isImagesStepValid && (
                    <p style={{ color: "#ff6b6b", margin:"0px"}}>
                      Upload both avatar and banner images.
                    </p>
                  )}
                </>
              )}

              {/* Step 2: Multisig */}
              {currentStep === 2 && (
                <>
                  <div className={styles.sectionHeading}><h2>Create Vendor Treasurary</h2></div>
                  {/* <p>
                    Your vault starts as a 1/1 multisig meaning you control it fully. <br />
                    You can add team members later from your dashboard.
                  </p> */}
                  {/* <p>Approval threshold</p> */}
                  <input type="hidden" value={1} />
                  {/* <input
                    type="number"
                    min={1}
                    max={multisigState.members.length}
                    value={multisigState.threshold}
                    onChange={(e) =>
                      setMultisigState((s) => ({
                        ...s,
                        threshold: Math.min(
                          s.members.length,
                          Math.max(1, Number(e.target.value))
                        ),
                      }))
                    }
                    style={{ width: "80px" }}
                  /> */}

                  {/* SUCCESS PANEL */}
                  {multisigCreated && (
                    <div className={styles.tabContent}>
                      <h2>Secure Treasurary</h2>

                      {/* 1. Vault Address (PDA) */}
                      <div style={{ marginBottom: "1rem" }}>
                        <div>
                          <p style={{ color: "#ffffffff" }}>Treasurary Vault Address: 
                            <code
                              style={{
                                fontSize: "12.5px",
                                background: "#ffffff14",
                                padding: "0.15rem 0.35rem",
                                borderRadius: "4px",
                                color: "#ffffffff",
                                width: "100%",
                              }}
                            >
                              <FaCopy/>{multisigState.pda.slice(0, 10)}...{multisigState.pda.slice(-10)}
                            </code>
                          </p>
                          
                        </div>
                        
                        <div className={styles.rowItems}>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(multisigState.pda);
                              toast.success("Vault address copied!");
                            }}
                            
                          >
                            Copy Address
                          </button>

                          <button
                            onClick={() => {
                              downloadVaultBackup();
                              setShowRecoveryKey(false); // Hide key after download
                            }}
                          >
                            Download Backup File
                          </button>
                        </div>

                        {/* <p className={styles.recoveryHint}>
                          Includes vault address, recovery key, and transaction proof.
                        </p> */}

                      </div>
                      
                      {/* 3. Links */}
                      {/* <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", fontSize: "13.5px", marginBottom: "1.5rem" }}>
                        <a
                          href={`https://app.squads.so/squads`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#ffffffff", textDecoration: "underline" }}
                        >
                          Open in Squads
                        </a>
                        <span style={{ color: "#ffffffff" }}>|</span>
                        <a
                          href={`https://explorer.solana.com/address/${multisigState.pda}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#ffffffff", textDecoration: "underline" }}
                        >
                          View on Explorer
                        </a>
                        <span style={{ color: "#ffffffff" }}>|</span>
                        <a
                          href={`https://explorer.solana.com/tx/${lastTxSignature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#ffffffff", textDecoration: "underline" }}
                        >
                          Creation Transaction
                        </a>
                      </div> */}

                      <div className={styles.rowItems}>
                        {/* 4. Recovery Key (Shown Once) */}
                        {showRecoveryKey && createKey && (
                          <div className={styles.recoveryKeyContainer}>
                            <h2>Recovery Key</h2>
                            
                            <div>
                              <code className={styles.recoveryKey}>
                                Key is hidden for privacy.
                              </code>
                            </div>
                            <div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(bs58.encode(createKey.secretKey));
                                  toast.success("Recovery key copied!");
                                }}
                                className={styles.recoveryButton}
                              >
                                Copy Key
                              </button>
                              {/* <button
                                onClick={() => setShowRecoveryKey(false)}
                                className={styles.recoveryButton}
                              >
                                Hide Key
                              </button> */}
                            </div>
                            <p className={styles.recoveryWarning}>
                              This key is only shown once and will disappear after you download the backup.
                            </p>
                           
                          </div>
                        )}

                        {/* 5. Critical Warning */}
                        <div className={styles.recoveryKeyContainer}>
                          
                          <h2>
                            Keep Your Recovery Key Secured
                          </h2>
                          <p className={styles.recoveryInfo}>
                            <IoKeyOutline className={styles.recoverIcons}/>Your Recovery Key Is Like A Master Key To Your Vault.
                          </p>
                          <p className={styles.recoveryInfo}>
                            <LuShieldAlert className={styles.recoverIcons}/>Anyone with this key can access and control the funds in your multisig vault.
                          </p>
                          <p className={styles.recoveryInfo}>
                            <BiHide className={styles.recoverIcons}/> NEVER share it with anyone. No person, website or app.
                          </p>
                        </div>
                      </div>

                      

                      {/* 6. Confirmation Checkbox */}
                      <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                        <input
                          type="checkbox"
                          id="backup-confirmed"
                          checked={backupConfirmed}
                          onChange={(e) => setBackupConfirmed(e.target.checked)}
                          style={{ marginTop: "0.15rem" }}
                        />
                        <label
                          htmlFor="backup-confirmed"
                          className={styles.recoveryHint}
                        >
                          I have downloaded and securely stored my backup file
                        </label>
                      </div>
                    </div>
                    
                    
                  )}
                  <p>Vault Member</p>
                  {multisigState.members.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <input
                        placeholder={
                          i === 0
                            ? "Your connected wallet (auto-filled)"
                            : "SOL address"
                        }
                        value={i === 0 ? publicKey?.toBase58() ?? "" : m}
                        disabled={i === 0}
                        onChange={(e) => updateMember(i, e.target.value)}
                        style={{ flex: 1, marginRight: "0.5rem" }}
                      />
                      {/* {i > 0 && (
                        <button
                          type="button"
                          onClick={() => removeMember(i)}
                          style={{ width: "80px" }}
                        >
                          Remove
                        </button>
                      )} */}
                    </div>
                  ))}

                  {/* <button
                    type="button"
                    onClick={addMember}
                    style={{ marginTop: "0.5rem" }}
                  >
                    + Add member
                  </button> */}

                  {multisigError && (
                    <p className={styles.inputErrorMsg}>{multisigError}</p>
                  )}

                  <button
                    type="button"
                    onClick={createMultisig}
                    disabled={!multisigValid || multisigLoading || multisigCreated}
                    className={`
                      ${styles.buttonNoBorderWhenDisabled}
                      ${!multisigValid || multisigLoading ? styles.buttonDisabled : ""}
                    `.trim()}
                    style={{ marginTop: "1rem" }}
                  >
                    {multisigLoading
                      ? "Creating…"
                      : multisigCreated
                      ? "Treasury ready"
                      : "Create Treasury"}
                  </button>

                  {!multisigValid && !multisigLoading && !multisigCreated && (
                    <p style={{ color: "#ff6b6b", fontSize: "14px", marginTop: "0.5rem" }}>
                      Fix wallet addresses or threshold to enable.
                    </p>
                  )}
                </>
              )}  

              {/* Step 3: Submit */}
              {currentStep === 3 && (
                <>
                  <h2>Review and Submit</h2>
                  {formData.bannerUrl ? (
                    <img src={formData.bannerUrl} className={styles.bannerPreview} alt="Banner" />
                  ) : (
                    <div className={`${styles.skeleton} ${styles.skeletonImgBanner}`} />
                  )}

                  {formData.avatarUrl ? (
                    <img src={formData.avatarUrl} className={styles.avatarPreview} alt="Avatar" />
                  ) : (
                    <div className={`${styles.skeleton} ${styles.skeletonImgAvatar}`} />
                  )}

                  {formData.name ? <h1 className={styles.profileHeader}>{formData.name}</h1> : <div className={`${styles.skeleton} ${styles.skeletonText}`} />}

                  <div>
                    {formData.username ? <p className={styles.profileContent}>@{formData.username}</p> : <div className={`${styles.skeleton} ${styles.skeletonText}`} />}
                    <p>
                      {publicKey
                        ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
                        : "No wallet"}
                    </p>
                    {formData.bio ? <p className={styles.bioContent}>{formData.bio}</p> : <div className={`${styles.skeleton} ${styles.skeletonText}`} />}
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className={submitting ? styles.buttonDisabled : ""}
                    style={{ marginTop: "2rem" }}
                  >
                    {submitting ? "Submitting…" : "Submit Profile"}
                  </button>
                </>
              )}

              {/* Navigation */}
              <div
                style={{
                  marginTop: "2rem",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                {currentStep > 0 && (
                  <button type="button" onClick={handleBack}>
                    Back
                  </button>
                )}
                {currentStep < 3 && (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!isCurrentStepValid}
                    className={!isCurrentStepValid ? styles.buttonDisabled : ""}
                  >
                    Next
                  </button>
                )}
              </div>
            </div>

            {/* Instructions */}
            {/* <div className={styles.tabContentRight}>
              <h3>Onboarding Steps</h3>
              <p>1. Create Multisig Vault</p>
              <SlArrowDown />
              <p>2. Fill Business Info</p>
              <SlArrowDown />
              <p>3. Upload Images & Preview</p>
              <SlArrowDown />
              <p>4. Submit for Review</p>
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
}
import Head from 'next/head';
import Link from 'next/link';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { useState } from 'react';
import {
  FaShieldAlt,
  FaGem,
  FaHandshake,
  FaCheckCircle,
  FaArrowRight,
  FaEnvelope,
} from 'react-icons/fa';
import { FaXTwitter, FaDiscord } from 'react-icons/fa6';
import { FaTelegram } from 'react-icons/fa';
import toast from 'react-hot-toast';
import styles from '../../styles/VendorApply.module.css';

export default function VendorApply() {
  const { publicKey } = useEffectiveWallet();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: '',
    email: '',
    phone: '',
    message: '',
    contact: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.message.trim()) {
      toast.error('Name and message are required');
      return;
    }
    if (!form.email.trim() && !publicKey) {
      toast.error('Please provide an email or connect your wallet so we can reach you');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/vendor/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey?.toBase58() || null,
          name: form.name.trim(),
          category: form.category || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          message: form.message.trim(),
          contact: form.contact.trim() || null,
        }),
      });
      setSubmitted(true);
      toast.success(
        res.ok ? "Interest submitted! We'll be in touch." : 'Thanks! Reach out on X or Discord.'
      );
    } catch {
      setSubmitted(true);
      toast.success('Thanks! Reach out on X or Discord for faster response.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Become a Vendor | LuxHub</title>
        <meta
          name="description"
          content="Apply to become a verified vendor on LuxHub. Sell authenticated luxury items backed by NFTs on Solana."
        />
      </Head>

      <div className={styles.page}>
        <div className={styles.ambientBg} />

        <main className={styles.main}>
          {/* Hero */}
          <header className={styles.hero}>
            <h1 className={styles.heroTitle}>
              Sell On
              <br />
              <span className={styles.heroAccent}>LuxHub</span>
            </h1>
            <p className={styles.heroSub}>
              Join our curated network of luxury dealers. Every vendor is personally vetted to
              ensure authenticity and trust.
            </p>
          </header>

          {/* Top Grid — Criteria + Steps */}
          <div className={styles.topGrid}>
            {/* What We Look For */}
            <section className={styles.section}>
              <span className={styles.label}>Requirements</span>
              <div className={styles.cardStack}>
                <div className={styles.card}>
                  <div className={styles.cardIcon}>
                    <FaGem />
                  </div>
                  <div>
                    <h3>Authentic Inventory</h3>
                    <p>Genuine luxury items with verifiable provenance and documentation.</p>
                  </div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardIcon}>
                    <FaShieldAlt />
                  </div>
                  <div>
                    <h3>Verified Identity</h3>
                    <p>Established dealers, authorized retailers, and trusted collectors.</p>
                  </div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardIcon}>
                    <FaHandshake />
                  </div>
                  <div>
                    <h3>Quality Commitment</h3>
                    <p>Accurate descriptions, responsive communication, reliable fulfillment.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* How It Works */}
            <section className={styles.section}>
              <span className={styles.label}>Process</span>
              <div className={styles.cardStack}>
                <div className={styles.step}>
                  <span className={styles.stepNum}>1</span>
                  <div>
                    <h3>Reach Out</h3>
                    <p>Contact us via X, Discord, or the form below.</p>
                  </div>
                </div>
                <div className={styles.step}>
                  <span className={styles.stepNum}>2</span>
                  <div>
                    <h3>Get Verified</h3>
                    <p>We review your background and inventory.</p>
                  </div>
                </div>
                <div className={styles.step}>
                  <span className={styles.stepNum}>3</span>
                  <div>
                    <h3>Onboard</h3>
                    <p>Set up your vendor profile and list your first items.</p>
                  </div>
                </div>
                <div className={styles.step}>
                  <span className={styles.stepNum}>4</span>
                  <div>
                    <h3>Start Selling</h3>
                    <p>NFT-backed listings with escrow protection. Get paid in SOL.</p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Bottom Grid — Contact + Form */}
          <div className={styles.bottomGrid}>
            {/* Contact Channels */}
            <section className={styles.section}>
              <span className={styles.label}>Contact</span>
              <div className={styles.contactStack}>
                <a
                  href="https://x.com/LuxHubStudio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.contactCard}
                >
                  <FaXTwitter />
                  <div>
                    <span>@LuxHubStudio</span>
                    <span className={styles.contactHint}>DM us on X</span>
                  </div>
                </a>
                <a
                  href="https://discord.gg/luxhub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.contactCard}
                >
                  <FaDiscord />
                  <div>
                    <span>LuxHub Discord</span>
                    <span className={styles.contactHint}>Join & open a ticket</span>
                  </div>
                </a>
                <a
                  href="https://t.me/luxhub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.contactCard}
                >
                  <FaTelegram />
                  <div>
                    <span>LuxHub Telegram</span>
                    <span className={styles.contactHint}>Message us directly</span>
                  </div>
                </a>
                <a href="mailto:LuxHubMarket@gmail.com" className={styles.contactCard}>
                  <FaEnvelope />
                  <div>
                    <span>LuxHubMarket@gmail.com</span>
                    <span className={styles.contactHint}>Email us</span>
                  </div>
                </a>
              </div>
            </section>

            {/* Interest Form */}
            <section className={styles.section}>
              <span className={styles.label}>Express Interest</span>

              {submitted ? (
                <div className={styles.successCard}>
                  <FaCheckCircle className={styles.successIcon} />
                  <h3>Thanks for your interest!</h3>
                  <p>
                    We've noted your application. DM us on{' '}
                    <a href="https://x.com/LuxHubStudio" target="_blank" rel="noopener noreferrer">
                      X
                    </a>{' '}
                    or join{' '}
                    <a href="https://discord.gg/luxhub" target="_blank" rel="noopener noreferrer">
                      Discord
                    </a>{' '}
                    for faster response.
                  </p>
                </div>
              ) : (
                <form className={styles.form} onSubmit={handleSubmit}>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Name / Business *</label>
                      <input
                        className={styles.formInput}
                        placeholder="e.g. Crown & Caliber"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Category</label>
                      <select
                        className={styles.formInput}
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                      >
                        <option value="">Select...</option>
                        <option value="watches">Watches</option>
                        <option value="jewelry">Jewelry</option>
                        <option value="collectibles">Collectibles</option>
                        <option value="art">Art</option>
                        <option value="mixed">Multiple</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Email {!publicKey ? '*' : ''}</label>
                      <input
                        className={styles.formInput}
                        type="email"
                        placeholder="you@business.com"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        required={!publicKey}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Phone (optional)</label>
                      <input
                        className={styles.formInput}
                        type="tel"
                        placeholder="+1 (555) 000-0000"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Social / Other Contact</label>
                    <input
                      className={styles.formInput}
                      placeholder="X handle, Telegram, Discord, etc."
                      value={form.contact}
                      onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>About your collection *</label>
                    <textarea
                      className={styles.formTextarea}
                      placeholder="What brands do you carry? How long selling? Any links..."
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      rows={4}
                      required
                    />
                  </div>
                  {publicKey ? (
                    <p className={styles.walletNote}>
                      Wallet connected: {publicKey.toBase58().slice(0, 6)}...
                      {publicKey.toBase58().slice(-4)}
                    </p>
                  ) : (
                    <p className={styles.walletNote}>
                      Connect your wallet for faster onboarding (we'll link your invite to it)
                    </p>
                  )}
                  <button type="submit" className={styles.submitBtn} disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit Interest'}{' '}
                    {!submitting && <FaArrowRight />}
                  </button>
                </form>
              )}
            </section>
          </div>
        </main>
      </div>
    </>
  );
}

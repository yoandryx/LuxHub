import Head from 'next/head';
import Link from 'next/link';
import Script from 'next/script';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { useState, useEffect } from 'react';
import {
  FaShieldAlt,
  FaGem,
  FaHandshake,
  FaCheckCircle,
  FaArrowRight,
  FaEnvelope,
} from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import toast from 'react-hot-toast';
import styles from '../../styles/VendorApply.module.css';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

export default function VendorApply() {
  const { publicKey } = useEffectiveWallet();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadedAt] = useState(Date.now());
  const [turnstileToken, setTurnstileToken] = useState('');
  const [form, setForm] = useState({
    name: '',
    category: '',
    email: '',
    phone: '',
    message: '',
    contact: '',
    website: '',
    inventorySize: '',
    // Honeypot — hidden from real users, bots will fill it
    company_url: '',
  });

  // Expose a global callback for Cloudflare Turnstile to call when the user passes verification
  useEffect(() => {
    (window as any).onTurnstileSuccess = (token: string) => setTurnstileToken(token);
    (window as any).onTurnstileExpired = () => setTurnstileToken('');
    return () => {
      delete (window as any).onTurnstileSuccess;
      delete (window as any).onTurnstileExpired;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot check — if filled, silently "succeed" (it's a bot)
    if (form.company_url) {
      setSubmitted(true);
      toast.success("Interest submitted! We'll be in touch.");
      return;
    }

    // Timing check — real humans take at least 8 seconds to fill a form
    if (Date.now() - loadedAt < 8000) {
      setSubmitted(true);
      toast.success("Interest submitted! We'll be in touch.");
      return;
    }

    if (!form.name.trim() || !form.message.trim()) {
      toast.error('Name and message are required');
      return;
    }
    if (!form.email.trim() && !publicKey) {
      toast.error('Please provide an email or connect your wallet so we can reach you');
      return;
    }
    // Turnstile: only enforced when a site key is configured (no-op in dev / before setup)
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error('Please complete the verification challenge below');
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
          website: form.website.trim() || null,
          inventorySize: form.inventorySize || null,
          turnstileToken: turnstileToken || undefined,
          company_url: form.company_url || undefined,
        }),
      });
      setSubmitted(true);
      toast.success(
        res.ok ? "Interest submitted! We'll be in touch." : 'Thanks! Reach out on X or via email.'
      );
    } catch {
      setSubmitted(true);
      toast.success('Thanks! Reach out on X or via email for faster response.');
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
                    <p>Submit the form below or DM us on X. No public sign-up — every dealer is vetted personally.</p>
                  </div>
                </div>
                <div className={styles.step}>
                  <span className={styles.stepNum}>2</span>
                  <div>
                    <h3>Get Verified</h3>
                    <p>We review your background, inventory, and existing storefront before approval.</p>
                  </div>
                </div>
                <div className={styles.step}>
                  <span className={styles.stepNum}>3</span>
                  <div>
                    <h3>Onboard</h3>
                    <p>Approved dealers receive an invite link. We help you set up your profile and list your inventory.</p>
                  </div>
                </div>
                <div className={styles.step}>
                  <span className={styles.stepNum}>4</span>
                  <div>
                    <h3>Start Selling</h3>
                    <p>You keep 97% of every sale, paid in USDC after the buyer confirms delivery. Funds stay in on-chain escrow until then.</p>
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
                <a href="mailto:support@luxhub.gold" className={styles.contactCard}>
                  <FaEnvelope />
                  <div>
                    <span>support@luxhub.gold</span>
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
                    We've noted your application and will be in touch personally. For a faster
                    response, DM us on{' '}
                    <a href="https://x.com/LuxHubStudio" target="_blank" rel="noopener noreferrer">
                      @LuxHubStudio
                    </a>{' '}
                    or email{' '}
                    <a href="mailto:support@luxhub.gold">support@luxhub.gold</a>.
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
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Website / Social Proof</label>
                      <input
                        className={styles.formInput}
                        placeholder="Instagram, eBay store, Chrono24, website..."
                        value={form.website}
                        onChange={(e) => setForm({ ...form, website: e.target.value })}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Inventory Size</label>
                      <select
                        className={styles.formInput}
                        value={form.inventorySize}
                        onChange={(e) => setForm({ ...form, inventorySize: e.target.value })}
                      >
                        <option value="">Select...</option>
                        <option value="1-10">1-10 pieces</option>
                        <option value="11-50">11-50 pieces</option>
                        <option value="51-200">51-200 pieces</option>
                        <option value="200+">200+ pieces</option>
                      </select>
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
                      placeholder="What brands do you carry? How many years selling? Link to your storefront or social..."
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      rows={4}
                      required
                    />
                  </div>
                  {/* Honeypot — invisible to users, bots auto-fill it */}
                  <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}>
                    <label htmlFor="company_url">Company URL</label>
                    <input
                      id="company_url"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.company_url}
                      onChange={(e) => setForm({ ...form, company_url: e.target.value })}
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
                  {/* Cloudflare Turnstile — renders nothing if NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset */}
                  {TURNSTILE_SITE_KEY && (
                    <>
                      <Script
                        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                        async
                        defer
                        strategy="afterInteractive"
                      />
                      <div
                        className="cf-turnstile"
                        data-sitekey={TURNSTILE_SITE_KEY}
                        data-callback="onTurnstileSuccess"
                        data-expired-callback="onTurnstileExpired"
                        data-theme="dark"
                        style={{ marginTop: 4 }}
                      />
                    </>
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

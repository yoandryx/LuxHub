// pages/vendor/pending.tsx
// Shows vendor that their application is pending admin approval
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { FaClock, FaCheckCircle, FaTimesCircle, FaArrowRight } from 'react-icons/fa';
import styles from '../../styles/VendorOnboard.module.css';

type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'not_found' | 'loading';

export default function VendorPending() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [status, setStatus] = useState<ApplicationStatus>('loading');
  const [vendorData, setVendorData] = useState<any>(null);

  useEffect(() => {
    if (!publicKey) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/vendor/profile?wallet=${publicKey.toBase58()}`);
        if (res.ok) {
          const data = await res.json();
          setVendorData(data);
          if (data.approved) {
            setStatus('approved');
          } else if (data.rejected) {
            setStatus('rejected');
          } else {
            setStatus('pending');
          }
        } else {
          setStatus('not_found');
        }
      } catch {
        setStatus('not_found');
      }
    };

    checkStatus();
    // Poll every 30 seconds
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [publicKey]);

  if (!publicKey) {
    return (
      <div className={styles.onboardContainer}>
        <div className={styles.wizardWrapper}>
          <div className={styles.wizardCard}>
            <div className={styles.sectionHeading}>
              <h2>Connect Your Wallet</h2>
            </div>
            <p className={styles.sectionSubtext}>
              Please connect your wallet to check your application status.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.onboardContainer}>
      <div className={styles.wizardWrapper}>
        <div className={styles.wizardCard}>
          {status === 'loading' && (
            <>
              <div className={styles.sectionHeading}>
                <FaClock className={styles.sectionIcon} />
                <h2>Checking Status...</h2>
              </div>
              <p className={styles.sectionSubtext}>Loading your application status...</p>
            </>
          )}

          {status === 'pending' && (
            <>
              <div className={styles.sectionHeading}>
                <FaClock className={styles.sectionIcon} style={{ color: '#f5a623' }} />
                <h2>Application Under Review</h2>
              </div>
              <p className={styles.sectionSubtext}>
                Thank you for applying to become a LuxHub vendor! Our team is reviewing your
                application.
              </p>

              <div
                style={{
                  background: 'rgba(245, 166, 35, 0.1)',
                  border: '1px solid rgba(245, 166, 35, 0.3)',
                  borderRadius: '12px',
                  padding: '20px',
                  marginTop: '24px',
                }}
              >
                <h3 style={{ color: '#f5a623', marginBottom: '12px' }}>What happens next?</h3>
                <ul style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                  <li>Our team will review your profile and business information</li>
                  <li>We may reach out via your provided social links if needed</li>
                  <li>Once approved, your vendor profile will be visible on the marketplace</li>
                  <li>You can then start listing your luxury items as NFTs</li>
                </ul>
              </div>

              {vendorData && (
                <div style={{ marginTop: '24px', color: 'var(--text-secondary)' }}>
                  <p>
                    <strong>Business:</strong> {vendorData.name}
                  </p>
                  <p>
                    <strong>Username:</strong> @{vendorData.username}
                  </p>
                </div>
              )}
            </>
          )}

          {status === 'approved' && (
            <>
              <div className={styles.sectionHeading}>
                <FaCheckCircle className={styles.sectionIcon} style={{ color: '#4ade80' }} />
                <h2>You&apos;re Approved!</h2>
              </div>
              <p className={styles.sectionSubtext}>
                Congratulations! Your vendor application has been approved. You can now access your
                dashboard and start listing items.
              </p>

              <button
                className={styles.nextButton}
                onClick={() => router.push('/vendor/vendorDashboard')}
                style={{ marginTop: '24px' }}
              >
                Go to Dashboard
                <FaArrowRight />
              </button>
            </>
          )}

          {status === 'rejected' && (
            <>
              <div className={styles.sectionHeading}>
                <FaTimesCircle className={styles.sectionIcon} style={{ color: '#ef4444' }} />
                <h2>Application Not Approved</h2>
              </div>
              <p className={styles.sectionSubtext}>
                Unfortunately, your application was not approved at this time. If you believe this
                was in error, please contact our support team.
              </p>
            </>
          )}

          {status === 'not_found' && (
            <>
              <div className={styles.sectionHeading}>
                <h2>No Application Found</h2>
              </div>
              <p className={styles.sectionSubtext}>
                We couldn&apos;t find a vendor application for your wallet. Would you like to apply?
              </p>

              <button
                className={styles.nextButton}
                onClick={() => router.push('/vendor/onboard')}
                style={{ marginTop: '24px' }}
              >
                Apply Now
                <FaArrowRight />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import Link from 'next/link';
import styles from '../../styles/Footer.module.css';
import { FaDiscord, FaGithub, FaTelegram } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { SiSolana } from 'react-icons/si';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        {/* Brand Column */}
        <div className={styles.brandColumn}>
          <div className={styles.brandLogo}>
            <img src="/images/purpleLGG.png" alt="LuxHub" className={styles.logo} />
            <h3 className={styles.brandName}>LUXHUB</h3>
          </div>
          <p className={styles.brandTagline}>
            The premier decentralized marketplace for authenticated luxury timepieces. NFT-backed
            provenance, secure escrow, and fractional ownership on Solana.
          </p>
          <div className={styles.socialIcons}>
            <a
              href="https://x.com/LuxHubdotFun"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Twitter"
            >
              <FaXTwitter />
            </a>
            <a
              href="https://discord.gg/luxhub"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
            >
              <FaDiscord />
            </a>
            <a
              href="https://github.com/yoandryx/luxhub"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <FaGithub />
            </a>
            <a
              href="https://t.me/luxhub"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
            >
              <FaTelegram />
            </a>
          </div>
        </div>

        {/* Marketplace Links */}
        <div className={styles.linkColumn}>
          <h4>Marketplace</h4>
          <Link href="/">Home</Link>
          <Link href="/watchMarket">Browse Watches</Link>
          <Link href="/pools">Fractional Pools</Link>
          <Link href="/learnMore">How It Works</Link>
        </div>

        {/* For Dealers */}
        <div className={styles.linkColumn}>
          <h4>For Dealers</h4>
          <Link href="/sellerDashboard">Become a Dealer</Link>
          <Link href="/vendor/vendorDashboard">Vendor Dashboard</Link>
          <Link href="/learnMore#verification">Verification Process</Link>
        </div>

        {/* Connect */}
        <div className={styles.connectColumn}>
          <h4>Connect</h4>
          <a
            href="https://x.com/LuxHubdotFun"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.emailLink}
          >
            @LuxHubdotFun
          </a>
          <div className={styles.networkBadge}>
            <SiSolana />
            <span>Built on Solana</span>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className={styles.bottomBar}>
        <div className={styles.bottomContent}>
          <p className={styles.copyright}>
            © {new Date().getFullYear()} <span>LuxHub</span>. All rights reserved.
          </p>
          <div className={styles.bottomLinks}>
            <Link href="/learnMore#terms">Terms of Service</Link>
            <Link href="/learnMore#privacy">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

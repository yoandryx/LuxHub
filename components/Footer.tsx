import Link from "next/link";
import styles from "../styles/Footer.module.css";
import { FaTwitter, FaDiscord, FaGithub, FaTelegram, FaGlobe } from "react-icons/fa";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        
        {/* Branding Section */}
        <div className={styles.branding}>
          <p>Managed by</p>
          <img src="/logo.svg" alt="Mercatus Logo" className={styles.logo} />
        </div>

        {/* Social Icons */}
        <div className={styles.socialIcons}>
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer"><FaTwitter /></a>
          <a href="https://discord.com" target="_blank" rel="noopener noreferrer"><FaDiscord /></a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer"><FaGithub /></a>
          <a href="https://telegram.org" target="_blank" rel="noopener noreferrer"><FaTelegram /></a>
        </div>

        {/* Footer Links */}
        <div className={styles.footerLinks}>
          <div>
            <h4>Marketplace</h4>
            <Link href="/">Home</Link>
            <Link href="/listings">Listings</Link>
            <Link href="/create-listing">Create Listing</Link>
            <Link href="/profile">About Us</Link>
            <Link href="/disclaimer">Disclaimer</Link>
            <Link href="/privacy">Privacy Policy</Link>
          </div>
          <div>
            <h4>Get Connected</h4>
            <Link href="/blog">Blog</Link>
            <Link href="/newsletter">Newsletter</Link>
          </div>
        </div>

        {/* Language Selector */}
        <div className={styles.language}>
          <FaGlobe />
          <select>
            <option>EN</option>
            <option>ES</option>
            <option>FR</option>
          </select>
        </div>
      </div>

      {/* Copyright */}
      <p className={styles.copyright}>© {new Date().getFullYear()} Mercatus. All rights reserved.</p>
    </footer>
  );
}

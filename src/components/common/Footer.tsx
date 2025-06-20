import Link from "next/link";
import styles from "../../styles/Footer.module.css";
import { FaDiscord, FaGithub, FaTelegram, FaGlobe } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        
        {/* Branding Section */}
        <div className={styles.branding}>
          <p>LUXHUB</p>
          <img src="/images/purpleLGG.png" alt="Luxhub Logo" className={styles.logo} />
        </div>

        {/* Social Icons */}
        <div className={styles.socialIcons}>
          <a href="https://x.com/LuxHubdotFun" target="_blank" rel="noopener noreferrer"><FaXTwitter/></a>
          <a href="https://discord.com" target="_blank" rel="noopener noreferrer"><FaDiscord /></a>
          <a href="https://github.com/yoandryx/luxhub" target="_blank" rel="noopener noreferrer"><FaGithub /></a>
          <a href="https://telegram.org" target="_blank" rel="noopener noreferrer"><FaTelegram /></a>
        </div>

        {/* Footer Links */}
        <div className={styles.footerLinks}>
          <div>
            <h4>MARKETPLACE</h4>
            <Link href="/">Home</Link>
            <Link href="/watchMarket">Inventory</Link>
            <Link href="/sellerDashboard">Request a Mint</Link>
            <Link href="/learnMore">Learn More</Link>
          </div>
          <div>
            <h4>GET CONNECTED</h4>
            <Link href="https://x.com/LuxHubdotFun" >Contact Us on X</Link>
          </div>
        </div>

        {/* Language Selector */}
        <div className={styles.language}>
          <FaGlobe />
          <select>
            <option>EN</option>
            {/* <option>ES</option> */}
            {/* <option>FR</option> */}
          </select>
        </div>
      </div>

      {/* Copyright */}
      <p className={styles.copyright}>© {new Date().getFullYear()} LuxHub. All rights reserved.</p>
    </footer>
  );
}

import styles from "../styles/Footer.module.css";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <p>&copy; {new Date().getFullYear()} Decentralized Marketplace</p>
        <div className={styles.links}>
          <Link href="/">Home</Link>
          <Link href="/listings">Listings</Link>
          <Link href="/create-listing">Create</Link>
          <Link href="/profile">Profile</Link>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "../styles/ExploreVendors.module.css";
import { FaRegCircleCheck } from "react-icons/fa6";

interface VendorProfile {
  wallet: string;
  name: string;
  username: string;
  bio?: string;
  avatarCid?: string;
  bannerCid?: string;
  avatarUrl?: string;   // ✅ add this
  bannerUrl?: string;  
  verified?: boolean;
}

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/";

const ExploreVendors = () => {
  const [vendors, setVendors] = useState<VendorProfile[]>([]);

  useEffect(() => {
    const fetchVendors = async () => {
      const res = await fetch("/api/vendor/vendorList"); // adjust endpoint if needed
      const data = await res.json();
      setVendors(data.vendors || []);
    };

    fetchVendors();
  }, []);

  return (
    <div className={styles.pageContainer}>
      <h1 className={styles.title}>Explore Vendors</h1>

      <ul className={styles.vendorList}>
        {vendors.map((vendor, idx) => (
          <li key={idx} className={styles.vendorCard}>
            {/* Banner */}
            {vendor.bannerUrl ? (
              <img
                src={vendor.bannerUrl}
                alt="banner"
                className={styles.banner}
              />
            ) : vendor.bannerCid ? (
              <img
                src={`${GATEWAY}${vendor.bannerCid}`}
                alt="banner"
                className={styles.banner}
              />
            ) : null}

            <div className={styles.vendorInfo}>
              {/* Avatar */}
              {vendor.avatarUrl ? (
                <img
                  src={vendor.avatarUrl}
                  alt="avatar"
                  className={styles.avatar}
                />
              ) : vendor.avatarCid ? (
                <img
                  src={`${GATEWAY}${vendor.avatarCid}`}
                  alt="avatar"
                  className={styles.avatar}
                />
              ) : null}

              <div>
                <strong className={styles.nameWrapper}>
                  {vendor.name}
                  {vendor.verified && <FaRegCircleCheck className={styles.verifiedIcon} />}
                </strong>
                {" "}
                — @{vendor.username}
                <div className={styles.wallet}>{vendor.wallet.slice(0,4)}...{vendor.wallet.slice(-4)}</div>
              </div>
            </div>

            <div className={styles.actions}>
              <Link href={`/vendor/${vendor.wallet}`} className={styles.viewLink}>
                View Profile
              </Link>
            </div>
          </li>
        ))}
      </ul>

    </div>
  );
};

export default ExploreVendors;

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
  avatarUrl?: string;
  bannerUrl?: string;
  verified?: boolean;
}

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/";

const ExploreVendors = () => {
  const [approvedVendors, setApprovedVendors] = useState<VendorProfile[]>([]);
  const [verifiedVendors, setVerifiedVendors] = useState<VendorProfile[]>([]);

  useEffect(() => {
    const fetchVendors = async () => {
      const res = await fetch("/api/vendor/vendorList");
      const data = await res.json();
      setApprovedVendors(data.vendors || []);
      setVerifiedVendors(data.verifiedVendors || []);
    };

    fetchVendors();
  }, []);

  const renderVendorCard = (vendor: VendorProfile, idx: number) => (
    <Link key={idx} className={styles.vendorCard} href={`/vendor/${vendor.wallet}`}>
      <strong className={styles.nameWrapper}>
        {vendor.name}
        {vendor.verified && <FaRegCircleCheck className={styles.verifiedIcon} />}
      </strong>
      {vendor.bannerUrl ? (
        <img src={vendor.bannerUrl} alt="banner" className={styles.banner} />
      ) : vendor.bannerCid ? (
        <img src={`${GATEWAY}${vendor.bannerCid}`} alt="banner" className={styles.banner} />
      ) : null}

      <div className={styles.vendorInfo}>
        {vendor.avatarUrl ? (
          <img src={vendor.avatarUrl} alt="avatar" className={styles.avatar} />
        ) : vendor.avatarCid ? (
          <img src={`${GATEWAY}${vendor.avatarCid}`} alt="avatar" className={styles.avatar} />
        ) : null}

        <div>
            @{vendor.username}
          <div className={styles.wallet} onClick={() => navigator.clipboard.writeText(vendor.wallet)}>
            {vendor.wallet.slice(0, 4)}...{vendor.wallet.slice(-4)}
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.viewLink}>
          Visit Profile
        </div>
      </div>
    </Link>
  );

  return (
    <div className={styles.pageContainer}>
      <h1 className={styles.title}>LuxHub Vendors</h1>

      <h2 className={styles.sectionHeading}>Verified Vendors</h2>
      <ul className={styles.vendorList}>
        {verifiedVendors.length === 0 ? (
          <p>No verified vendors yet.</p>
        ) : (
          verifiedVendors.map(renderVendorCard)
        )}
      </ul>

      <h2 className={styles.sectionHeading}>User Profiles</h2>
      <ul className={styles.vendorList}>
        {approvedVendors.length === 0 ? (
          <p>No approved vendors available.</p>
        ) : (
          approvedVendors
            .filter(v => !v.verified) // Avoid duplicate display
            .map(renderVendorCard)
        )}
      </ul>
    </div>
  );
};

export default ExploreVendors;

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

export default function ExploreVendors() {
  const [approvedVendors, setApprovedVendors] = useState<VendorProfile[]>([]);
  const [verifiedVendors, setVerifiedVendors] = useState<VendorProfile[]>([]);

  useEffect(() => {
    fetch("/api/vendor/vendorList")
      .then((res) => res.json())
      .then((data) => {
        setApprovedVendors(data.vendors || []);
        setVerifiedVendors(data.verifiedVendors || []);
      });
  }, []);

  const VendorCard = ({ vendor }: { vendor: VendorProfile }) => (
    <Link href={`/vendor/${vendor.wallet}`} className={styles.vendorCard}>
      {/* Banner */}
      {vendor.bannerUrl || vendor.bannerCid ? (
        <img
          src={vendor.bannerUrl || `${GATEWAY}${vendor.bannerCid}`}
          alt="banner"
          className={styles.banner}
        />
      ) : (
        <div className="h-32 bg-gradient-to-br from-purple-900/50 to-black" />
      )}

      <div className={styles.rowItems}>
        {/* Avatar */}
        {(vendor.avatarUrl || vendor.avatarCid) && (
          <img
            src={vendor.avatarUrl || `${GATEWAY}${vendor.avatarCid}`}
            alt={vendor.name}
            className={styles.avatar}
          />
        )}

        {/* Info */}
        <div className={styles.vendorInfo}>
          <div className={styles.nameWrapper}>
            {vendor.name}
            {vendor.verified && <FaRegCircleCheck className={styles.verifiedIcon} />}
          </div>
          <div className="text-purple-300">@{vendor.username}</div>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.viewLink}>Enter Shop</div>
      </div>
    </Link>
  );

  return (
    <div className={styles.pageContainer}>
      <h1 className={styles.title}>LuxHub Dealers</h1>

      {!!verifiedVendors.length && (
        <>
          <h2 className={styles.sectionHeading}>Verified Dealers</h2>
          <div className={styles.vendorList}>
            {verifiedVendors.map((v) => (
              <VendorCard key={v.wallet} vendor={v} />
            ))}
          </div>
        </>
      )}

      <h2 className={styles.sectionHeading}>
        {verifiedVendors.length ? "All Creators" : "Creators"}
      </h2>
      <div className={styles.vendorList}>
        {approvedVendors
          .filter((v) => !v.verified)
          .map((v) => (
            <VendorCard key={v.wallet} vendor={v} />
          ))}
        {approvedVendors.length === verifiedVendors.length && (
          <p className="col-span-full text-center text-gray-500 py-12">
            Coming soon!
          </p>
        )}
      </div>
    </div>
  );
}
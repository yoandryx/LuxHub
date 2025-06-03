import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { VendorProfile } from "../lib/models/VendorProfile";
// import styles from "../styles/VendorDashboard.module.css";
import styles from "../styles/SellerDashboard.module.css"
import AvatarBannerUploader from "../components/vendor/AvatarBannerUploader";

const VendorDashboard = () => {
  const { publicKey } = useWallet();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<number>(1);

  useEffect(() => {
    if (!publicKey) return;
    fetch(`/api/vendor/profile?wallet=${publicKey.toBase58()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setProfile(data);
          setFormData(data);
        }
      })
      .finally(() => setLoading(false));
  }, [publicKey]);

  const handleUpdate = async () => {
    const res = await fetch("/api/vendor/updateProfile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formData, wallet: publicKey?.toBase58() }),
    });
    const data = await res.json();
    if (data.error) alert(data.error);
    else alert("Profile updated!");
  };

  if (loading) return <p>Loading...</p>;
  if (!publicKey) return <p>Please connect your wallet.</p>;
  if (error) return <p>{error}</p>;
  if (!profile?.approved) return <p>Your vendor profile is pending admin approval.</p>;

  return (
    <div className={styles.dashboardContainer}>
      <h1>Vendor Dashboard</h1>

      {/* Tabs */}
      <div className={styles.tabButtons}>
        <button onClick={() => setActiveTab(1)}>Edit Profile</button>
        <button onClick={() => setActiveTab(2)}>Manage Inventory</button>
        <button onClick={() => setActiveTab(3)}>Offers / Orders</button>
        <button onClick={() => setActiveTab(4)}>Analytics</button>
      </div>

      {/* Tab 1: Edit Profile */}
      {activeTab === 1 && (
        <div className={styles.tabContent}>
          {/* Current Preview */}
          {formData.avatarUrl && (
            <div>
              <p>Current Avatar</p>
              <img
                src={formData.avatarUrl}
                alt="Avatar"
                style={{ width: 100, height: 100, borderRadius: "50%" }}
              />
            </div>
          )}
          {formData.bannerUrl && (
            <div>
              <p>Current Banner</p>
              <img
                src={formData.bannerUrl}
                alt="Banner"
                style={{ width: "100%", maxHeight: 200, objectFit: "cover" }}
              />
            </div>
          )}

          {/* Upload New */}
          <AvatarBannerUploader
            onUploadComplete={(avatarUrl, bannerUrl) => {
              setFormData((prev: any) => ({
                ...prev,
                avatarUrl,
                bannerUrl,
              }));
            }}
          />

          <input
            placeholder="Name"
            value={formData.name || ""}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <input
            placeholder="Username"
            value={formData.username || ""}
            disabled
          />
          <textarea
            placeholder="Bio"
            value={formData.bio || ""}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
          />
          <input
            placeholder="Instagram URL"
            value={formData.socialLinks?.instagram || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                socialLinks: {
                  ...formData.socialLinks,
                  instagram: e.target.value,
                },
              })
            }
          />
          <input
            placeholder="Website URL"
            value={formData.socialLinks?.website || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                socialLinks: {
                  ...formData.socialLinks,
                  website: e.target.value,
                },
              })
            }
          />
          <button onClick={handleUpdate}>Save Changes</button>
        </div>
      )}

      {/* Tab 2: Manage Inventory */}
      {activeTab === 2 && (
        <div className={styles.tabContent}>
          <p>Inventory management coming soon.</p>
        </div>
      )}

      {/* Tab 3: Offers / Orders */}
      {activeTab === 3 && (
        <div className={styles.tabContent}>
          <p>Offer and order tracking will be added here.</p>
        </div>
      )}

      {/* Tab 4: Analytics */}
      {activeTab === 4 && (
        <div className={styles.tabContent}>
          <p>Analytics and sales insights coming soon.</p>
        </div>
      )}
    </div>
  );
};

export default VendorDashboard;

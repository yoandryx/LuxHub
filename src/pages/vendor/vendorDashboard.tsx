import { useEffect, useState } from "react";
import {useRouter} from "next/router";
import { useWallet } from "@solana/wallet-adapter-react";
import { VendorProfile } from "../../lib/models/VendorProfile";
import styles from "../../styles/VendorDashboard.module.css";
import AvatarBannerUploader from "../../components/vendor/AvatarBannerUploader";
import { SlArrowDown, SlArrowRight } from "react-icons/sl";

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const isSocialHandleValid = (handle: string) => /^[a-zA-Z0-9._]{2,30}$/.test(handle);

const cleanHandle = (handle: string) => handle?.replace(/^@/, "").trim();


const VendorDashboard = () => {
  const { publicKey } = useWallet();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<number>(1);
  const router = useRouter();

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
    const cleanedInstagram = formData.socialLinks?.instagram
      ? isValidUrl(formData.socialLinks.instagram)
        ? formData.socialLinks.instagram
        : `https://instagram.com/${cleanHandle(formData.socialLinks.instagram)}`
      : "";

    const cleanedX = formData.socialLinks?.x
      ? isValidUrl(formData.socialLinks.x)
        ? formData.socialLinks.x
        : `https://x.com/${cleanHandle(formData.socialLinks.x)}`
      : "";

    const cleanedWebsite = formData.socialLinks?.website?.trim() || "";
    const finalWebsite = cleanedWebsite && !/^https?:\/\//i.test(cleanedWebsite)
      ? "https://" + cleanedWebsite
      : cleanedWebsite;


    if (!formData.name.trim() || !formData.bio.trim()) {
      alert("Name and bio are required.");
      return;
    }

    const isValidSocialInput = (input: string) =>
      isValidUrl(input) || isSocialHandleValid(cleanHandle(input));

    if (
      (formData.socialLinks?.instagram && !isValidSocialInput(formData.socialLinks.instagram)) ||
      (formData.socialLinks?.x && !isValidSocialInput(formData.socialLinks.x)) ||
      (formData.socialLinks?.website && !isValidUrl(finalWebsite))
    ) {
      alert("Please check your social handles or website URL.");
      return;
    }

    const updatedProfile = {
      ...formData,
      socialLinks: {
        instagram: cleanedInstagram,
        x: cleanedX,
        website: finalWebsite,
      },
      wallet: publicKey?.toBase58(),
    };

    const res = await fetch("/api/vendor/updateProfile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedProfile),
    });

    const data = await res.json();
    if (data.error) alert(data.error);
    else alert("Profile updated!");
  };

  const redirect = async () => {
    router.push("/vendor/",profile?.wallet); // Redirecting to vendors Dashboard
  }

  if (loading) return <p>Loading...</p>;
  if (!publicKey) return <p>Please connect your wallet.</p>;
  if (error) return <p>{error}</p>;
  if (!profile?.approved) return <p>Your vendor profile is pending admin approval.</p>;

  return (
    <div className={styles.dashboardContainer}>
      <h1>Vendor Dashboard</h1>

      {/* Tabs */}
      <div className={styles.tabButtons}>
        <button
          onClick={() => setActiveTab(1)}
          className={activeTab === 1 ? styles.activeTab : ""}
        >
          Edit Profile
        </button>
        <button
          onClick={() => setActiveTab(2)}
          className={activeTab === 2 ? styles.activeTab : ""}
        >
          Manage Inventory
        </button>
        <button
          onClick={() => setActiveTab(3)}
          className={activeTab === 3 ? styles.activeTab : ""}
        >
          Offers / Orders
        </button>
        <button
          onClick={() => setActiveTab(4)}
          className={activeTab === 4 ? styles.setActiveTab : ""}
        >
          Analytics
        </button>
      </div>

      {/* Tab 1: Edit Profile */}
      {activeTab === 1 && (

        <div className={styles.tabContentColumn}>

          <div className={styles.tabContent}>
            <div className={styles.tabContentRow}>
              <div className={styles.tabContentLeft}>
                <AvatarBannerUploader
                  onUploadComplete={(avatarUrl, bannerUrl) => {
                    setFormData((prev: any) => ({
                      ...prev,
                      avatarUrl: avatarUrl || prev.avatarUrl,
                      bannerUrl: bannerUrl || prev.bannerUrl,
                    }));
                  }}
                  onPreviewUpdate={(avatarPreview, bannerPreview) => {
                    setFormData((prev: any) => ({
                      ...prev,
                      avatarUrl: avatarPreview || prev.avatarUrl,
                      bannerUrl: bannerPreview || prev.bannerUrl,
                    }));
                  }}
                />
                <h3>Profile Info Form</h3>
                <p>NAME</p>
                <input
                  placeholder="Name"
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                <p>USERNAME</p>
                <input
                  placeholder="Username"
                  value={formData.username || ""}
                  disabled
                />
                <p>BIO</p>
                <textarea
                  placeholder="Bio"
                  value={formData.bio || ""}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                />
                <p>INSTAGRAM</p>
                <input
                  placeholder="Instagram"
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
                <p>X ACCOUNT</p>
                <input
                  placeholder="X username or full link"
                  value={formData.socialLinks?.x || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      socialLinks: {
                        ...formData.socialLinks,
                        x: e.target.value,
                      },
                    })
                  }
                />
                <p>WEBSITE</p>
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
                <button onClick={handleUpdate}>SAVE</button>
              </div>
              <div className={styles.tabContentRight}>
                <h3>Edit Picture or Banner</h3>
                <p>Select the images for your profile picture and banner.</p>
                <SlArrowDown/>
                <p>When ready click the <strong>SET</strong> button and your images will be updated.</p>
                <SlArrowDown/>
                <p>Proceed with editing profile info or finalize.</p>
                <h3>Edit Profile Info</h3>
                <p>Select a text box in the form and edit your selected profile info</p>
                <SlArrowDown/>
                <p>When Finished click the <strong>SAVE</strong> button and your profile info will be finalized.</p>
              </div>
            </div>
          </div>
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

import { useRouter } from "next/router";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import AvatarBannerUploader from "../../components/vendor/AvatarBannerUploader";
import styles from "../../styles/VendorDashboard.module.css";
import { SlArrowDown } from "react-icons/sl";

const OnboardingForm = () => {
  const router = useRouter();
  const { query } = router;
  const { publicKey } = useWallet();

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    bio: "",
    instagram: "",
    twitter: "",
    website: "",
    avatarUrl: "",
    bannerUrl: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const isFormValid = () => {
    return (
      publicKey &&
      formData.name.trim() &&
      formData.username.trim() &&
      formData.bio.trim() &&
      formData.instagram.trim() &&
      formData.website.trim() &&
      formData.avatarUrl &&
      formData.bannerUrl
    );
  };

  const handleSubmit = async () => {
    if (!isFormValid()) {
      console.log("Please complete all fields and upload both images.");
      setNotification("Please complete all fields and upload both images.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/vendor/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          username: formData.username,
          bio: formData.bio,
          avatarUrl: formData.avatarUrl,
          bannerUrl: formData.bannerUrl,
          wallet: publicKey?.toBase58(),
          inviteCode: query.v,
          socialLinks: {
            instagram: formData.instagram,
            twitter: formData.twitter,
            website: formData.website,
          },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        console.log("Vendor onboarding submitted successfully!");
        setNotification("Vendor onboarding submitted successfully!");
        router.push("/vendor/vendorDashboard"); // Redirecting to vendors Dashboard
      } else {
        alert(data?.error || "Something went wrong.");
        console.log("Something went wrong.");
      }
    } catch (err) {
      console.error("Submission error:", err);
      alert("Failed to submit vendor profile.");
      setNotification("Failed to submit vendor profile.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.dashboardContainer}>
      <h1>Vendor Onboarding</h1>

      {notification && <p>{notification}</p>}

      <div className={styles.tabContentColumn}>
        <div className={styles.tabContent}>
          <h3>Preview</h3>
          {formData.bannerUrl && (
            <img src={formData.bannerUrl} className={styles.bannerPreview} />
          )}
          {formData.avatarUrl && (
            <img src={formData.avatarUrl} className={styles.avatarPreview} />
          )}
          <h1>{formData.name || "Name"}</h1>
          <p>@{formData.username || "username"}</p>
          <p>{formData.bio || "Your brand story..."}</p>
          <div className={styles.previewLabel}>
            <p>
              {publicKey
                ? `${publicKey.toBase58().slice(0, 4)}...${publicKey
                    .toBase58()
                    .slice(-4)}`
                : "No wallet"}
            </p>
            <p>Wallet Address</p>
          </div>
        </div>

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
                  setFormData((prev) => ({
                    ...prev,
                    avatarUrl: avatarPreview,
                    bannerUrl: bannerPreview,
                  }));
                }}
              />
              <h3>Business Info</h3>
              <p>NAME</p>
              <input
                placeholder="Business Name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
              <p>USERNAME</p>
              <input
                placeholder="@username"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
              />
              <p>BIO</p>
              <textarea
                placeholder="Your brand story"
                value={formData.bio}
                onChange={(e) =>
                  setFormData({ ...formData, bio: e.target.value })
                }
              />
              <p>INSTAGRAM</p>
              <input
                placeholder="Instagram handle"
                value={formData.instagram}
                onChange={(e) =>
                  setFormData({ ...formData, instagram: e.target.value })
                }
              />
              <p>TWITTER (optional)</p>
              <input
                placeholder="Twitter handle"
                value={formData.twitter}
                onChange={(e) =>
                  setFormData({ ...formData, twitter: e.target.value })
                }
              />
              <p>WEBSITE</p>
              <input
                placeholder="Website URL"
                value={formData.website}
                onChange={(e) =>
                  setFormData({ ...formData, website: e.target.value })
                }
              />
              <button
                onClick={handleSubmit}
                disabled={!isFormValid() || submitting}
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>

            <div className={styles.tabContentRight}>
              <h3>Instructions</h3>
              <p>Upload your avatar and banner.</p>
              <SlArrowDown />
              <p>
                Then complete your profile info — business name, username, and
                bio.
              </p>
              <SlArrowDown />
              <p>Submit your onboarding form for admin review.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingForm;

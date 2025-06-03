import { useRouter } from "next/router";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import AvatarBannerUploader from "../../components/vendor/AvatarBannerUploader";

const OnboardingForm = () => {
  const { query } = useRouter();
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
      alert("Please complete all fields and upload both images.");
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
        alert("Vendor onboarding submitted successfully!");
      } else {
        alert(data?.error || "Something went wrong.");
      }
    } catch (err) {
      console.error("Submission error:", err);
      alert("Failed to submit vendor profile.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h1>Vendor Onboarding</h1>

      <AvatarBannerUploader
        onUploadComplete={(avatarUrl, bannerUrl) => {
          setFormData((prev) => ({ ...prev, avatarUrl, bannerUrl }));
        }}
      />

      <input
        placeholder="Business Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
      />
      <input
        placeholder="@username"
        value={formData.username}
        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
      />
      <textarea
        placeholder="Bio"
        value={formData.bio}
        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
      />
      <input
        placeholder="Instagram handle (e.g. luxhubofficial)"
        value={formData.instagram}
        onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
      />
      <input
        placeholder="Twitter handle (optional)"
        value={formData.twitter}
        onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
      />
      <input
        placeholder="Website URL"
        value={formData.website}
        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
      />

      <button
        onClick={handleSubmit}
        disabled={!isFormValid() || submitting}
        style={{ marginTop: 20 }}
      >
        {submitting ? "Submitting..." : "Submit"}
      </button>
    </div>
  );
};

export default OnboardingForm;

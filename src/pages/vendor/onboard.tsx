// pages/vendor/onboard.tsx
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import AvatarBannerUploader from "../../components/vendor/AvatarBannerUploader";
import styles from "../../styles/VendorDashboard.module.css";
import { SlArrowDown } from "react-icons/sl";
import { profile } from "console";

const OnboardingForm = () => {
  const router = useRouter();
  const { query } = router;
  const { publicKey } = useWallet();

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    bio: "",
    instagram: "",
    x: "",
    website: "",
    avatarUrl: "",
    bannerUrl: "",
  });

  const [errors, setErrors] = useState({
    name: false,
    username: false,
    bio: false,
    instagram: false,
    x: false,
    website: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);

  const isBlobUrl = (url: string) => url.startsWith("blob:");

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const isSocialHandleValid = (handle: string) => {
    return /^[a-zA-Z0-9._]{2,30}$/.test(handle);
  };

  const isFormValid = () => {
    return (
      publicKey &&
      formData.name.trim() &&
      formData.username.trim() &&
      formData.bio.trim() &&
      formData.avatarUrl &&
      formData.bannerUrl &&
      !isBlobUrl(formData.avatarUrl) &&
      !isBlobUrl(formData.bannerUrl) &&
      Object.values(errors).every((err) => !err)
    );
  };

  const formIsValid = useMemo(() => {
    return (
      publicKey &&
      formData.name.trim() &&
      formData.username.trim() &&
      formData.bio.trim() &&
      formData.avatarUrl &&
      formData.bannerUrl &&
      !isBlobUrl(formData.avatarUrl) &&
      !isBlobUrl(formData.bannerUrl) &&
      Object.values(errors).every((err) => !err)
    );
  }, [formData, errors, publicKey]);

  
  useEffect(() => {
    setErrors((prev) => ({
      ...prev,
      name: !formData.name.trim(),
      username: !formData.username.trim(),
      bio: !formData.bio.trim(),
      instagram:
        formData.instagram.trim() !== "" &&
        !isSocialHandleValid(formData.instagram),
      x:
        formData.x.trim() !== "" &&
        !isSocialHandleValid(formData.x),
      website:
        formData.website.trim() !== "" &&
        !isValidUrl(formData.website),
    }));
  }, [formData]);


  useEffect(() => {
    if (formData.avatarUrl && formData.bannerUrl && formData.name && formData.username) {
      setLoadingPreview(false);
    }
  }, [formData]);

  const handleSubmit = async () => {
    if (!isFormValid()) {
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
            x: formData.x,
            website: formData.website,
          },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setNotification("Vendor onboarding submitted successfully!");
        router.push('/vendor/'+publicKey);
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

  useEffect(() => {
    console.log("formIsValid:", formIsValid);
    console.log("errors:", errors);
    console.log("formData:", formData);
  }, [formIsValid, errors, formData]);


  return (
    <div className={styles.dashboardContainer}>
      <h1>Create Profile</h1>

      {notification && <p>{notification}</p>}

      <div className={styles.tabContentColumn}>
        <div className={styles.tabContent}>
          <h3>Preview</h3>

          {formData.bannerUrl ? (
            <img src={formData.bannerUrl} className={styles.bannerPreview} />
          ) : (
            <div className={`${styles.skeleton} ${styles.skeletonImgBanner}`} />
          )}

          {formData.avatarUrl ? (
            <img src={formData.avatarUrl} className={styles.avatarPreview} />
          ) : (
            <div className={`${styles.skeleton} ${styles.skeletonImgAvatar}`} />
          )}

          {formData.name ? (
            <h1>{formData.name}</h1>
          ) : (
            <div className={`${styles.skeleton} ${styles.skeletonText}`} />
          )}

          {formData.username ? (
            <p>@{formData.username}</p>
          ) : (
            <div className={`${styles.skeleton} ${styles.skeletonText}`} />
          )}

          {formData.bio ? (
            <p>{formData.bio}</p>
          ) : (
            <div className={`${styles.skeleton} ${styles.skeletonText}`} />
          )}

          <div className={styles.previewLabel}>
            <p>
              {publicKey
                ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
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
                  setFormData((prev) => ({
                    ...prev,
                    avatarUrl: avatarUrl !== "" ? avatarUrl : prev.avatarUrl,
                    bannerUrl: bannerUrl !== "" ? bannerUrl : prev.bannerUrl,
                  }));
                }}
                onPreviewUpdate={() => {}}
              />

              <h3>Business Info</h3>

              <p>NAME</p>
              <input
                id="name"
                required
                className={errors.name ? styles.inputError : ""}
                placeholder="Business Name"
                value={formData.name}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({ ...formData, name: value });
                  setErrors((prev) => ({ ...prev, name: !value.trim() }));
                }}
              />

              <p>USERNAME</p>
              <input
                id="username"
                required
                className={errors.username ? styles.inputError : ""}
                placeholder="@username"
                value={formData.username}
                onChange={async (e) => {
                  const value = e.target.value;
                  setFormData({ ...formData, username: value });

                  // Required field check
                  if (!value.trim()) {
                    setErrors((prev) => ({ ...prev, username: true }));
                    return;
                  }

                  // Check with backend if username exists
                  try {
                    const res = await fetch("/api/vendor/checkUsername", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ username: value }),
                    });

                    const data = await res.json();
                    setErrors((prev) => ({ ...prev, username: !data.available }));
                  } catch (error) {
                    console.error("Username check failed:", error);
                    setErrors((prev) => ({ ...prev, username: true }));
                  }
                }}
              />
              {errors.username && formData.username.trim() && (
                <p className={styles.inputErrorMsg}>This username is already taken.</p>
              )}
              <p>BIO</p>
              <textarea
                id="bio"
                required
                className={errors.bio ? styles.inputError : ""}
                placeholder="Your brand story"
                value={formData.bio}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({ ...formData, bio: value });
                  setErrors((prev) => ({ ...prev, bio: !value.trim() }));
                }}
              />

              <p>INSTAGRAM</p>
              <input
                id="instagram"
                // required
                className={errors.instagram ? styles.inputError : ""}
                placeholder="Instagram handle"
                value={formData.instagram}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({ ...formData, instagram: value });
                  setErrors((prev) => ({ ...prev, instagram: !isSocialHandleValid(value) }));
                }}
              />

              <p>X</p>
              <input
                id="x"
                // required
                className={errors.x ? styles.inputError : ""}
                placeholder="x handle"
                value={formData.x}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({ ...formData, x: value });
                  setErrors((prev) => ({ ...prev, x: !isSocialHandleValid(value) }));
                }}
              />

              <p>WEBSITE (optional)</p>
              <input
                id="website"
                // required
                className={errors.website ? styles.inputError : ""}
                placeholder="Website URL"
                value={formData.website}
                onChange={(e) => {
                  let value = e.target.value.trim();
                  if (!/^https?:\/\//i.test(value)) {
                    value = "https://" + value;
                  }
                  setFormData({ ...formData, website: value });
                  setErrors((prev) => ({ ...prev, website: !isValidUrl(value) }));
                }}
              />

              <button
                onClick={handleSubmit}
                disabled={!formIsValid || submitting}
                className={!formIsValid || submitting ? styles.buttonDisabled : ""}
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>

              {!isFormValid() && (
                <p>Please fill out all required fields and upload both images.</p>
              )}
            </div>

            <div className={styles.tabContentRight}>
              <h3>Instructions</h3>
              <p>Upload your avatar and banner.</p>
              <SlArrowDown />
              <p>Then complete your profile info — business name, username, and bio.</p>
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

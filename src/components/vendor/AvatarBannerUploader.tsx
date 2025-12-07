import React, { useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useDropzone } from "react-dropzone";
import styles from "../../styles/VendorDashboard.module.css";
import { IoCloudUploadOutline } from "react-icons/io5";

interface Props {
  onUploadComplete: (avatarUrl: string, bannerUrl: string) => void;
  onPreviewUpdate?: (avatarPreview: string, bannerPreview: string) => void;
}

const AvatarBannerUploader: React.FC<Props> = ({ onUploadComplete, onPreviewUpdate }) => {
  const { publicKey } = useWallet();
  const connectedWallet = publicKey?.toBase58();

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const [uploadErrorAvatar, setUploadErrorAvatar] = useState<string | null>(null);
  const [uploadErrorBanner, setUploadErrorBanner] = useState<string | null>(null);

  const [uploadSuccessAvatar, setUploadSuccessAvatar] = useState(false);
  const [uploadSuccessBanner, setUploadSuccessBanner] = useState(false);

  const uploadToIBM = async (file: File, type: "avatar" | "banner"): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/ibm/uploadImage?wallet=${connectedWallet}&type=${type}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      return data?.url || null;
    } catch (err) {
      console.error("IBM Upload failed", err);
      return null;
    }
  };

  const onAvatarDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file || !avatarInputRef.current) return;

    // ✅ iPhone safety check
    if (!file.name || !file.type) {
      setUploadErrorAvatar("Invalid file. Please try again.");
      return;
    }

    // File size upload limit
    if (file.size > 30 * 1024 * 1024) {
      setUploadErrorAvatar("File too large. Max size is 30MB.");
      return;
    }

    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);
    onPreviewUpdate?.(preview, bannerPreview ?? "");

    setUploadingAvatar(true);
    setUploadErrorAvatar(null);
    setUploadSuccessAvatar(false);

    // ✅ Ensure file has fallback name/type
    const wrappedFile = new File([file], file.name || `avatar-${Date.now()}`, {
      type: file.type || "application/octet-stream",
    });

    const uploadedUrl = await uploadToIBM(wrappedFile, "avatar");
    if (uploadedUrl) {
      setAvatarUrl(uploadedUrl);
      onUploadComplete(uploadedUrl, bannerUrl);
      setUploadSuccessAvatar(true);
    } else {
      setUploadErrorAvatar("Invalid Upload. Try Again");
    }

    setUploadingAvatar(false);
  };


  const onBannerDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file || !bannerInputRef.current) return;

    // ✅ iPhone safety check
    if (!file.name || !file.type) {
      setUploadErrorBanner("Invalid file. Please try again.");
      return;
    }

    // File size upload limit
    if (file.size > 30 * 1024 * 1024) {
      setUploadErrorBanner("File too large. Max size is 30MB.");
      return;
    }

    const preview = URL.createObjectURL(file);
    setBannerPreview(preview);
    onPreviewUpdate?.(avatarPreview ?? "", preview);

    setUploadingBanner(true);
    setUploadErrorBanner(null);
    setUploadSuccessBanner(false);

    // ✅ Ensure file has fallback name/type
    const wrappedFile = new File([file], file.name || `avatar-${Date.now()}`, {
      type: file.type || "application/octet-stream",
    });

    const uploadedUrl = await uploadToIBM(wrappedFile, "banner");
    if (uploadedUrl) {
      setBannerUrl(uploadedUrl);
      onUploadComplete(avatarUrl, uploadedUrl);
      setUploadSuccessBanner(true);
    } else {
      setUploadErrorBanner("Invalid Upload. Try Again");
    }

    setUploadingBanner(false);
  };

  const { getRootProps: getAvatarRootProps, getInputProps: getAvatarInputProps } = useDropzone({
    onDrop: onAvatarDrop,
    accept: { "image/*": [] },
    multiple: false,
  });

  const { getRootProps: getBannerRootProps, getInputProps: getBannerInputProps } = useDropzone({
    onDrop: onBannerDrop,
    accept: { "image/*": [] },
    multiple: false,
  });

  return (
    <div>

      {/* <h1>Click below to insert image or Drag and drop</h1> */}

      <div className={styles.uploadContainer}>
        {/* Avatar Upload */}
        <div {...getAvatarRootProps()} className={styles.dropZoneStyle}>
          <h2>Profile Image</h2>
          <input {...getAvatarInputProps()} />
          <input
            type="file"
            accept="image/*"
            ref={avatarInputRef}
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await onAvatarDrop([file]);
            }}
          />
          <div className={styles.previewWrapper}>
            {uploadSuccessAvatar && <p className={styles.succUpload}>Uploaded</p>}
            {uploadSuccessAvatar && <p className={styles.comment}>Change Here</p>}
            {uploadingAvatar && <p>Uploading...</p>}
            {uploadErrorAvatar && <p>{uploadErrorAvatar}</p>}
            {!avatarPreview ? (
              <div className={styles.cloudUploadSection}>
                <IoCloudUploadOutline size={48} />
                <p>Upload Image</p>
              </div>
            ) : (
              <img
                src={avatarPreview}
                className={styles.previewImageStyle}
                alt="banner preview"
              />
            )}
          </div>
        </div>

        {/* Banner Upload */}
        <div {...getBannerRootProps()} className={styles.dropZoneStyle}>
          <h2>Banner Image</h2>
          <input {...getBannerInputProps()} />
          <input
            type="file"
            accept="image/*"
            ref={bannerInputRef}
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await onBannerDrop([file]);
            }}
          />
          <div className={styles.previewWrapper}>
            {uploadSuccessBanner && <p className={styles.succUpload}>Uploaded </p>}
            {uploadSuccessBanner && <p className={styles.comment}>Change Here</p>}
            {uploadingBanner && <p>Uploading...</p>}
            {uploadErrorBanner && <p style={{ color: "red" }}>{uploadErrorBanner}</p>}
            {!bannerPreview ? (
              <div className={styles.cloudUploadSection}>
                <IoCloudUploadOutline size={48} />
                <p>Upload Image</p>
              </div>
            ) : (
              <img
                src={bannerPreview}
                className={styles.previewImageStyle}
                alt="banner preview"
              />
            )}
          </div>
        </div>
      </div>

      
    </div>
  );
};

// Utility to set input.files from a File object
function createFileList(file: File): FileList {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  return dataTransfer.files;
}

export default AvatarBannerUploader;

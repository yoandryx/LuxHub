import React, { useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useDropzone } from "react-dropzone";
import styles from "../../styles/VendorDashboard.module.css"

interface Props {
  onUploadComplete: (avatarUrl: string, bannerUrl: string) => void;
  onPreviewUpdate?: (avatarPreview: string, bannerPreview: string) => void;
}

const AvatarBannerUploader: React.FC<Props> = ({ onUploadComplete, onPreviewUpdate }) => {
  const { publicKey } = useWallet();
  const connectedWallet = publicKey?.toBase58();

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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

  const handleFiles = async () => {
    if (!avatarInputRef.current?.files?.[0] && !bannerInputRef.current?.files?.[0]) return;
    setUploading(true);

    let avatarUrl = null;
    let bannerUrl = null;

    if (avatarInputRef.current?.files?.[0]) {
      avatarUrl = await uploadToIBM(avatarInputRef.current.files[0], "avatar");
    }

    if (bannerInputRef.current?.files?.[0]) {
      bannerUrl = await uploadToIBM(bannerInputRef.current.files[0], "banner");
    }

    onUploadComplete?.(avatarUrl ?? "", bannerUrl ?? "");
    setUploading(false);
  };

  const onAvatarDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && avatarInputRef.current) {
      const preview = URL.createObjectURL(file);
      setAvatarPreview(preview);
      avatarInputRef.current.files = createFileList(file);
      if (onPreviewUpdate) onPreviewUpdate(preview, bannerPreview ?? "");
    }
  };

  const onBannerDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && bannerInputRef.current) {
      const preview = URL.createObjectURL(file);
      setBannerPreview(preview);
      bannerInputRef.current.files = createFileList(file);
      if (onPreviewUpdate) onPreviewUpdate(avatarPreview ?? "", preview);
    }
  };

  const { getRootProps: getAvatarRootProps, getInputProps: getAvatarInputProps } = useDropzone({
    onDrop: onAvatarDrop,
    accept: { 'image/*': [] },
    multiple: false
  });

  const { getRootProps: getBannerRootProps, getInputProps: getBannerInputProps } = useDropzone({
    onDrop: onBannerDrop,
    accept: { 'image/*': [] },
    multiple: false
  });

  return (
    <div>
      <h3>Upload Profile Images</h3>

      <div {...getAvatarRootProps()} className={styles.dropZoneStyle}>
        <p>Avatar Image</p>
        <input {...getAvatarInputProps()} />
        <input
          type="file"
          accept="image/*"
          ref={avatarInputRef}
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const preview = URL.createObjectURL(file);
              setAvatarPreview(preview);
              if (onPreviewUpdate) onPreviewUpdate(preview, bannerPreview ?? "");
            }
          }}
        />
        {avatarPreview && <img src={avatarPreview} className={styles.previewImageStyle} />}
        {!avatarPreview && <p>Drop or click to select avatar</p>}
      </div>

      <div {...getBannerRootProps()} className={styles.dropZoneStyle}>
        <p>Banner Image</p>
        <input {...getBannerInputProps()} />
        <input
          type="file"
          accept="image/*"
          ref={bannerInputRef}
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const preview = URL.createObjectURL(file);
              setBannerPreview(preview);
              if (onPreviewUpdate) onPreviewUpdate(avatarPreview ?? "", preview);
            }
          }}
        />
        {bannerPreview && <img src={bannerPreview} className={styles.previewImageStyle} />}
        {!bannerPreview && <p>Drop or click to select banner</p>}
      </div>

      <button onClick={handleFiles} disabled={uploading}>
        {uploading ? "Uploading..." : "SET"}
      </button>
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

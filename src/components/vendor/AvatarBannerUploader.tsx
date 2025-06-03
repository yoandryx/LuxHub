import React, { useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface Props {
  onUploadComplete: (avatarUrl: string, bannerUrl: string) => void;
}

const AvatarBannerUploader: React.FC<Props> = ({ onUploadComplete }) => {
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
    if (!avatarInputRef.current?.files?.[0] || !bannerInputRef.current?.files?.[0]) return;
    setUploading(true);

    const avatarUrl = await uploadToIBM(avatarInputRef.current.files[0], "avatar");
    const bannerUrl = await uploadToIBM(bannerInputRef.current.files[0], "banner");

    if (avatarUrl && bannerUrl) {
      setAvatarPreview(avatarUrl);
      setBannerPreview(bannerUrl);
      onUploadComplete(avatarUrl, bannerUrl);
    }

    setUploading(false);
  };

  return (
    <div>
      <h3>Upload Profile Images</h3>

      <div>
        <p>Avatar Image</p>
        <input type="file" accept="image/*" ref={avatarInputRef} />
      </div>

      <div>
        <p>Banner Image</p>
        <input type="file" accept="image/*" ref={bannerInputRef} />
      </div>

      <button onClick={handleFiles} disabled={uploading}>
        {uploading ? "Uploading..." : "Upload to IBM Cloud"}
      </button>

      {avatarPreview && (
        <div>
          <p>Avatar Preview</p>
          <img src={avatarPreview} style={{ width: 100, height: 100, borderRadius: "50%" }} />
        </div>
      )}

      {bannerPreview && (
        <div>
          <p>Banner Preview</p>
          <img src={bannerPreview} style={{ width: "100%", maxHeight: 200, objectFit: "cover" }} />
        </div>
      )}
    </div>
  );
};

export default AvatarBannerUploader;

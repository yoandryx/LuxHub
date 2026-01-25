// src/components/admins/ImageUploader.tsx
import React, { useState, useCallback, useRef } from 'react';
import styles from '../../styles/ImageUploader.module.css';

interface ImageUploaderProps {
  onUploadComplete: (cid: string, uri: string) => void;
  currentCid?: string;
  disabled?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onUploadComplete,
  currentCid,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file (PNG, JPG, GIF, WebP)');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }

      setError(null);
      setIsUploading(true);
      setUploadProgress(10);

      // Create local preview
      const localPreview = URL.createObjectURL(file);
      setPreviewUrl(localPreview);

      try {
        setUploadProgress(30);

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/pinata/imgUpload', {
          method: 'POST',
          body: formData,
        });

        setUploadProgress(80);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const { ipfsHash, uri } = await response.json();
        setUploadProgress(100);

        // Use IPFS URL for preview
        setPreviewUrl(`${gateway}${ipfsHash}`);
        onUploadComplete(ipfsHash, uri);

        // Cleanup local blob URL
        URL.revokeObjectURL(localPreview);
      } catch (err: any) {
        console.error('Upload error:', err);
        setError(err.message || 'Failed to upload image');
        setPreviewUrl(null);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [gateway, onUploadComplete]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && !isUploading) {
        setIsDragging(true);
      }
    },
    [disabled, isUploading]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled || isUploading) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [disabled, isUploading, handleFile]
  );

  const handleClick = () => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const displayPreview = previewUrl || (currentCid ? `${gateway}${currentCid}` : null);

  return (
    <div className={styles.container}>
      <div
        className={`${styles.dropzone} ${isDragging ? styles.dragging : ''} ${disabled ? styles.disabled : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className={styles.hiddenInput}
          disabled={disabled || isUploading}
        />

        {isUploading ? (
          <div className={styles.uploadingState}>
            <div className={styles.spinner} />
            <p>Uploading to IPFS...</p>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
            </div>
            <span className={styles.progressText}>{uploadProgress}%</span>
          </div>
        ) : displayPreview ? (
          <div className={styles.previewContainer}>
            <img src={displayPreview} alt="NFT Preview" className={styles.previewImage} />
            <div className={styles.previewOverlay}>
              <span>Click or drag to replace</span>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.uploadIcon}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className={styles.uploadText}>
              <span className={styles.highlight}>Click to upload</span> or drag and drop
            </p>
            <p className={styles.uploadHint}>PNG, JPG, GIF, WebP up to 10MB</p>
          </div>
        )}
      </div>

      {error && <p className={styles.errorMessage}>{error}</p>}

      {currentCid && !error && (
        <div className={styles.cidDisplay}>
          <span className={styles.cidLabel}>IPFS CID:</span>
          <code className={styles.cidValue}>
            {currentCid.slice(0, 12)}...{currentCid.slice(-8)}
          </code>
        </div>
      )}
    </div>
  );
};

export default ImageUploader;

// src/components/admins/ImageUploader.tsx
import React, { useState, useCallback, useRef } from 'react';
import styles from '../../styles/ImageUploader.module.css';

interface ImageUploaderProps {
  onUploadComplete: (cid: string, uri: string) => void;
  currentCid?: string;
  currentUri?: string; // Full URL (Irys or IPFS)
  disabled?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onUploadComplete,
  currentCid,
  currentUri,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageProvider, setStorageProvider] = useState<string>('');
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
        setUploadProgress(20);

        // Convert file to base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const base64Data = await base64Promise;

        setUploadProgress(40);

        // Upload via server-side storage API (Irys/Pinata based on config)
        console.log('[IMAGE-UPLOAD] Uploading image via storage API...');
        const response = await fetch('/api/storage/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'image',
            data: base64Data,
            name: file.name,
            contentType: file.type,
          }),
        });

        setUploadProgress(80);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const result = await response.json();
        console.log('[IMAGE-UPLOAD] Upload result:', result);
        setUploadProgress(100);

        // Use the gateway URL from the response (Irys or IPFS)
        const imageUri = result.url;
        const imageId = result.irysTxId || result.ipfsHash || '';
        setPreviewUrl(imageUri);
        setStorageProvider(result.provider || 'unknown');

        // Pass both the ID and full URI to parent
        onUploadComplete(imageId, imageUri);

        // Cleanup local blob URL
        URL.revokeObjectURL(localPreview);
      } catch (err: any) {
        console.error('[IMAGE-UPLOAD] Upload error:', err);
        setError(err.message || 'Failed to upload image');
        setPreviewUrl(null);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [onUploadComplete]
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

  const displayPreview =
    previewUrl || currentUri || (currentCid ? `${gateway}${currentCid}` : null);

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
            <p>Uploading to permanent storage...</p>
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
          <span className={styles.cidLabel}>
            {storageProvider === 'irys'
              ? 'Arweave TX:'
              : storageProvider === 'pinata'
                ? 'IPFS CID:'
                : 'Storage ID:'}
          </span>
          <code className={styles.cidValue}>
            {currentCid.slice(0, 12)}...{currentCid.slice(-8)}
          </code>
          {storageProvider && (
            <span className={styles.cidLabel} style={{ marginLeft: '8px', opacity: 0.7 }}>
              ({storageProvider})
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUploader;

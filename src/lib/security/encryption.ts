// src/lib/security/encryption.ts
// AES-256-GCM encryption utility for PII fields
import crypto from 'crypto';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits

// Get encryption key from environment (must be 32 bytes for AES-256)
function getEncryptionKey(): Buffer {
  const key = process.env.PII_ENCRYPTION_KEY;

  if (!key) {
    console.warn(
      '[encryption] PII_ENCRYPTION_KEY not set - using fallback (NOT SECURE FOR PRODUCTION)'
    );
    // Generate a deterministic key from a seed for development
    // NEVER use this in production!
    return crypto.scryptSync('luxhub-dev-key-change-me', 'luxhub-salt', 32);
  }

  // If key is provided as hex string
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }

  // If key is provided as base64
  if (key.length === 44) {
    return Buffer.from(key, 'base64');
  }

  // Derive a proper key from the provided secret
  return crypto.scryptSync(key, 'luxhub-pii-salt', 32);
}

/**
 * Encrypt a string value using AES-256-GCM
 * Returns format: iv:authTag:ciphertext (all base64)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine iv:authTag:ciphertext
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    console.error('[encryption] Encryption failed:', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt a string value encrypted with encrypt()
 * Expects format: iv:authTag:ciphertext (all base64)
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;

  // Check if it looks like encrypted data (has two colons)
  if (!ciphertext.includes(':') || ciphertext.split(':').length !== 3) {
    // Return as-is if not encrypted (for backwards compatibility with existing data)
    return ciphertext;
  }

  try {
    const key = getEncryptionKey();
    const [ivBase64, authTagBase64, encryptedData] = ciphertext.split(':');

    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[encryption] Decryption failed:', error);
    // Return original value if decryption fails (might be unencrypted legacy data)
    return ciphertext;
  }
}

/**
 * Check if a value is encrypted (has the expected format)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/**
 * Encrypt multiple fields in an object
 * @param obj - The object containing fields to encrypt
 * @param fields - Array of field names to encrypt
 * @returns New object with specified fields encrypted
 */
export function encryptFields<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
  const result = { ...obj };

  for (const field of fields) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = encrypt(result[field]) as T[keyof T];
    }
  }

  return result;
}

/**
 * Decrypt multiple fields in an object
 * @param obj - The object containing encrypted fields
 * @param fields - Array of field names to decrypt
 * @returns New object with specified fields decrypted
 */
export function decryptFields<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
  const result = { ...obj };

  for (const field of fields) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = decrypt(result[field]) as T[keyof T];
    }
  }

  return result;
}

/**
 * Generate a secure encryption key (for initial setup)
 * Run this once and store the output in PII_ENCRYPTION_KEY
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a value (one-way, for lookups without decryption)
 * Use this for creating searchable indexes on encrypted data
 */
export function hashForIndex(value: string): string {
  if (!value) return '';
  const salt = process.env.PII_HASH_SALT || 'luxhub-hash-salt';
  return crypto.createHmac('sha256', salt).update(value.toLowerCase().trim()).digest('hex');
}

// PII field names that should be encrypted
export const PII_FIELDS = [
  'fullName',
  'street1',
  'street2',
  'phone',
  'email',
  'deliveryInstructions',
] as const;

export type PIIField = (typeof PII_FIELDS)[number];

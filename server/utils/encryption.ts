import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

/**
 * Generate a cryptographically secure random token
 * @param length - Length in bytes (default: 32 bytes = 64 hex characters)
 * @returns Hex-encoded random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Encrypt a TipLink URL using AES-256-CBC
 * @param url - The TipLink URL to encrypt
 * @param secretKey - The encryption key (must be at least 32 characters)
 * @returns Encrypted string in format: iv:encryptedData (both hex-encoded)
 */
export function encryptTipLink(url: string, secretKey: string): string {
  if (!secretKey || secretKey.length < 32) {
    throw new Error('Encryption key must be at least 32 characters long');
  }

  // Derive a 32-byte key from the secret using scrypt
  const key = crypto.scryptSync(secretKey, 'salt', 32);
  
  // Generate a random IV for each encryption
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt the URL
  let encrypted = cipher.update(url, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return IV and encrypted data as hex strings, separated by colon
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt a TipLink URL that was encrypted with encryptTipLink
 * @param encryptedData - The encrypted string in format: iv:encryptedData
 * @param secretKey - The encryption key (must match the one used for encryption)
 * @returns Decrypted TipLink URL
 */
export function decryptTipLink(encryptedData: string, secretKey: string): string {
  if (!secretKey || secretKey.length < 32) {
    throw new Error('Encryption key must be at least 32 characters long');
  }

  try {
    // Split IV and encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    
    // Derive the same 32-byte key from the secret
    const key = crypto.scryptSync(secretKey, 'salt', 32);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    // Decrypt
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Failed to decrypt TipLink: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}




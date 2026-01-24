import CryptoJS from "crypto-js";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY must be set");
if (ENCRYPTION_KEY.length < 32) {
  throw new Error("ENCRYPTION_KEY must be at least 32 characters");
}

/**
 * Encrypt sensitive data (refresh tokens) at rest
 * Uses AES-256 with random IV for each encryption
 */
export function encrypt(text: string): string {
  const key = CryptoJS.enc.Utf8.parse(ENCRYPTION_KEY!);
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(text, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  // Return IV + encrypted data (colon separated for easy parsing)
  return iv.toString(CryptoJS.enc.Base64) + ":" + encrypted.toString();
}

/**
 * Decrypt sensitive data
 * @throws Error if decryption fails
 */
export function decrypt(ciphertext: string): string {
  try {
    // Split IV and encrypted data
    const parts = ciphertext.split(":");
    if (parts.length !== 2) {
      throw new Error("Invalid ciphertext format");
    }

    const iv = CryptoJS.enc.Base64.parse(parts[0]);
    const encrypted = parts[1];

    const key = CryptoJS.enc.Utf8.parse(ENCRYPTION_KEY!);
    const bytes = CryptoJS.AES.decrypt(encrypted, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) {
      throw new Error("Decryption failed - invalid ciphertext");
    }
    return decrypted;
  } catch (error) {
    throw new Error("Failed to decrypt data");
  }
}

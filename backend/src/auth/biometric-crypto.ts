/**
 * Portable AES-256-GCM encryption for BiometricTemplate.embeddingEncrypted.
 *
 * DPAPI (used by the old local-only face-detection project) only decrypts on
 * one specific Windows account, on one specific machine - incompatible with
 * "any PC, any time" and impossible to use at all from this backend's Linux
 * container. This uses Node's built-in crypto instead, keyed by a single
 * server-side secret (BIOMETRIC_ENCRYPTION_KEY) so any instance of this
 * backend, anywhere, can decrypt what any other instance encrypted.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function deriveKey(secret: string): Buffer {
  // Accepts any length/passphrase-style secret and turns it into exactly
  // 32 bytes for AES-256, rather than requiring the operator to supply
  // precisely-sized key material.
  return createHash('sha256').update(secret).digest();
}

export function encryptEmbedding(embedding: number[], secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(embedding), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv (12) + tag (16) + ciphertext, base64 - one self-contained string to
  // store in the single embeddingEncrypted column.
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptEmbedding(encrypted: string, secret: string): number[] {
  const key = deriveKey(secret);
  const raw = Buffer.from(encrypted, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

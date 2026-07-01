// AES-256-GCM encryption for documents + the credential vault (DESIGN.md §6).
// Key is derived from APP_ENCRYPTION_KEY via scrypt. Losing that key makes all
// ciphertext unrecoverable — back it up. NODE-ONLY (uses node:crypto).

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { env } from './env';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // GCM standard nonce length
const TAG_LEN = 16;
// Fixed app salt: the master key is a single shared secret, not per-record.
const KEY_SALT = 'desgro-nurse-cockpit::v1';

let cachedKey: Buffer | null = null;
function masterKey(): Buffer {
  if (!cachedKey) cachedKey = scryptSync(env.APP_ENCRYPTION_KEY, KEY_SALT, 32);
  return cachedKey;
}

/** Encrypt a buffer → self-describing blob: [iv(12) | tag(16) | ciphertext]. */
export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

/** Inverse of {@link encryptBuffer}. Throws if the blob is tampered/wrong key. */
export function decryptBuffer(blob: Buffer): Buffer {
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export function encryptString(plain: string): string {
  return encryptBuffer(Buffer.from(plain, 'utf8')).toString('base64');
}

export function decryptString(b64: string): string {
  return decryptBuffer(Buffer.from(b64, 'base64')).toString('utf8');
}

export function sha256(data: Buffer | string): string {
  return createHash('sha256')
    .update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data)
    .digest('hex');
}

/** Constant-time string comparison (operator password check). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

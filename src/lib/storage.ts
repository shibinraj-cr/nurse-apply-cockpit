// Encrypted-at-rest blob store for documents (DESIGN.md §6). Plaintext never
// touches disk: every blob is AES-256-GCM ciphertext. Metadata lives in the DB
// (DocumentVersion); this module owns the opaque blobRef <-> ciphertext mapping.
// NODE-ONLY.

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { encryptBuffer, decryptBuffer, sha256 } from './crypto';

const ROOT = path.resolve(process.cwd(), 'storage', 'docs');

function ensureRoot() {
  mkdirSync(ROOT, { recursive: true });
}

function refToPath(ref: string): string {
  // Guard against path traversal — refs are uuids we mint.
  const safe = ref.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(ROOT, `${safe}.enc`);
}

export interface StoredBlob {
  blobRef: string;
  sha256: string;
  sizeBytes: number;
}

/** Encrypt + persist a plaintext buffer. Returns the opaque ref + plaintext hash. */
export function putBlob(plain: Buffer): StoredBlob {
  ensureRoot();
  const ref = randomUUID();
  const enc = encryptBuffer(plain);
  writeFileSync(refToPath(ref), enc);
  return { blobRef: ref, sha256: sha256(plain), sizeBytes: plain.length };
}

/** Read + decrypt a blob by ref. Throws if missing or tampered. */
export function getBlob(ref: string): Buffer {
  const p = refToPath(ref);
  if (!existsSync(p)) throw new Error(`blob not found: ${ref}`);
  return decryptBuffer(readFileSync(p));
}

export function deleteBlob(ref: string): void {
  const p = refToPath(ref);
  if (existsSync(p)) rmSync(p);
}

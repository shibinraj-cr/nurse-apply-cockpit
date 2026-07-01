// Encrypted-at-rest blob store for documents (DESIGN.md §6). Plaintext never
// touches disk or DB: every blob is AES-256-GCM ciphertext stored in the Blob
// table (Vercel's serverless filesystem is ephemeral, so no local files). The
// opaque blobRef is the Blob row id. NODE-ONLY.

import { encryptBuffer, decryptBuffer, sha256 } from './crypto';
import { prisma } from './db';

export interface StoredBlob {
  blobRef: string;
  sha256: string;
  sizeBytes: number;
}

/** Encrypt + persist a plaintext buffer. Returns the opaque ref + plaintext hash. */
export async function putBlob(plain: Buffer): Promise<StoredBlob> {
  const enc = encryptBuffer(plain);
  const row = await prisma.blob.create({ data: { data: new Uint8Array(enc) } });
  return { blobRef: row.id, sha256: sha256(plain), sizeBytes: plain.length };
}

/** Read + decrypt a blob by ref. Throws if missing or tampered. */
export async function getBlob(ref: string): Promise<Buffer> {
  const row = await prisma.blob.findUnique({ where: { id: ref } });
  if (!row) throw new Error(`blob not found: ${ref}`);
  return decryptBuffer(Buffer.from(row.data));
}

export async function deleteBlob(ref: string): Promise<void> {
  await prisma.blob.deleteMany({ where: { id: ref } });
}

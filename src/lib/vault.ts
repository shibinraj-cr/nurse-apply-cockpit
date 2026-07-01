// Zero-knowledge-pattern credential vault (DESIGN.md §1/§6). Secrets are stored
// only as ciphertext; the DB holds an opaque `vaultRef`, never plaintext. Every
// fetch is just-in-time and writes an immutable VaultAccessEvent. NODE-ONLY.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { encryptString, decryptString } from './crypto';
import { prisma } from './db';

const ROOT = path.resolve(process.cwd(), 'storage', 'vault');

export interface PortalSecret {
  username: string;
  password: string;
  notes?: string;
}

function ensureRoot() {
  mkdirSync(ROOT, { recursive: true });
}
function refToPath(ref: string): string {
  const safe = ref.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(ROOT, `${safe}.vault`);
}

/** Encrypt + store a secret. Returns an opaque vaultRef to persist in the DB. */
export function putSecret(secret: PortalSecret): string {
  ensureRoot();
  const ref = randomUUID();
  writeFileSync(refToPath(ref), encryptString(JSON.stringify(secret)));
  return ref;
}

/** Low-level decrypt by ref. Prefer {@link accessSecretJIT} which also audits. */
export function readSecret(ref: string): PortalSecret {
  const p = refToPath(ref);
  if (!existsSync(p)) throw new Error(`vault ref not found: ${ref}`);
  return JSON.parse(decryptString(readFileSync(p, 'utf8'))) as PortalSecret;
}

/**
 * Just-in-time credential fetch. Logs a VaultAccessEvent (immutable access log)
 * and returns the secret + the event id (to attach to an Application).
 */
export async function accessSecretJIT(opts: {
  portalAccountId: string;
  candidateId: string;
  actor: string;
  reason: string;
}): Promise<{ secret: PortalSecret; eventId: string }> {
  const account = await prisma.portalAccount.findUnique({
    where: { id: opts.portalAccountId },
    include: { credential: true },
  });
  if (!account?.credential) throw new Error('no credential for portal account');

  // Hard stop: the credential must belong to the candidate we think it does.
  if (account.candidateId !== opts.candidateId) {
    throw new Error(
      'WRONG-ACCOUNT GUARD: credential candidate mismatch — refusing to release secret',
    );
  }

  const secret = readSecret(account.credential.vaultRef);
  const event = await prisma.vaultAccessEvent.create({
    data: {
      portalAccountId: opts.portalAccountId,
      candidateId: opts.candidateId,
      actor: opts.actor,
      reason: opts.reason,
    },
  });
  return { secret, eventId: event.id };
}

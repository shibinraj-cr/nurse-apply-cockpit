// Zero-knowledge-pattern credential vault (DESIGN.md §1/§6). Secrets are stored
// only as ciphertext in the VaultSecret table; the DB holds an opaque `vaultRef`
// (the row id), never plaintext. Every fetch is just-in-time and writes an
// immutable VaultAccessEvent. NODE-ONLY.

import { encryptString, decryptString } from './crypto';
import { prisma } from './db';

export interface PortalSecret {
  username: string;
  password: string;
  notes?: string;
}

/** Encrypt + store a secret. Returns an opaque vaultRef to persist in the DB. */
export async function putSecret(secret: PortalSecret): Promise<string> {
  const row = await prisma.vaultSecret.create({
    data: { data: encryptString(JSON.stringify(secret)) },
  });
  return row.id;
}

/** Low-level decrypt by ref. Prefer {@link accessSecretJIT} which also audits. */
export async function readSecret(ref: string): Promise<PortalSecret> {
  const row = await prisma.vaultSecret.findUnique({ where: { id: ref } });
  if (!row) throw new Error(`vault ref not found: ${ref}`);
  return JSON.parse(decryptString(row.data)) as PortalSecret;
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

  const secret = await readSecret(account.credential.vaultRef);
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

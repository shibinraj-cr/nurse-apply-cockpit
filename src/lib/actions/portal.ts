'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { putSecret } from '@/lib/vault';
import { appendAudit } from '@/lib/audit';

/**
 * Create a portal account + vaulted credential. The password is encrypted into
 * the vault; only an opaque vaultRef is stored in the DB. A unique isolated
 * browser profile id is minted to bind this candidate ↔ profile.
 */
export async function createPortalAccount(formData: FormData) {
  const candidateId = String(formData.get('candidateId') ?? '');
  const portal = String(formData.get('portal') ?? '').trim();
  if (!candidateId || !portal) throw new Error('candidateId and portal required');

  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const tenantUrl = String(formData.get('tenantUrl') ?? '').trim() || null;

  const account = await prisma.portalAccount.create({
    data: {
      candidateId,
      portal,
      tenantUrl,
      username: username || null,
      provisioningState: String(formData.get('provisioningState') ?? 'created'),
      browserProfileId: `profile-${candidateId.slice(0, 6)}-${portal}-${randomUUID().slice(0, 6)}`,
      mfaNotes: String(formData.get('mfaNotes') ?? '').trim() || null,
    },
  });

  if (username && password) {
    const vaultRef = await putSecret({ username, password });
    await prisma.credential.create({ data: { portalAccountId: account.id, vaultRef } });
  }

  await appendAudit({
    actor: 'operator',
    action: 'portal.create_account',
    candidateId,
    entityRef: `portalAccount:${account.id}`,
    after: { portal, hasCredential: !!(username && password) },
  });
  revalidatePath(`/candidates/${candidateId}`);
}

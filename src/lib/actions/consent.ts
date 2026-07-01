'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { appendAudit } from '@/lib/audit';

export async function createConsent(formData: FormData) {
  const candidateId = String(formData.get('candidateId') ?? '');
  const scope = String(formData.get('scope') ?? '');
  if (!candidateId || !scope) throw new Error('candidateId and scope required');

  const expiryRaw = String(formData.get('expiry') ?? '').trim();
  const consent = await prisma.consentRecord.create({
    data: {
      candidateId,
      scope,
      employer: String(formData.get('employer') ?? '').trim() || null,
      evidenceRef: String(formData.get('evidenceRef') ?? '').trim() || null,
      expiry: expiryRaw ? new Date(expiryRaw) : null,
    },
  });
  await appendAudit({
    actor: 'operator',
    action: 'consent.create',
    candidateId,
    entityRef: `consent:${consent.id}`,
    after: { scope, employer: consent.employer },
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath('/consent');
}

/**
 * Day-one revocation (DESIGN.md §6 APP 11): revoke → halt new apps. Revoking
 * apply_on_behalf also withdraws all not-yet-submitted applications.
 */
export async function revokeConsent(id: string, candidateId: string) {
  const consent = await prisma.consentRecord.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  let withdrawn = 0;
  if (consent.scope === 'apply_on_behalf') {
    const res = await prisma.application.updateMany({
      where: {
        candidateId,
        status: { in: ['queued', 'drafting', 'ready_for_review', 'needs_manual'] },
      },
      data: { status: 'withdrawn' },
    });
    withdrawn = res.count;
  }

  await appendAudit({
    actor: 'operator',
    action: 'consent.revoke',
    candidateId,
    entityRef: `consent:${id}`,
    after: { scope: consent.scope, applicationsWithdrawn: withdrawn },
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath('/consent');
  revalidatePath('/applications');
}

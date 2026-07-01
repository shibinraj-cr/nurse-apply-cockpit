'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { setActiveCandidateId } from '@/lib/session';
import { appendAudit } from '@/lib/audit';

/** Set the active candidate — the single source of truth for the whole cockpit. */
export async function switchCandidate(id: string) {
  const c = await prisma.candidate.findUnique({ where: { id } });
  if (!c) throw new Error('candidate not found');
  await setActiveCandidateId(id);
  await appendAudit({ actor: 'operator', action: 'candidate.switch', candidateId: id });
  revalidatePath('/', 'layout');
}

export async function clearActiveCandidate() {
  await setActiveCandidateId(null);
  revalidatePath('/', 'layout');
}

export async function createCandidate(formData: FormData) {
  const displayName = String(formData.get('displayName') ?? '').trim();
  if (!displayName) redirect('/candidates?error=name');

  const candidate = await prisma.candidate.create({
    data: {
      displayName,
      status: 'onboarding',
      notes: String(formData.get('notes') ?? '').trim() || null,
      profile: { create: {} },
      registrationState: { create: {} },
    },
  });
  await appendAudit({
    actor: 'operator',
    action: 'candidate.create',
    candidateId: candidate.id,
    after: { displayName },
  });
  redirect(`/candidates/${candidate.id}`);
}

export async function updateCandidateStatus(id: string, status: string) {
  const before = await prisma.candidate.findUnique({ where: { id }, select: { status: true } });
  await prisma.candidate.update({ where: { id }, data: { status } });
  await appendAudit({
    actor: 'operator',
    action: 'candidate.status',
    candidateId: id,
    before,
    after: { status },
  });
  revalidatePath(`/candidates/${id}`);
  revalidatePath('/candidates');
}

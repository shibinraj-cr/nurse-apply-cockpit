'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { appendAudit } from '@/lib/audit';
import { toJson } from '@/lib/utils';

function splitList(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateProfileFields(formData: FormData) {
  const candidateId = String(formData.get('candidateId') ?? '');
  if (!candidateId) throw new Error('candidateId required');

  const data = {
    specialties: toJson(splitList(formData.get('specialties'))),
    locations: toJson(splitList(formData.get('locations'))),
    yearsExp: Math.max(0, parseInt(String(formData.get('yearsExp') ?? '0'), 10) || 0),
    workRights: String(formData.get('workRights') ?? 'unknown'),
    visaSubclass: String(formData.get('visaSubclass') ?? '').trim() || null,
    selfCheckStream: String(formData.get('selfCheckStream') ?? '').trim() || null,
    pathway: String(formData.get('pathway') ?? 'unknown'),
  };

  await prisma.profile.upsert({
    where: { candidateId },
    create: { candidateId, ...data },
    update: data,
  });
  await appendAudit({
    actor: 'operator',
    action: 'profile.update',
    candidateId,
    after: { workRights: data.workRights, pathway: data.pathway },
  });
  revalidatePath(`/candidates/${candidateId}`);
}

export async function updateMasterCv(candidateId: string, text: string) {
  await prisma.profile.upsert({
    where: { candidateId },
    create: { candidateId, masterCvText: text },
    update: { masterCvText: text },
  });
  await appendAudit({ actor: 'operator', action: 'profile.master_cv', candidateId });
  revalidatePath(`/candidates/${candidateId}`);
}

/** Lock the AHPRA registration number as a VERIFIED fact (never AI-writable). */
export async function confirmAhpra(formData: FormData) {
  const candidateId = String(formData.get('candidateId') ?? '');
  const ahpraRegNo = String(formData.get('ahpraRegNo') ?? '').trim();
  if (!candidateId || !ahpraRegNo) throw new Error('candidateId and ahpraRegNo required');

  await prisma.profile.upsert({
    where: { candidateId },
    create: { candidateId, ahpraRegNo, ahpraVerified: true },
    update: { ahpraRegNo, ahpraVerified: true },
  });
  await appendAudit({
    actor: 'operator',
    action: 'profile.ahpra_verified',
    candidateId,
    after: { ahpraRegNo },
  });
  revalidatePath(`/candidates/${candidateId}`);
}

export async function updateRegistration(formData: FormData) {
  const candidateId = String(formData.get('candidateId') ?? '');
  if (!candidateId) throw new Error('candidateId required');

  const expiryRaw = String(formData.get('expiry') ?? '').trim();
  const data = {
    status: String(formData.get('status') ?? 'self_check'),
    division: String(formData.get('division') ?? 'unknown'),
    endorsements: toJson(splitList(formData.get('endorsements'))),
    conditions: toJson(splitList(formData.get('conditions'))),
    expiry: expiryRaw ? new Date(expiryRaw) : null,
  };

  await prisma.registrationState.upsert({
    where: { candidateId },
    create: { candidateId, ...data },
    update: data,
  });
  await appendAudit({
    actor: 'operator',
    action: 'registration.update',
    candidateId,
    after: { status: data.status, division: data.division },
  });
  revalidatePath(`/candidates/${candidateId}`);
}

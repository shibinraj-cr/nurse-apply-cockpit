'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { appendAudit } from '@/lib/audit';
import { registrationOk } from '@/lib/queries';
import { getActiveCandidateId } from '@/lib/session';
import { toJson } from '@/lib/utils';

/** Queue an application for the active candidate against a job. */
export async function createApplicationForActive(jobId: string, candidateId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('job not found');
  const portal = job.source;

  try {
    const app = await prisma.application.create({
      data: { candidateId, jobId, portal, status: 'drafting' },
    });
    await appendAudit({
      actor: 'operator',
      action: 'application.create',
      candidateId,
      entityRef: `application:${app.id}`,
      after: { jobId, portal },
    });
    revalidatePath('/applications');
    redirect(`/applications/${app.id}`);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await prisma.application.findFirst({ where: { candidateId, jobId, portal } });
      if (existing) redirect(`/applications/${existing.id}`);
    }
    throw e;
  }
}

/** Persist operator edits to the tailored résumé / cover letter. */
export async function saveTailored(applicationId: string, resume: string, coverLetter: string) {
  const app = await prisma.application.update({
    where: { id: applicationId },
    data: { tailoredResume: resume, tailoredCoverLetter: coverLetter },
    select: { candidateId: true },
  });
  await appendAudit({
    actor: 'operator',
    action: 'tailoring.edit',
    candidateId: app.candidateId,
    entityRef: `application:${applicationId}`,
  });
  revalidatePath(`/applications/${applicationId}`);
}

export async function updateApplicationStatus(id: string, status: string) {
  const app = await prisma.application.findUnique({ where: { id }, select: { status: true, candidateId: true } });
  if (!app) throw new Error('application not found');
  await prisma.application.update({ where: { id }, data: { status } });
  await appendAudit({
    actor: 'operator',
    action: 'application.status',
    candidateId: app.candidateId,
    entityRef: `application:${id}`,
    before: { status: app.status },
    after: { status },
  });
  revalidatePath(`/applications/${id}`);
  revalidatePath('/applications');
}

export async function scheduleFollowUp(formData: FormData) {
  const id = String(formData.get('applicationId') ?? '');
  const when = String(formData.get('followUpAt') ?? '').trim();
  if (!id) throw new Error('applicationId required');
  await prisma.application.update({
    where: { id },
    data: { followUpAt: when ? new Date(when) : null },
  });
  revalidatePath(`/applications/${id}`);
}

/**
 * Human attestation + submit (DESIGN.md §4 step 5 / §1 pre-submit identity check).
 * Gated on: current registration, an active apply_on_behalf consent, and the
 * operator's truthfulness confirmation. Freezes + hashes attached doc versions.
 * NEVER auto-submits — this records the human's attestation.
 */
export async function attestAndSubmit(formData: FormData) {
  const id = String(formData.get('applicationId') ?? '');
  const reviewerId = String(formData.get('reviewerName') ?? '').trim();
  const attestationText = String(formData.get('attestationText') ?? '').trim();
  const confirmed = formData.get('confirmTruth') === 'on';
  if (!id) throw new Error('applicationId required');

  const app = await prisma.application.findUnique({
    where: { id },
    include: {
      candidate: {
        include: {
          registrationState: true,
          consentRecords: true,
          documents: { include: { versions: true } },
        },
      },
    },
  });
  if (!app) throw new Error('application not found');

  const fail = (reason: string) => redirect(`/applications/${id}?error=${encodeURIComponent(reason)}`);

  // Wrong-account HARD STOP (DESIGN §1): never submit A's app while B is the
  // active candidate — that is a notifiable privacy breach. Authoritative on the
  // server; the UI guard is advisory only.
  const activeId = await getActiveCandidateId();
  if (activeId !== app.candidateId) {
    fail('Active candidate does not match this application — switch to this candidate before submitting.');
  }

  if (!confirmed) fail('You must confirm the truthfulness attestation.');
  if (!reviewerId) fail('Reviewer name is required.');
  if (!registrationOk(app.candidate.registrationState)) {
    fail('Registration is not current — applications are gated until registered.');
  }

  const now = Date.now();
  const consent = app.candidate.consentRecords.find(
    (c) =>
      c.scope === 'apply_on_behalf' &&
      !c.revokedAt &&
      (!c.expiry || c.expiry.getTime() > now),
  );
  if (!consent) fail('No current apply-on-behalf consent on file for this candidate.');

  // Freeze + hash the current document versions attached at submit time.
  const frozen = app.candidate.documents
    .flatMap((d) => d.versions.filter((v) => v.isCurrent))
    .map((v) => ({ documentVersionId: v.id, sha256: v.sha256, filename: v.filename }));

  await prisma.application.update({
    where: { id },
    data: {
      status: 'submitted',
      reviewerId,
      attestationText,
      attestationTs: new Date(),
      submittedAt: new Date(),
      consentRecordId: consent!.id,
      docVersionsAttached: toJson(frozen),
    },
  });

  await appendAudit({
    actor: reviewerId,
    action: 'application.attest_submit',
    candidateId: app.candidateId,
    entityRef: `application:${id}`,
    after: {
      consentRecordId: consent!.id,
      docVersionsAttached: frozen,
      attestationText,
    },
  });

  revalidatePath(`/applications/${id}`);
  revalidatePath('/applications');
  redirect(`/applications/${id}?submitted=1`);
}

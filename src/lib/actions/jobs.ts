'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { classifySponsorship } from '@/lib/ai/sponsorship';
import { rankJob } from '@/lib/ai/ranking';
import { loadCandidateCore, toCandidateShape, toJobShape } from '@/lib/queries';
import { getActiveCandidateId } from '@/lib/session';
import { appendAudit } from '@/lib/audit';

export async function createJob(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim();
  const employer = String(formData.get('employer') ?? '').trim();
  const rawText = String(formData.get('rawText') ?? '').trim();
  if (!title || !employer || !rawText) redirect('/jobs?error=fields');

  const source = String(formData.get('source') ?? 'manual').trim() || 'manual';
  const externalId = String(formData.get('externalId') ?? '').trim() || randomUUID().slice(0, 12);

  const job = await prisma.job.upsert({
    where: { source_externalId: { source, externalId } },
    create: {
      source,
      externalId,
      title,
      employer,
      location: String(formData.get('location') ?? '').trim() || null,
      specialty: String(formData.get('specialty') ?? '').trim() || null,
      worktype: String(formData.get('worktype') ?? '').trim() || null,
      salary: String(formData.get('salary') ?? '').trim() || null,
      url: String(formData.get('url') ?? '').trim() || null,
      rawText,
    },
    update: { title, employer, rawText },
  });

  // Auto-classify sponsorship on ingest (cheap, deterministic core).
  const cls = await classifySponsorship(rawText);
  await prisma.sponsorshipClass.upsert({
    where: { jobId: job.id },
    create: {
      jobId: job.id,
      status: cls.status,
      evidenceQuote: cls.evidenceQuote,
      confidence: cls.confidence,
      visaSubclass: cls.visaSubclass,
      method: cls.method,
      model: cls.model ?? null,
    },
    update: {
      status: cls.status,
      evidenceQuote: cls.evidenceQuote,
      confidence: cls.confidence,
      visaSubclass: cls.visaSubclass,
      method: cls.method,
      model: cls.model ?? null,
    },
  });

  await appendAudit({
    actor: 'operator',
    action: 'job.create',
    entityRef: `job:${job.id}`,
    after: { title, employer, sponsorship: cls.status },
  });
  redirect(`/jobs/${job.id}`);
}

export async function classifyJob(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('job not found');
  const cls = await classifySponsorship(job.rawText);
  await prisma.sponsorshipClass.upsert({
    where: { jobId },
    create: {
      jobId,
      status: cls.status,
      evidenceQuote: cls.evidenceQuote,
      confidence: cls.confidence,
      visaSubclass: cls.visaSubclass,
      method: cls.method,
      model: cls.model ?? null,
    },
    update: {
      status: cls.status,
      evidenceQuote: cls.evidenceQuote,
      confidence: cls.confidence,
      visaSubclass: cls.visaSubclass,
      method: cls.method,
      model: cls.model ?? null,
    },
  });
  await appendAudit({ actor: 'operator', action: 'sponsorship.classify', entityRef: `job:${jobId}`, after: { status: cls.status } });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath('/jobs');
}

export async function rankActiveForJob(jobId: string) {
  const candidateId = await getActiveCandidateId();
  if (!candidateId) throw new Error('no active candidate');
  const [candidate, job] = await Promise.all([
    loadCandidateCore(candidateId),
    prisma.job.findUnique({ where: { id: jobId } }),
  ]);
  if (!candidate || !job) throw new Error('candidate or job not found');

  const r = await rankJob(toCandidateShape(candidate), toJobShape(job));
  await prisma.ranking.upsert({
    where: { jobId_candidateId: { jobId, candidateId } },
    create: {
      jobId,
      candidateId,
      fitScore: r.fitScore,
      specialtyMatch: r.specialtyMatch,
      locationMatch: r.locationMatch,
      experienceGapYears: r.experienceGapYears,
      registrationOk: r.registrationOk,
      rationale: r.rationale,
      model: r.model,
      stage: 'interactive',
    },
    update: {
      fitScore: r.fitScore,
      specialtyMatch: r.specialtyMatch,
      locationMatch: r.locationMatch,
      experienceGapYears: r.experienceGapYears,
      registrationOk: r.registrationOk,
      rationale: r.rationale,
      model: r.model,
    },
  });
  await appendAudit({ actor: 'operator', action: 'ranking.score', candidateId, entityRef: `job:${jobId}`, after: { fitScore: r.fitScore } });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath('/jobs');
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rankJob } from '@/lib/ai/ranking';
import { loadCandidateCore, toCandidateShape, toJobShape } from '@/lib/queries';
import { getActiveCandidateId } from '@/lib/session';
import { appendAudit } from '@/lib/audit';

// POST /api/ai/rank  { jobId, candidateId? }  → job-fit ranking (persisted)
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { jobId?: string; candidateId?: string };
  if (!body.jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });

  const candidateId = body.candidateId ?? (await getActiveCandidateId());
  if (!candidateId) return NextResponse.json({ error: 'no active candidate' }, { status: 400 });

  const [candidate, job] = await Promise.all([
    loadCandidateCore(candidateId),
    prisma.job.findUnique({ where: { id: body.jobId } }),
  ]);
  if (!candidate) return NextResponse.json({ error: 'candidate not found' }, { status: 404 });
  if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 });

  const result = await rankJob(toCandidateShape(candidate), toJobShape(job));

  const saved = await prisma.ranking.upsert({
    where: { jobId_candidateId: { jobId: job.id, candidateId } },
    create: {
      jobId: job.id,
      candidateId,
      fitScore: result.fitScore,
      specialtyMatch: result.specialtyMatch,
      locationMatch: result.locationMatch,
      experienceGapYears: result.experienceGapYears,
      registrationOk: result.registrationOk,
      rationale: result.rationale,
      model: result.model,
      stage: 'interactive',
    },
    update: {
      fitScore: result.fitScore,
      specialtyMatch: result.specialtyMatch,
      locationMatch: result.locationMatch,
      experienceGapYears: result.experienceGapYears,
      registrationOk: result.registrationOk,
      rationale: result.rationale,
      model: result.model,
    },
  });

  await appendAudit({
    actor: 'operator',
    action: 'ranking.score',
    candidateId,
    entityRef: `job:${job.id}`,
    after: { fitScore: result.fitScore, model: result.model },
  });

  return NextResponse.json({ result, saved });
}

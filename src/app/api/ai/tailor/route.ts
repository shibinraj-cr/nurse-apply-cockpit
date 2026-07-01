import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { tailorApplication } from '@/lib/ai/tailoring';
import { toCandidateShape, toJobShape } from '@/lib/queries';
import { appendAudit } from '@/lib/audit';

// POST /api/ai/tailor  { applicationId }  → tailored résumé + cover letter (persisted)
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { applicationId?: string };
  if (!body.applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 });

  const app = await prisma.application.findUnique({
    where: { id: body.applicationId },
    include: {
      job: true,
      candidate: { include: { profile: true, registrationState: true } },
    },
  });
  if (!app) return NextResponse.json({ error: 'application not found' }, { status: 404 });

  const result = await tailorApplication(toCandidateShape(app.candidate), toJobShape(app.job));

  await prisma.application.update({
    where: { id: app.id },
    data: {
      tailoredResume: result.tailoredResume,
      tailoredCoverLetter: result.tailoredCoverLetter,
      status: app.status === 'queued' ? 'ready_for_review' : app.status,
    },
  });

  await appendAudit({
    actor: 'operator',
    action: 'tailoring.generate',
    candidateId: app.candidateId,
    entityRef: `application:${app.id}`,
    after: { usedModel: result.usedModel, model: result.model },
  });

  return NextResponse.json({ result });
}

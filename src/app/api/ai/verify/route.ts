import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyTailoring } from '@/lib/ai/verification';
import { appendAudit } from '@/lib/audit';

// POST /api/ai/verify  { applicationId }  → claim-level anti-fabrication diff
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    applicationId?: string;
    resume?: string;
    coverLetter?: string;
  };
  if (!body.applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 });

  const app = await prisma.application.findUnique({
    where: { id: body.applicationId },
    include: { candidate: { include: { profile: true } } },
  });
  if (!app) return NextResponse.json({ error: 'application not found' }, { status: 404 });

  const master = app.candidate.profile?.masterCvText?.trim();
  if (!master) {
    return NextResponse.json(
      { error: 'no master CV on file to verify against' },
      { status: 400 },
    );
  }

  // Verify the operator's current (possibly edited) text if supplied, else the stored draft.
  const resume = body.resume ?? app.tailoredResume ?? '';
  const coverLetter = body.coverLetter ?? app.tailoredCoverLetter ?? '';
  if (!resume && !coverLetter) {
    return NextResponse.json({ error: 'nothing tailored yet — generate first' }, { status: 400 });
  }

  const result = await verifyTailoring({
    masterCvText: master,
    generatedResume: resume,
    generatedCoverLetter: coverLetter,
  });

  await appendAudit({
    actor: 'operator',
    action: 'tailoring.verify',
    candidateId: app.candidateId,
    entityRef: `application:${app.id}`,
    after: { overall: result.overall, unsupportedCount: result.unsupportedCount },
  });

  return NextResponse.json({ result });
}

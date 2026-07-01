import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { classifySponsorship } from '@/lib/ai/sponsorship';
import { appendAudit } from '@/lib/audit';

// POST /api/ai/classify  { jobId }  → sponsorship classification (persisted)
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!body.jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });

  const job = await prisma.job.findUnique({ where: { id: body.jobId } });
  if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 });

  const result = await classifySponsorship(job.rawText);
  const saved = await prisma.sponsorshipClass.upsert({
    where: { jobId: job.id },
    create: {
      jobId: job.id,
      status: result.status,
      evidenceQuote: result.evidenceQuote,
      confidence: result.confidence,
      visaSubclass: result.visaSubclass,
      method: result.method,
      model: result.model ?? null,
    },
    update: {
      status: result.status,
      evidenceQuote: result.evidenceQuote,
      confidence: result.confidence,
      visaSubclass: result.visaSubclass,
      method: result.method,
      model: result.model ?? null,
    },
  });

  await appendAudit({
    actor: 'operator',
    action: 'sponsorship.classify',
    entityRef: `job:${job.id}`,
    after: { status: result.status, method: result.method, confidence: result.confidence },
  });

  return NextResponse.json({ result, saved });
}

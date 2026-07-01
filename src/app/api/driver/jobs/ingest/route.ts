import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { classifyHeuristic } from '@/lib/ai/sponsorship';
import { rankHeuristic } from '@/lib/ai/ranking';
import { loadCandidateCore, toCandidateShape, toJobShape } from '@/lib/queries';
import { appendAudit } from '@/lib/audit';
import { SPONSORSHIP_META, type SponsorshipStatus } from '@/lib/types';

interface IngestJob {
  externalId?: string;
  title: string;
  employer: string;
  location?: string;
  specialty?: string;
  worktype?: string;
  salary?: string;
  url?: string;
  rawText?: string;
}

const ALLOWED_SOURCES = ['seek', 'nswhealth', 'taleo', 'workday', 'mercury', 'snaphire', 'manual'];

// POST /api/driver/jobs/ingest  { candidateId, source?, jobs: IngestJob[] }
// Upserts postings read from an operator-opened page, deterministically
// sponsorship-classifies + ranks them for the candidate (no model cost on bulk;
// re-run the model per job in the cockpit). Returns a ranked summary.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    candidateId?: string;
    source?: string;
    jobs?: IngestJob[];
  };
  if (!body.candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 });
  if (!Array.isArray(body.jobs) || body.jobs.length === 0) {
    return NextResponse.json({ error: 'jobs[] required' }, { status: 400 });
  }
  const source = ALLOWED_SOURCES.includes(body.source || '') ? body.source! : 'seek';

  const candidate = await loadCandidateCore(body.candidateId);
  if (!candidate) return NextResponse.json({ error: 'candidate not found' }, { status: 404 });
  const shape = toCandidateShape(candidate);

  const results = [];
  for (const j of body.jobs) {
    if (!j.title || !j.employer) continue;
    const externalId = String(j.externalId || j.url || `${j.title}::${j.employer}`).slice(0, 160);
    const rawText = (j.rawText || `${j.title} at ${j.employer}. ${j.location ?? ''}`).slice(0, 20000);

    const job = await prisma.job.upsert({
      where: { source_externalId: { source, externalId } },
      create: {
        source,
        externalId,
        title: j.title,
        employer: j.employer,
        location: j.location ?? null,
        specialty: j.specialty ?? null,
        worktype: j.worktype ?? null,
        salary: j.salary ?? null,
        url: j.url ?? null,
        rawText,
      },
      update: { title: j.title, employer: j.employer, rawText, url: j.url ?? null },
    });

    const cls = classifyHeuristic(rawText);
    await prisma.sponsorshipClass.upsert({
      where: { jobId: job.id },
      create: {
        jobId: job.id,
        status: cls.status,
        evidenceQuote: cls.evidenceQuote,
        confidence: cls.confidence,
        visaSubclass: cls.visaSubclass,
        method: cls.method,
      },
      update: {
        status: cls.status,
        evidenceQuote: cls.evidenceQuote,
        confidence: cls.confidence,
        visaSubclass: cls.visaSubclass,
        method: cls.method,
      },
    });

    const r = rankHeuristic(shape, toJobShape(job));
    await prisma.ranking.upsert({
      where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } },
      create: {
        jobId: job.id,
        candidateId: candidate.id,
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

    results.push({
      jobId: job.id,
      title: job.title,
      employer: job.employer,
      url: job.url,
      fitScore: r.fitScore,
      sponsorship: SPONSORSHIP_META[cls.status as SponsorshipStatus].short,
    });
  }

  results.sort((a, b) => b.fitScore - a.fitScore);
  await appendAudit({
    actor: 'driver',
    action: 'driver.jobs_ingest',
    candidateId: candidate.id,
    after: { count: results.length },
  });

  return NextResponse.json({ count: results.length, results });
}

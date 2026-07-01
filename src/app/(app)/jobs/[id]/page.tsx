import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PageHeader, Section, Badge, KeyValue } from '@/components/ui';
import { classifyJob, rankActiveForJob } from '@/lib/actions/jobs';
import { createApplicationForActive } from '@/lib/actions/applications';
import { getActiveCandidate } from '@/lib/session';
import { SPONSORSHIP_META, type SponsorshipStatus } from '@/lib/types';
import { formatDateTime, pct } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await getActiveCandidate();
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      sponsorshipClass: true,
      rankings: active ? { where: { candidateId: active.id } } : false,
    },
  });
  if (!job) notFound();

  const sp = (job.sponsorshipClass?.status ?? 'UNKNOWN') as SponsorshipStatus;
  const meta = SPONSORSHIP_META[sp];
  const ranking = Array.isArray(job.rankings) ? job.rankings[0] : undefined;

  return (
    <div>
      <PageHeader
        title={job.title}
        description={`${job.employer} · ${job.location ?? '—'} · ${job.source}`}
        actions={
          <Link href="/jobs" className="btn-secondary">
            ← All jobs
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section
            title="Sponsorship classification"
            description="Axis B only (work-rights). Exclusion phrases scanned before positives; verbatim evidence required."
            actions={
              <form action={classifyJob.bind(null, job.id)}>
                <button type="submit" className="btn-secondary !px-2.5 !py-1 text-xs">
                  Re-classify
                </button>
              </form>
            }
          >
            <div className="flex items-center gap-2">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {job.sponsorshipClass && (
                <span className="text-xs text-slate-500">
                  {job.sponsorshipClass.method} · confidence{' '}
                  {Math.round((job.sponsorshipClass.confidence ?? 0) * 100)}%
                  {job.sponsorshipClass.visaSubclass ? ` · subclass ${job.sponsorshipClass.visaSubclass}` : ''}
                </span>
              )}
            </div>
            {job.sponsorshipClass?.evidenceQuote ? (
              <blockquote className="mt-3 border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-sm italic text-slate-700">
                “{job.sponsorshipClass.evidenceQuote}”
              </blockquote>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                No explicit sponsorship signal — treat as working-rights-required until stated.
              </p>
            )}
            <p className="mt-3 text-xs text-slate-400">
              Caveats: sponsorship ≠ registrability (axis A is a separate, higher-English-bar gate); an ad
              claiming sponsorship cannot prove the employer is an approved Standard Business Sponsor. Heuristic
              with a disclaimer, not migration advice.
            </p>
          </Section>

          <Section title="Posting text">
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-700">
              {job.rawText}
            </pre>
          </Section>
        </div>

        <div className="space-y-6">
          <Section
            title="Fit vs active candidate"
            description={active ? active.displayName : 'No active candidate selected.'}
            actions={
              active ? (
                <form action={rankActiveForJob.bind(null, job.id)}>
                  <button type="submit" className="btn-secondary !px-2.5 !py-1 text-xs">
                    {ranking ? 'Re-rank' : 'Rank'}
                  </button>
                </form>
              ) : undefined
            }
          >
            {!active ? (
              <p className="text-sm text-slate-500">Select a candidate to rank this posting.</p>
            ) : !ranking ? (
              <p className="text-sm text-slate-500">Not ranked yet — click Rank.</p>
            ) : (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-3xl font-semibold text-slate-900">{ranking.fitScore}</span>
                  <span className="text-sm text-slate-400">/ 100 fit</span>
                </div>
                <dl className="divide-y divide-slate-100">
                  <KeyValue k="Specialty match">{pct(ranking.specialtyMatch, 100)}</KeyValue>
                  <KeyValue k="Location match">{pct(ranking.locationMatch, 100)}</KeyValue>
                  <KeyValue k="Experience gap">{ranking.experienceGapYears}y</KeyValue>
                  <KeyValue k="Registration OK">
                    <Badge tone={ranking.registrationOk ? 'green' : 'red'}>
                      {ranking.registrationOk ? 'yes' : 'no'}
                    </Badge>
                  </KeyValue>
                  <KeyValue k="Model">{ranking.model}</KeyValue>
                </dl>
                <p className="mt-2 text-xs text-slate-500">{ranking.rationale}</p>
              </div>
            )}
          </Section>

          <Section title="Apply" description="Queues a human-in-the-loop application.">
            {!active ? (
              <p className="text-sm text-slate-500">Select a candidate first.</p>
            ) : (
              <form action={createApplicationForActive.bind(null, job.id, active.id)}>
                <button type="submit" className="btn-primary w-full">
                  Queue application for {active.displayName}
                </button>
              </form>
            )}
            <p className="mt-2 text-xs text-slate-400">
              Ingested {formatDateTime(job.fetchedAt)}.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

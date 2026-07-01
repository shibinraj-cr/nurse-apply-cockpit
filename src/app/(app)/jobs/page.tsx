import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PageHeader, Section, Badge, Field } from '@/components/ui';
import { createJob, rankActiveForJob } from '@/lib/actions/jobs';
import { getActiveCandidateId } from '@/lib/session';
import { SPONSORSHIP_META, type SponsorshipStatus } from '@/lib/types';
import { truncate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const activeId = await getActiveCandidateId();
  const jobs = await prisma.job.findMany({
    orderBy: { fetchedAt: 'desc' },
    include: {
      sponsorshipClass: true,
      rankings: activeId ? { where: { candidateId: activeId } } : false,
    },
  });

  return (
    <div>
      <PageHeader
        title="Jobs & ranking"
        description="Discovery is decoupled from apply. Paste a posting → auto sponsorship-classify → rank vs the active candidate."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Section title={`Postings (${jobs.length})`}>
            {jobs.length === 0 ? (
              <p className="text-sm text-slate-500">No postings yet — add one on the right.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {jobs.map((j) => {
                  const sp = (j.sponsorshipClass?.status ?? 'UNKNOWN') as SponsorshipStatus;
                  const meta = SPONSORSHIP_META[sp];
                  const ranking = Array.isArray(j.rankings) ? j.rankings[0] : undefined;
                  return (
                    <li key={j.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/jobs/${j.id}`}
                            className="text-sm font-semibold text-slate-900 hover:underline"
                          >
                            {j.title}
                          </Link>
                          <p className="truncate text-xs text-slate-500">
                            {j.employer} · {j.location ?? '—'} · {j.source}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {ranking && <Badge tone="blue">fit {ranking.fitScore}</Badge>}
                          <Badge tone={meta.tone}>{meta.short}</Badge>
                        </div>
                      </div>
                      {j.sponsorshipClass?.evidenceQuote && (
                        <p className="mt-1 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500">
                          “{truncate(j.sponsorshipClass.evidenceQuote, 140)}”
                        </p>
                      )}
                      {activeId && (
                        <div className="mt-2">
                          <form action={rankActiveForJob.bind(null, j.id)}>
                            <button type="submit" className="btn-secondary !px-2.5 !py-1 text-xs">
                              {ranking ? 'Re-rank for active' : 'Rank for active'}
                            </button>
                          </form>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <Section title="Add posting" description="Sponsorship is auto-classified on save.">
          <form action={createJob} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Source" htmlFor="source">
                <input id="source" name="source" className="input" placeholder="seek / taleo / manual" defaultValue="manual" />
              </Field>
              <Field label="External ID" htmlFor="externalId">
                <input id="externalId" name="externalId" className="input" placeholder="auto" />
              </Field>
            </div>
            <Field label="Title" htmlFor="title">
              <input id="title" name="title" required className="input" placeholder="Registered Nurse — ICU" />
            </Field>
            <Field label="Employer" htmlFor="employer">
              <input id="employer" name="employer" required className="input" placeholder="NSW Health" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Location" htmlFor="location">
                <input id="location" name="location" className="input" placeholder="Sydney, NSW" />
              </Field>
              <Field label="Specialty" htmlFor="specialty">
                <input id="specialty" name="specialty" className="input" placeholder="ICU" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Work type" htmlFor="worktype">
                <input id="worktype" name="worktype" className="input" placeholder="full_time" />
              </Field>
              <Field label="Salary" htmlFor="salary">
                <input id="salary" name="salary" className="input" placeholder="optional" />
              </Field>
            </div>
            <Field label="URL" htmlFor="url">
              <input id="url" name="url" className="input" placeholder="https://…" />
            </Field>
            <Field label="Posting body" htmlFor="rawText">
              <textarea id="rawText" name="rawText" rows={5} required className="input" placeholder="Paste the full posting text…" />
            </Field>
            <button type="submit" className="btn-primary w-full">
              Add & classify
            </button>
          </form>
        </Section>
      </div>
    </div>
  );
}

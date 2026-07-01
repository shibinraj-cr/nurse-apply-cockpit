import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PageHeader, Section, Badge, Field } from '@/components/ui';
import { createJob, rankActiveForJob } from '@/lib/actions/jobs';
import { getActiveCandidateId } from '@/lib/session';
import { SPONSORSHIP_META, type SponsorshipStatus } from '@/lib/types';
import { cn, truncate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const FILTERS: { key: string; status: SponsorshipStatus | 'all'; label: string }[] = [
  { key: 'all', status: 'all', label: 'All' },
  { key: 'available', status: 'SPONSORSHIP_AVAILABLE', label: 'Sponsorship available' },
  { key: 'conditional', status: 'CONDITIONAL', label: 'Conditional' },
  { key: 'unknown', status: 'UNKNOWN', label: 'Unknown' },
  { key: 'wr', status: 'WORKING_RIGHTS_REQUIRED', label: 'Working rights req.' },
];
const PRIORITY: Record<SponsorshipStatus, number> = {
  SPONSORSHIP_AVAILABLE: 0,
  CONDITIONAL: 1,
  UNKNOWN: 2,
  WORKING_RIGHTS_REQUIRED: 3,
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ sponsor?: string }>;
}) {
  const sp = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === sp.sponsor) ?? FILTERS[0];
  const activeId = await getActiveCandidateId();

  const jobs = await prisma.job.findMany({
    include: {
      sponsorshipClass: true,
      rankings: activeId ? { where: { candidateId: activeId } } : false,
    },
  });

  const spOf = (j: (typeof jobs)[number]) => (j.sponsorshipClass?.status ?? 'UNKNOWN') as SponsorshipStatus;
  const fitOf = (j: (typeof jobs)[number]) => (Array.isArray(j.rankings) ? j.rankings[0]?.fitScore ?? -1 : -1);

  const counts: Record<string, number> = { all: jobs.length };
  for (const j of jobs) counts[spOf(j)] = (counts[spOf(j)] ?? 0) + 1;

  const filtered = (activeFilter.status === 'all' ? jobs : jobs.filter((j) => spOf(j) === activeFilter.status)).sort(
    (a, b) => PRIORITY[spOf(a)] - PRIORITY[spOf(b)] || fitOf(b) - fitOf(a),
  );

  return (
    <div>
      <PageHeader
        title="Jobs & ranking"
        description="Sponsorship-available roles are flagged + sorted to the top. Classification uses the posting text — send the full job description (extension/driver) for an accurate flag."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {/* Sponsorship filter tabs */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const n = f.status === 'all' ? counts.all : counts[f.status] ?? 0;
              const active = f.key === activeFilter.key;
              return (
                <Link
                  key={f.key}
                  href={f.key === 'all' ? '/jobs' : `/jobs?sponsor=${f.key}`}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                    active
                      ? 'bg-slate-900 text-white ring-slate-900'
                      : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  {f.label} <span className="opacity-70">{n}</span>
                </Link>
              );
            })}
          </div>

          <Section title={`Postings (${filtered.length})`}>
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-500">No postings in this view.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map((j) => {
                  const status = spOf(j);
                  const meta = SPONSORSHIP_META[status];
                  const ranking = Array.isArray(j.rankings) ? j.rankings[0] : undefined;
                  return (
                    <li key={j.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/jobs/${j.id}`}
                              className="text-sm font-semibold text-slate-900 hover:underline"
                            >
                              {j.title}
                            </Link>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            {j.sponsorshipClass?.visaSubclass && (
                              <Badge tone="blue">subclass {j.sponsorshipClass.visaSubclass}</Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-slate-500">
                            {j.employer} · {j.location ?? '—'} · {j.source}
                          </p>
                        </div>
                        {ranking && <Badge tone="blue">fit {ranking.fitScore}</Badge>}
                      </div>
                      {j.sponsorshipClass?.evidenceQuote && (
                        <p className="mt-1 border-l-2 border-emerald-300 pl-2 text-xs italic text-slate-600">
                          “{truncate(j.sponsorshipClass.evidenceQuote, 160)}”
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
                <input id="source" name="source" className="input" placeholder="seek / nswhealth / manual" defaultValue="manual" />
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

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PageHeader, Section, Badge, Field } from '@/components/ui';
import { createCandidate, switchCandidate } from '@/lib/actions/candidates';
import { getActiveCandidateId } from '@/lib/session';
import {
  CANDIDATE_META,
  REGISTRATION_META,
  WORK_RIGHTS_META,
  type CandidateStatus,
  type RegistrationStatus,
  type WorkRights,
} from '@/lib/types';
import { jsonArray } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CandidatesPage() {
  const [candidates, activeId] = await Promise.all([
    prisma.candidate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        profile: true,
        registrationState: true,
        _count: { select: { applications: true, documents: true } },
      },
    }),
    getActiveCandidateId(),
  ]);

  return (
    <div>
      <PageHeader
        title="Candidates"
        description="Roster of internationally-qualified RNs. Pick one to make it the active candidate."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title={`Roster (${candidates.length})`}>
            {candidates.length === 0 ? (
              <p className="text-sm text-slate-500">No candidates yet — add one on the right.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {candidates.map((c) => {
                  const reg = (c.registrationState?.status ?? 'self_check') as RegistrationStatus;
                  const wr = (c.profile?.workRights ?? 'unknown') as WorkRights;
                  const status = c.status as CandidateStatus;
                  const specialties = jsonArray<string>(c.profile?.specialties);
                  const isActive = c.id === activeId;
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/candidates/${c.id}`}
                            className="text-sm font-semibold text-slate-900 hover:underline"
                          >
                            {c.displayName}
                          </Link>
                          {isActive && <Badge tone="blue">active</Badge>}
                          <Badge tone={CANDIDATE_META[status].tone}>{CANDIDATE_META[status].label}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {specialties.slice(0, 3).join(', ') || 'no specialties'} ·{' '}
                          {c._count.applications} apps · {c._count.documents} docs
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={REGISTRATION_META[reg].tone}>{REGISTRATION_META[reg].label}</Badge>
                        <Badge tone={WORK_RIGHTS_META[wr].tone}>{WORK_RIGHTS_META[wr].label}</Badge>
                        {!isActive && (
                          <form action={switchCandidate.bind(null, c.id)}>
                            <button type="submit" className="btn-secondary !px-2.5 !py-1 text-xs">
                              Set active
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <Section title="Add candidate" description="Creates an empty profile + registration record.">
          <form action={createCandidate} className="space-y-3">
            <Field label="Display name" htmlFor="displayName">
              <input id="displayName" name="displayName" required className="input" placeholder="Jane Doe" />
            </Field>
            <Field label="Notes (optional)" htmlFor="notes">
              <textarea id="notes" name="notes" rows={3} className="input" placeholder="Source, context…" />
            </Field>
            <button type="submit" className="btn-primary w-full">
              Create candidate
            </button>
          </form>
        </Section>
      </div>
    </div>
  );
}

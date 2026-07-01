import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PageHeader, Section, Badge, Field } from '@/components/ui';
import { createConsent, revokeConsent } from '@/lib/actions/consent';
import { CONSENT_SCOPES, CONSENT_SCOPE_META, type ConsentScope } from '@/lib/types';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function consentState(c: { revokedAt: Date | null; expiry: Date | null }) {
  if (c.revokedAt) return { label: 'Revoked', tone: 'red' as const };
  if (c.expiry && c.expiry.getTime() < Date.now()) return { label: 'Expired', tone: 'amber' as const };
  return { label: 'Current', tone: 'green' as const };
}

export default async function ConsentPage() {
  const [records, candidates] = await Promise.all([
    prisma.consentRecord.findMany({
      orderBy: { signedAt: 'desc' },
      include: { candidate: true },
    }),
    prisma.candidate.findMany({ orderBy: { displayName: 'asc' }, select: { id: true, displayName: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Consent (APP 3)"
        description="Express, voluntary, informed, specific, current consent per candidate. Revocation halts new apps day-one."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title={`Consent records (${records.length})`}>
            {records.length === 0 ? (
              <p className="text-sm text-slate-500">No consent captured yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-3 font-medium">Candidate</th>
                      <th className="py-2 pr-3 font-medium">Scope</th>
                      <th className="py-2 pr-3 font-medium">Employer</th>
                      <th className="py-2 pr-3 font-medium">Signed</th>
                      <th className="py-2 pr-3 font-medium">Expiry</th>
                      <th className="py-2 pr-3 font-medium">State</th>
                      <th className="py-2 pr-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {records.map((c) => {
                      const st = consentState(c);
                      const scope = CONSENT_SCOPE_META[c.scope as ConsentScope];
                      return (
                        <tr key={c.id}>
                          <td className="py-2 pr-3">
                            <Link
                              href={`/candidates/${c.candidateId}`}
                              className="font-medium text-slate-900 hover:underline"
                            >
                              {c.candidate.displayName}
                            </Link>
                          </td>
                          <td className="py-2 pr-3 text-slate-700">{scope?.label ?? c.scope}</td>
                          <td className="py-2 pr-3 text-slate-500">{c.employer ?? '—'}</td>
                          <td className="py-2 pr-3 text-slate-500">{formatDate(c.signedAt)}</td>
                          <td className="py-2 pr-3 text-slate-500">{formatDate(c.expiry)}</td>
                          <td className="py-2 pr-3">
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {!c.revokedAt && (
                              <form action={revokeConsent.bind(null, c.id, c.candidateId)}>
                                <button type="submit" className="btn-danger !px-2.5 !py-1 text-xs">
                                  Revoke
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <Section title="Capture consent" description="Scoped, with optional expiry.">
          {candidates.length === 0 ? (
            <p className="text-sm text-slate-500">Add a candidate first.</p>
          ) : (
            <form action={createConsent} className="space-y-3">
              <Field label="Candidate" htmlFor="candidateId">
                <select id="candidateId" name="candidateId" required className="input">
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Scope" htmlFor="scope">
                <select id="scope" name="scope" required className="input">
                  {CONSENT_SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {CONSENT_SCOPE_META[s].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Employer (for disclose scope)" htmlFor="employer">
                <input id="employer" name="employer" className="input" placeholder="e.g. NSW Health" />
              </Field>
              <Field label="Expiry (optional)" htmlFor="expiry">
                <input id="expiry" name="expiry" type="date" className="input" />
              </Field>
              <Field label="Evidence ref (optional)" htmlFor="evidenceRef">
                <input id="evidenceRef" name="evidenceRef" className="input" placeholder="signed form id / link" />
              </Field>
              <button type="submit" className="btn-primary w-full">
                Record consent
              </button>
            </form>
          )}
        </Section>
      </div>
    </div>
  );
}

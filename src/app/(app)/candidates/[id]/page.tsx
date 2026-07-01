import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PageHeader, Section, Badge, Field, KeyValue } from '@/components/ui';
import { MasterCvEditor } from '@/components/MasterCvEditor';
import { ResumeParseWidget } from '@/components/ResumeParseWidget';
import { updateCandidateStatus } from '@/lib/actions/candidates';
import { updateProfileFields, updateRegistration, confirmAhpra } from '@/lib/actions/profile';
import { uploadDocument } from '@/lib/actions/documents';
import { createPortalAccount } from '@/lib/actions/portal';
import { createConsent, revokeConsent } from '@/lib/actions/consent';
import {
  CANDIDATE_STATUSES,
  CANDIDATE_META,
  REGISTRATION_STATUSES,
  REGISTRATION_META,
  WORK_RIGHTS,
  WORK_RIGHTS_META,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_META,
  CONSENT_SCOPES,
  CONSENT_SCOPE_META,
  APPLICATION_META,
  type CandidateStatus,
  type RegistrationStatus,
  type WorkRights,
  type DocumentType,
  type ConsentScope,
  type ApplicationStatus,
} from '@/lib/types';
import { jsonArray, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.candidate.findUnique({
    where: { id },
    include: {
      profile: true,
      registrationState: true,
      documents: { include: { versions: { orderBy: { createdAt: 'desc' } } } },
      portalAccounts: { include: { credential: true } },
      consentRecords: { orderBy: { signedAt: 'desc' } },
      applications: { include: { job: true }, orderBy: { updatedAt: 'desc' } },
    },
  });
  if (!c) notFound();

  const p = c.profile;
  const reg = c.registrationState;
  const status = c.status as CandidateStatus;
  const specialties = jsonArray<string>(p?.specialties).join(', ');
  const locations = jsonArray<string>(p?.locations).join(', ');
  const endorsements = jsonArray<string>(reg?.endorsements).join(', ');
  const conditions = jsonArray<string>(reg?.conditions).join(', ');

  return (
    <div>
      <PageHeader
        title={c.displayName}
        description={c.notes ?? undefined}
        actions={
          <div className="flex items-center gap-1.5">
            {CANDIDATE_STATUSES.map((s) => (
              <form key={s} action={updateCandidateStatus.bind(null, c.id, s)}>
                <button
                  className={
                    s === status
                      ? 'rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white'
                      : 'rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50'
                  }
                >
                  {CANDIDATE_META[s].label}
                </button>
              </form>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left: profile, CV, registration, documents, applications ── */}
        <div className="space-y-6 lg:col-span-2">
          <Section title="Profile" description="Free-text facts. Verified facts (AHPRA) are locked separately.">
            <form action={updateProfileFields} className="space-y-3">
              <input type="hidden" name="candidateId" value={c.id} />
              <Field label="Specialties (comma-separated)" htmlFor="specialties">
                <input id="specialties" name="specialties" defaultValue={specialties} className="input" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Years experience" htmlFor="yearsExp">
                  <input id="yearsExp" name="yearsExp" type="number" min={0} defaultValue={p?.yearsExp ?? 0} className="input" />
                </Field>
                <Field label="Preferred locations" htmlFor="locations">
                  <input id="locations" name="locations" defaultValue={locations} className="input" placeholder="Sydney, Melbourne" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Work rights (axis B)" htmlFor="workRights">
                  <select id="workRights" name="workRights" defaultValue={p?.workRights ?? 'unknown'} className="input">
                    {WORK_RIGHTS.map((w) => (
                      <option key={w} value={w}>
                        {WORK_RIGHTS_META[w].label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Visa subclass" htmlFor="visaSubclass">
                  <input id="visaSubclass" name="visaSubclass" defaultValue={p?.visaSubclass ?? ''} className="input" placeholder="482 / 189 …" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Self-check stream" htmlFor="selfCheckStream">
                  <select id="selfCheckStream" name="selfCheckStream" defaultValue={p?.selfCheckStream ?? ''} className="input">
                    <option value="">—</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </Field>
                <Field label="Pathway" htmlFor="pathway">
                  <select id="pathway" name="pathway" defaultValue={p?.pathway ?? 'unknown'} className="input">
                    <option value="streamlined1">Streamlined 1</option>
                    <option value="streamlined2">Streamlined 2</option>
                    <option value="oba">OBA</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </Field>
              </div>
              <button type="submit" className="btn-primary">
                Save profile
              </button>
            </form>
          </Section>

          <Section title="Master CV (grounding)">
            <MasterCvEditor candidateId={c.id} initial={p?.masterCvText ?? ''} />
          </Section>

          <Section title="Registration (axis A — gates applications)">
            <form action={updateRegistration} className="space-y-3">
              <input type="hidden" name="candidateId" value={c.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status" htmlFor="status">
                  <select id="status" name="status" defaultValue={reg?.status ?? 'self_check'} className="input">
                    {REGISTRATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {REGISTRATION_META[s].label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Division" htmlFor="division">
                  <select id="division" name="division" defaultValue={reg?.division ?? 'unknown'} className="input">
                    <option value="RN_Div1">RN Div 1</option>
                    <option value="EN">Enrolled Nurse</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Endorsements" htmlFor="endorsements">
                  <input id="endorsements" name="endorsements" defaultValue={endorsements} className="input" />
                </Field>
                <Field label="Conditions" htmlFor="conditions">
                  <input id="conditions" name="conditions" defaultValue={conditions} className="input" />
                </Field>
              </div>
              <Field label="Expiry" htmlFor="expiry">
                <input
                  id="expiry"
                  name="expiry"
                  type="date"
                  defaultValue={reg?.expiry ? reg.expiry.toISOString().slice(0, 10) : ''}
                  className="input"
                />
              </Field>
              <button type="submit" className="btn-primary">
                Save registration
              </button>
            </form>
          </Section>

          <Section
            title="Documents"
            description="Encrypted at rest, versioned, expiry-tracked."
            actions={
              <Link href={`/candidates/${c.id}/documents`} className="btn-secondary !px-2.5 !py-1 text-xs">
                Version history
              </Link>
            }
          >
            {c.documents.length === 0 ? (
              <p className="mb-3 text-sm text-slate-500">No documents yet.</p>
            ) : (
              <ul className="mb-4 divide-y divide-slate-100">
                {c.documents.map((d) => {
                  const cur = d.versions.find((v) => v.isCurrent) ?? d.versions[0];
                  const dmeta = DOCUMENT_TYPE_META[d.type as DocumentType];
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-800">{dmeta?.label ?? d.type}</span>
                        {dmeta?.aiExcluded && <Badge tone="red" className="ml-2">AI-excluded</Badge>}
                        {cur && (
                          <a
                            href={`/api/documents/${cur.id}`}
                            target="_blank"
                            className="block truncate text-xs text-blue-600 hover:underline"
                          >
                            {cur.filename}
                          </a>
                        )}
                      </div>
                      {cur?.validUntil && (
                        <span className="text-xs text-slate-400">exp {formatDate(cur.validUntil)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <form action={uploadDocument} className="grid grid-cols-2 gap-2">
              <input type="hidden" name="candidateId" value={c.id} />
              <Field label="Type" htmlFor="type">
                <select id="type" name="type" className="input">
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {DOCUMENT_TYPE_META[t].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Valid until" htmlFor="validUntil">
                <input id="validUntil" name="validUntil" type="date" className="input" />
              </Field>
              <div className="col-span-2">
                <Field label="File" htmlFor="file">
                  <input id="file" name="file" type="file" required className="input" />
                </Field>
              </div>
              <div className="col-span-2">
                <button type="submit" className="btn-primary">
                  Upload (encrypted)
                </button>
              </div>
            </form>
          </Section>

          <Section title="Applications">
            {c.applications.length === 0 ? (
              <p className="text-sm text-slate-500">No applications yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {c.applications.map((a) => {
                  const meta = APPLICATION_META[a.status as ApplicationStatus];
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                      <Link href={`/applications/${a.id}`} className="text-sm font-medium text-slate-800 hover:underline">
                        {a.job.title}
                      </Link>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        {/* ── Right: identity, onboarding, portal accounts, consent ── */}
        <div className="space-y-6">
          <Section title="Verified identity (locked)">
            <dl className="divide-y divide-slate-100">
              <KeyValue k="Status">
                <Badge tone={CANDIDATE_META[status].tone}>{CANDIDATE_META[status].label}</Badge>
              </KeyValue>
              <KeyValue k="AHPRA reg no">
                {p?.ahpraRegNo ? (
                  <span className="font-mono text-xs">
                    {p.ahpraRegNo} {p.ahpraVerified ? <Badge tone="green">verified</Badge> : <Badge tone="amber">unverified</Badge>}
                  </span>
                ) : (
                  '—'
                )}
              </KeyValue>
            </dl>
            <form action={confirmAhpra} className="mt-3 space-y-2">
              <input type="hidden" name="candidateId" value={c.id} />
              <Field label="Confirm & lock AHPRA number" htmlFor="ahpraRegNo">
                <input id="ahpraRegNo" name="ahpraRegNo" defaultValue={p?.ahpraRegNo ?? ''} className="input font-mono" placeholder="NMW0001234567" />
              </Field>
              <button type="submit" className="btn-secondary w-full">
                Confirm verified (lock)
              </button>
            </form>
          </Section>

          <Section title="Onboarding — parse résumé">
            <ResumeParseWidget />
          </Section>

          <Section title="Portal accounts" description="Credentials are vaulted; only a ref is stored.">
            {c.portalAccounts.length === 0 ? (
              <p className="mb-3 text-sm text-slate-500">No portal accounts yet.</p>
            ) : (
              <ul className="mb-4 space-y-2">
                {c.portalAccounts.map((a) => (
                  <li key={a.id} className="rounded-md border border-slate-200 p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{a.portal}</span>
                      <Badge tone={a.credential ? 'green' : 'slate'}>
                        {a.credential ? 'vaulted creds' : 'no creds'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500">{a.username ?? 'no username'} · {a.provisioningState}</p>
                    {a.browserProfileId && (
                      <p className="truncate font-mono text-[11px] text-slate-400">{a.browserProfileId}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form action={createPortalAccount} className="space-y-2">
              <input type="hidden" name="candidateId" value={c.id} />
              <div className="grid grid-cols-2 gap-2">
                <input name="portal" required className="input" placeholder="taleo / workday" />
                <input name="provisioningState" className="input" placeholder="created" defaultValue="created" />
              </div>
              <input name="tenantUrl" className="input" placeholder="tenant URL (optional)" />
              <div className="grid grid-cols-2 gap-2">
                <input name="username" className="input" placeholder="username" />
                <input name="password" type="password" className="input" placeholder="password → vault" />
              </div>
              <input name="mfaNotes" className="input" placeholder="MFA notes (optional)" />
              <button type="submit" className="btn-secondary w-full">
                Add portal account
              </button>
            </form>
          </Section>

          <Section title="Consent">
            {c.consentRecords.length === 0 ? (
              <p className="mb-3 text-sm text-slate-500">No consent on file.</p>
            ) : (
              <ul className="mb-4 space-y-2">
                {c.consentRecords.map((r) => {
                  const revoked = !!r.revokedAt;
                  const expired = !revoked && r.expiry && r.expiry.getTime() < Date.now();
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-slate-700">{CONSENT_SCOPE_META[r.scope as ConsentScope]?.label ?? r.scope}</span>
                      <div className="flex items-center gap-2">
                        <Badge tone={revoked ? 'red' : expired ? 'amber' : 'green'}>
                          {revoked ? 'revoked' : expired ? 'expired' : 'current'}
                        </Badge>
                        {!revoked && (
                          <form action={revokeConsent.bind(null, r.id, c.id)}>
                            <button className="text-xs text-red-600 hover:underline">revoke</button>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <form action={createConsent} className="space-y-2">
              <input type="hidden" name="candidateId" value={c.id} />
              <select name="scope" required className="input">
                {CONSENT_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {CONSENT_SCOPE_META[s].label}
                  </option>
                ))}
              </select>
              <input name="employer" className="input" placeholder="employer (disclose scope)" />
              <input name="expiry" type="date" className="input" />
              <button type="submit" className="btn-secondary w-full">
                Record consent
              </button>
            </form>
          </Section>
        </div>
      </div>
    </div>
  );
}

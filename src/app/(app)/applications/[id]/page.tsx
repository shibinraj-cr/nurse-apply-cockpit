import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PageHeader, Section, Badge, KeyValue } from '@/components/ui';
import { TailoringStudio } from '@/components/TailoringStudio';
import { attestAndSubmit, updateApplicationStatus, scheduleFollowUp } from '@/lib/actions/applications';
import { registrationOk } from '@/lib/queries';
import { getActiveCandidateId } from '@/lib/session';
import {
  APPLICATION_META,
  REGISTRATION_META,
  type ApplicationStatus,
  type RegistrationStatus,
} from '@/lib/types';
import { formatDate, formatDateTime, jsonArray } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface FrozenDoc {
  documentVersionId: string;
  sha256: string;
  filename: string;
}

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const activeId = await getActiveCandidateId();

  const app = await prisma.application.findUnique({
    where: { id },
    include: {
      job: { include: { sponsorshipClass: true } },
      candidate: {
        include: {
          profile: true,
          registrationState: true,
          consentRecords: true,
          documents: { include: { versions: true } },
        },
      },
    },
  });
  if (!app) notFound();

  const c = app.candidate;
  const meta = APPLICATION_META[app.status as ApplicationStatus];
  const reg = (c.registrationState?.status ?? 'self_check') as RegistrationStatus;
  const regOk = registrationOk(c.registrationState);
  const now = Date.now();
  const activeConsent = c.consentRecords.find(
    (r) => r.scope === 'apply_on_behalf' && !r.revokedAt && (!r.expiry || r.expiry.getTime() > now),
  );
  const currentDocs = c.documents.flatMap((d) =>
    d.versions.filter((v) => v.isCurrent).map((v) => ({ type: d.type, v })),
  );
  const frozen = jsonArray<FrozenDoc>(app.docVersionsAttached);
  const isSubmitted = !!app.submittedAt;
  const wrongActive = activeId !== c.id;
  const canSubmit = regOk && !!activeConsent && !isSubmitted && !wrongActive;
  const ahpra =
    c.profile?.ahpraRegNo && c.profile.ahpraVerified
      ? `AHPRA …${c.profile.ahpraRegNo.slice(-4)}`
      : 'AHPRA unverified';

  return (
    <div>
      <PageHeader
        title={app.job.title}
        description={`${app.job.employer} · ${app.portal}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <Link href="/applications" className="btn-secondary">
              ← All
            </Link>
          </div>
        }
      />

      {sp.submitted && (
        <div className="mb-4 rounded-md bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          Attestation recorded and application marked submitted. Documents frozen + hashed.
        </div>
      )}
      {sp.error && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-2.5 text-sm text-red-700">{sp.error}</div>
      )}
      {wrongActive && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          ⚠ This application belongs to <strong>{c.displayName}</strong>, who is not your active candidate.
          Switch to {c.displayName} before driving their portal account.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section
            title="Tailoring studio"
            description="Grounded only in the verified master CV. Verify before attesting."
          >
            <TailoringStudio
              applicationId={app.id}
              hasMasterCv={!!c.profile?.masterCvText}
              initialResume={app.tailoredResume ?? ''}
              initialCover={app.tailoredCoverLetter ?? ''}
            />
          </Section>

          {!isSubmitted ? (
            <Section
              title="Attestation & submit"
              description="The human reviews and submits. This records your truthfulness attestation — it does not auto-submit."
            >
              {!canSubmit && (
                <ul className="mb-3 space-y-1 text-sm">
                  {wrongActive && (
                    <li className="text-red-700">
                      ✗ Active candidate mismatch — switch to {c.displayName} before submitting.
                    </li>
                  )}
                  {!regOk && (
                    <li className="text-red-700">
                      ✗ Registration not current ({REGISTRATION_META[reg].label}) — applications are gated.
                    </li>
                  )}
                  {!activeConsent && (
                    <li className="text-red-700">✗ No current apply-on-behalf consent on file.</li>
                  )}
                </ul>
              )}
              <form action={attestAndSubmit} className="space-y-3">
                <input type="hidden" name="applicationId" value={app.id} />
                <div>
                  <label className="label" htmlFor="reviewerName">
                    Reviewer name
                  </label>
                  <input id="reviewerName" name="reviewerName" required className="input" placeholder="Your name" />
                </div>
                <div>
                  <label className="label" htmlFor="attestationText">
                    Attestation note
                  </label>
                  <textarea
                    id="attestationText"
                    name="attestationText"
                    rows={2}
                    className="input"
                    placeholder="Reviewed all content against the candidate's verified facts."
                  />
                </div>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="confirmTruth" className="mt-0.5" />
                  <span>
                    I confirm I have reviewed every statement and document, and that all statements are true and
                    not fabricated.
                  </span>
                </label>
                <button type="submit" disabled={!canSubmit} className="btn-primary">
                  Attest & mark submitted
                </button>
              </form>
            </Section>
          ) : (
            <Section title="Submission record" description="Frozen at attestation.">
              <dl className="divide-y divide-slate-100">
                <KeyValue k="Reviewer">{app.reviewerId ?? '—'}</KeyValue>
                <KeyValue k="Attested">{formatDateTime(app.attestationTs)}</KeyValue>
                <KeyValue k="Attestation note">{app.attestationText || '—'}</KeyValue>
                <KeyValue k="Consent record">{app.consentRecordId ? 'linked' : '—'}</KeyValue>
              </dl>
              <p className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                Frozen documents (hashed)
              </p>
              {frozen.length === 0 ? (
                <p className="text-sm text-slate-500">None recorded.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {frozen.map((f) => (
                    <li key={f.documentVersionId} className="flex items-center justify-between gap-2">
                      <span className="text-slate-700">{f.filename}</span>
                      <span className="font-mono text-xs text-slate-400">{f.sha256.slice(0, 12)}…</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>

        <div className="space-y-6">
          <Section title="Pre-submit identity confirmation" description="Whose account + which documents.">
            <dl className="divide-y divide-slate-100">
              <KeyValue k="Candidate">
                <Link href={`/candidates/${c.id}`} className="hover:underline">
                  {c.displayName}
                </Link>
              </KeyValue>
              <KeyValue k="Identity">
                <span className="font-mono text-xs">{ahpra}</span>
              </KeyValue>
              <KeyValue k="Portal">{app.portal}</KeyValue>
              <KeyValue k="Registration">
                <Badge tone={REGISTRATION_META[reg].tone}>{REGISTRATION_META[reg].label}</Badge>
              </KeyValue>
              <KeyValue k="Consent">
                {activeConsent ? <Badge tone="green">apply-on-behalf current</Badge> : <Badge tone="red">missing</Badge>}
              </KeyValue>
            </dl>
            <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Current documents
            </p>
            {currentDocs.length === 0 ? (
              <p className="text-sm text-slate-500">No documents on file.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {currentDocs.map(({ type, v }) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <span className="text-slate-700">
                      {type}: {v.filename}
                    </span>
                    {v.validUntil && <span className="text-xs text-slate-400">exp {formatDate(v.validUntil)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Tracking">
            <form action={scheduleFollowUp} className="space-y-2">
              <input type="hidden" name="applicationId" value={app.id} />
              <label className="label" htmlFor="followUpAt">
                Follow-up date
              </label>
              <input
                id="followUpAt"
                name="followUpAt"
                type="date"
                defaultValue={app.followUpAt ? app.followUpAt.toISOString().slice(0, 10) : ''}
                className="input"
              />
              <button type="submit" className="btn-secondary w-full">
                Save follow-up
              </button>
            </form>
            {isSubmitted && (
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={updateApplicationStatus.bind(null, app.id, 'interview')}>
                  <button className="btn-secondary !px-2.5 !py-1 text-xs">Mark interview</button>
                </form>
                <form action={updateApplicationStatus.bind(null, app.id, 'offer')}>
                  <button className="btn-secondary !px-2.5 !py-1 text-xs">Mark offer</button>
                </form>
                <form action={updateApplicationStatus.bind(null, app.id, 'rejected')}>
                  <button className="btn-danger !px-2.5 !py-1 text-xs">Mark rejected</button>
                </form>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

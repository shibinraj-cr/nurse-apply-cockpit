import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PageHeader, StatCard, Section, Badge, EmptyState } from '@/components/ui';
import {
  APPLICATION_META,
  SPONSORSHIP_META,
  type ApplicationStatus,
  type SponsorshipStatus,
} from '@/lib/types';
import { formatDate, formatDateTime, daysUntil } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const QUEUE_STATUSES: ApplicationStatus[] = ['drafting', 'ready_for_review', 'needs_manual'];

export default async function DashboardPage() {
  const [candidateCount, jobCount, apps, queue, sponsorship, expiringDocs, recentAudit] =
    await Promise.all([
      prisma.candidate.count(),
      prisma.job.count(),
      prisma.application.groupBy({ by: ['status'], _count: true }),
      prisma.application.findMany({
        where: { status: { in: QUEUE_STATUSES } },
        include: { candidate: true, job: true },
        orderBy: { updatedAt: 'desc' },
        take: 12,
      }),
      prisma.sponsorshipClass.groupBy({ by: ['status'], _count: true }),
      prisma.documentVersion.findMany({
        where: { isCurrent: true, validUntil: { not: null } },
        include: { document: { include: { candidate: true } } },
        orderBy: { validUntil: 'asc' },
        take: 8,
      }),
      prisma.auditLog.findMany({ orderBy: { seq: 'desc' }, take: 8 }),
    ]);

  const appByStatus = Object.fromEntries(apps.map((a) => [a.status, a._count])) as Record<string, number>;
  const submitted = appByStatus['submitted'] ?? 0;
  const totalApps = apps.reduce((n, a) => n + a._count, 0);
  const sponsorAvailable =
    sponsorship.find((s) => s.status === 'SPONSORSHIP_AVAILABLE')?._count ?? 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Cross-candidate work queue and status. The durable value: discovery + sponsorship + anti-fabrication tailoring + consent/audit/tracking."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Candidates" value={candidateCount} hint="roster" tone="blue" />
        <StatCard label="Jobs ingested" value={jobCount} hint={`${sponsorAvailable} sponsor-flagged`} tone="green" />
        <StatCard label="In work queue" value={queue.length} hint="need operator action" tone="amber" />
        <StatCard label="Submitted" value={submitted} hint={`${totalApps} total apps`} tone="violet" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section
            title="Work queue"
            description="Applications awaiting tailoring, review, or manual steps."
          >
            {queue.length === 0 ? (
              <EmptyState
                title="Queue is clear"
                description="Queue an application from a job to start the tailor → review → attest flow."
                action={
                  <Link href="/jobs" className="btn-primary">
                    Browse jobs
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {queue.map((a) => {
                  const meta = APPLICATION_META[a.status as ApplicationStatus];
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link
                          href={`/applications/${a.id}`}
                          className="truncate text-sm font-medium text-slate-900 hover:underline"
                        >
                          {a.job.title}
                        </Link>
                        <p className="truncate text-xs text-slate-500">
                          {a.candidate.displayName} · {a.job.employer} · {a.portal}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {a.followUpAt && (
                          <span className="text-xs text-slate-400">{formatDate(a.followUpAt)}</span>
                        )}
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Sponsorship breakdown" description="UNKNOWN is the modal class by design.">
            {sponsorship.length === 0 ? (
              <p className="text-sm text-slate-500">No jobs classified yet.</p>
            ) : (
              <ul className="space-y-2">
                {sponsorship.map((s) => {
                  const meta = SPONSORSHIP_META[s.status as SponsorshipStatus];
                  return (
                    <li key={s.status} className="flex items-center justify-between">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-sm font-semibold text-slate-700">{s._count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Expiring documents" description="validUntil within view; gates apps.">
            {expiringDocs.length === 0 ? (
              <p className="text-sm text-slate-500">No tracked expiries.</p>
            ) : (
              <ul className="space-y-2">
                {expiringDocs.map((v) => {
                  const d = daysUntil(v.validUntil);
                  const tone = d != null && d < 30 ? 'red' : d != null && d < 90 ? 'amber' : 'slate';
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-slate-700">
                        {v.document.candidate.displayName} · {v.document.type}
                      </span>
                      <Badge tone={tone}>{formatDate(v.validUntil)}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <div className="mt-6">
        <Section
          title="Recent activity"
          description="Append-only, hash-chained audit trail."
          actions={
            <Link href="/audit" className="btn-secondary">
              View audit log
            </Link>
          }
        >
          {recentAudit.length === 0 ? (
            <p className="text-sm text-slate-500">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentAudit.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-mono text-xs text-slate-400">#{e.seq}</span>
                  <span className="flex-1 truncate text-slate-700">{e.action}</span>
                  <span className="text-xs text-slate-400">{formatDateTime(e.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

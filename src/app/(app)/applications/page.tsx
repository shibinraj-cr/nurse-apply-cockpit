import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PageHeader, Section, Badge, EmptyState } from '@/components/ui';
import { APPLICATION_META, type ApplicationStatus } from '@/lib/types';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ApplicationsPage() {
  const apps = await prisma.application.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { candidate: true, job: true },
  });

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Every application is human-reviewed and human-submitted. Documents are frozen + hashed at submit."
      />

      <Section>
        {apps.length === 0 ? (
          <EmptyState
            title="No applications yet"
            description="Queue one from a job posting."
            action={
              <Link href="/jobs" className="btn-primary">
                Browse jobs
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3 font-medium">Candidate</th>
                  <th className="py-2 pr-3 font-medium">Job</th>
                  <th className="py-2 pr-3 font-medium">Portal</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {apps.map((a) => {
                  const meta = APPLICATION_META[a.status as ApplicationStatus];
                  return (
                    <tr key={a.id}>
                      <td className="py-2 pr-3">
                        <Link
                          href={`/candidates/${a.candidateId}`}
                          className="text-slate-700 hover:underline"
                        >
                          {a.candidate.displayName}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">
                        <Link
                          href={`/applications/${a.id}`}
                          className="font-medium text-slate-900 hover:underline"
                        >
                          {a.job.title}
                        </Link>
                        <span className="block text-xs text-slate-400">{a.job.employer}</span>
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{a.portal}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{formatDate(a.followUpAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

import { prisma } from '@/lib/db';
import { PageHeader, Section, Badge } from '@/components/ui';
import { verifyAuditChain } from '@/lib/audit';
import { formatDateTime, truncate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const [rows, chain] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { seq: 'desc' }, take: 200 }),
    verifyAuditChain(),
  ]);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Append-only, hash-chained record of every operator action — the legal defence."
        actions={
          chain.ok ? (
            <Badge tone="green">Chain verified · {chain.count} entries</Badge>
          ) : (
            <Badge tone="red">Chain BROKEN at #{chain.brokenAtSeq}</Badge>
          )
        }
      />

      <Section>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No audit entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Actor</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                  <th className="py-2 pr-3 font-medium">Entity</th>
                  <th className="py-2 pr-3 font-medium">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-400">{r.seq}</td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{formatDateTime(r.ts)}</td>
                    <td className="py-2 pr-3 text-slate-700">{r.actor}</td>
                    <td className="py-2 pr-3">
                      <span className="font-medium text-slate-900">{r.action}</span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">{r.entityRef ?? '—'}</td>
                    <td className="py-2 pr-3 font-mono text-[11px] text-slate-400" title={r.hash}>
                      {truncate(r.hash, 12)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

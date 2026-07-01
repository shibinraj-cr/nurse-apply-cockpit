import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PageHeader, Section, Badge } from '@/components/ui';
import { setCurrentVersion, deleteDocumentVersion } from '@/lib/actions/documents';
import { DOCUMENT_TYPE_META, type DocumentType } from '@/lib/types';
import { formatDate, formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: { documents: { include: { versions: { orderBy: { createdAt: 'desc' } } } } },
  });
  if (!candidate) notFound();

  return (
    <div>
      <PageHeader
        title={`${candidate.displayName} — documents`}
        description="Full version history. Each blob is AES-256-GCM encrypted at rest; the sha256 is of the plaintext."
        actions={
          <Link href={`/candidates/${id}`} className="btn-secondary">
            ← Candidate
          </Link>
        }
      />

      {candidate.documents.length === 0 ? (
        <Section>
          <p className="text-sm text-slate-500">No documents uploaded yet.</p>
        </Section>
      ) : (
        <div className="space-y-6">
          {candidate.documents.map((d) => {
            const dmeta = DOCUMENT_TYPE_META[d.type as DocumentType];
            return (
              <Section
                key={d.id}
                title={dmeta?.label ?? d.type}
                actions={dmeta?.aiExcluded ? <Badge tone="red">excluded from AI generation</Badge> : undefined}
              >
                <ul className="divide-y divide-slate-100">
                  {d.versions.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <a
                          href={`/api/documents/${v.id}`}
                          target="_blank"
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          {v.filename}
                        </a>
                        <p className="text-xs text-slate-400">
                          {(v.sizeBytes / 1024).toFixed(0)} KB · {v.mime} · uploaded {formatDateTime(v.createdAt)}
                          {v.validUntil ? ` · valid until ${formatDate(v.validUntil)}` : ''}
                        </p>
                        <p className="font-mono text-[11px] text-slate-300">{v.sha256}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {v.isCurrent ? (
                          <Badge tone="green">current</Badge>
                        ) : (
                          <form action={setCurrentVersion.bind(null, v.id, id)}>
                            <button className="btn-secondary !px-2.5 !py-1 text-xs">Make current</button>
                          </form>
                        )}
                        <form action={deleteDocumentVersion.bind(null, v.id, id)}>
                          <button className="btn-danger !px-2.5 !py-1 text-xs">Delete</button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            );
          })}
        </div>
      )}
    </div>
  );
}

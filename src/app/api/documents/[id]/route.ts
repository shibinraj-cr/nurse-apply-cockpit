import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBlob } from '@/lib/storage';
import { appendAudit } from '@/lib/audit';

// GET /api/documents/:versionId  → decrypts + streams a document version (audited).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const version = await prisma.documentVersion.findUnique({
    where: { id },
    include: { document: true },
  });
  if (!version) return new NextResponse('not found', { status: 404 });

  let buf: Buffer;
  try {
    buf = await getBlob(version.blobRef);
  } catch {
    return new NextResponse('blob unavailable', { status: 410 });
  }

  await appendAudit({
    actor: 'operator',
    action: 'document.download',
    candidateId: version.document.candidateId,
    entityRef: `documentVersion:${id}`,
  });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': version.mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${version.filename.replace(/"/g, '')}"`,
      'Content-Length': String(buf.length),
    },
  });
}

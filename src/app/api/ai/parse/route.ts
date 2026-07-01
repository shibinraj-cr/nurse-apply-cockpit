import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseResume } from '@/lib/ai/parsing';
import { getBlob } from '@/lib/storage';
import { DOCUMENT_TYPE_META, type DocumentType } from '@/lib/types';

// POST /api/ai/parse  { cvText } | { documentVersionId }  → structured profile DRAFT
// (never auto-applied — operator confirms; regNo/quals flagged needsHumanConfirm)
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    cvText?: string;
    documentVersionId?: string;
  };

  let cvText = body.cvText?.trim();

  if (!cvText && body.documentVersionId) {
    const version = await prisma.documentVersion.findUnique({
      where: { id: body.documentVersionId },
      include: { document: true },
    });
    if (!version) return NextResponse.json({ error: 'document version not found' }, { status: 404 });
    // Anti-fabrication boundary (DESIGN §4.4): AHPRA/passport/police/WWCC are
    // excluded from AI entirely — never feed them to the model, even as text.
    if (DOCUMENT_TYPE_META[version.document.type as DocumentType]?.aiExcluded) {
      return NextResponse.json(
        { error: `Document type "${version.document.type}" is excluded from AI processing.` },
        { status: 403 },
      );
    }
    if (!version.mime.startsWith('text/')) {
      return NextResponse.json(
        {
          error:
            'Non-text document. PDF/scan extraction (Files API) is out of this slice — paste cvText instead.',
        },
        { status: 415 },
      );
    }
    cvText = getBlob(version.blobRef).toString('utf8');
  }

  if (!cvText) return NextResponse.json({ error: 'cvText or documentVersionId required' }, { status: 400 });

  const draft = await parseResume(cvText);
  return NextResponse.json({ draft });
}

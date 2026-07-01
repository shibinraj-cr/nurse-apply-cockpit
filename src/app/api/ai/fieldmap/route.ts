import { NextRequest, NextResponse } from 'next/server';
import { mapFields, type DetectedField } from '@/lib/ai/fieldmap';
import { loadCandidateCore, profileValuesFor } from '@/lib/queries';
import { getActiveCandidateId } from '@/lib/session';

// POST /api/ai/fieldmap  { fields: DetectedField[], candidateId? }
// → proposed field→value map (the browser layer fills + reads back; never submits)
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    fields?: DetectedField[];
    candidateId?: string;
  };
  if (!Array.isArray(body.fields)) {
    return NextResponse.json({ error: 'fields[] required' }, { status: 400 });
  }

  const candidateId = body.candidateId ?? (await getActiveCandidateId());
  if (!candidateId) return NextResponse.json({ error: 'no active candidate' }, { status: 400 });

  const candidate = await loadCandidateCore(candidateId);
  if (!candidate) return NextResponse.json({ error: 'candidate not found' }, { status: 404 });

  const result = await mapFields(body.fields, profileValuesFor(candidate));
  return NextResponse.json({ result });
}

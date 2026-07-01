import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { loadCandidateCore, profileValuesFor } from '@/lib/queries';
import { appendAudit } from '@/lib/audit';

// POST /api/driver/session/resolve  { candidateId, email? }
// Resolves (find-or-create) the candidate's ISOLATED Seek browser profile + login
// email, so the driver launches the right per-candidate context (wrong-account
// isolation). Returns the profile autofill values too.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { candidateId?: string; email?: string };
  if (!body.candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 });

  const candidate = await loadCandidateCore(body.candidateId);
  if (!candidate) return NextResponse.json({ error: 'candidate not found' }, { status: 404 });

  const email = body.email?.trim() || candidate.profile?.email || null;

  // Mirror the login email into the profile (so it's available for form autofill),
  // without clobbering an email the operator already set.
  if (body.email?.trim() && !candidate.profile?.email) {
    await prisma.profile.upsert({
      where: { candidateId: candidate.id },
      create: { candidateId: candidate.id, email: body.email.trim() },
      update: { email: body.email.trim() },
    });
    if (candidate.profile) candidate.profile.email = body.email.trim();
  }

  let account = await prisma.portalAccount.findFirst({
    where: { candidateId: candidate.id, portal: 'seek' },
  });
  if (!account) {
    account = await prisma.portalAccount.create({
      data: {
        candidateId: candidate.id,
        portal: 'seek',
        tenantUrl: 'https://www.seek.com.au',
        username: email,
        provisioningState: 'created',
        browserProfileId: `profile-${candidate.id.slice(0, 6)}-seek-${randomUUID().slice(0, 6)}`,
        mfaNotes: 'Passwordless email code — human completes login',
      },
    });
  } else if (email && email !== account.username) {
    account = await prisma.portalAccount.update({ where: { id: account.id }, data: { username: email } });
  }

  await appendAudit({
    actor: 'driver',
    action: 'driver.session_resolve',
    candidateId: candidate.id,
    entityRef: `portalAccount:${account.id}`,
  });

  return NextResponse.json({
    candidateId: candidate.id,
    candidateName: candidate.displayName,
    portalAccountId: account.id,
    browserProfileId: account.browserProfileId,
    loginEmail: account.username ?? email,
    tenantUrl: account.tenantUrl ?? 'https://www.seek.com.au',
    profileValues: profileValuesFor(candidate),
  });
}

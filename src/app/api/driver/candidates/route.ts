import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/driver/candidates → roster for the desktop driver to choose from.
export async function GET() {
  const candidates = await prisma.candidate.findMany({
    orderBy: { displayName: 'asc' },
    include: { profile: true, portalAccounts: { where: { portal: 'seek' } } },
  });
  return NextResponse.json({
    candidates: candidates.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      status: c.status,
      email: c.profile?.email ?? null,
      hasSeekProfile: c.portalAccounts.length > 0,
      browserProfileId: c.portalAccounts[0]?.browserProfileId ?? null,
    })),
  });
}

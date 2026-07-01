// Active-candidate context (DESIGN.md §1 "highest-integrity risk"). The active
// candidate is a single source of truth, shown unmissably; submitting on the
// wrong account is a notifiable privacy breach. SERVER-ONLY (next/headers + db).

import { cookies } from 'next/headers';
import { prisma } from './db';

export const ACTIVE_CANDIDATE_COOKIE = 'active_candidate';

export async function getActiveCandidateId(): Promise<string | null> {
  const c = await cookies();
  return c.get(ACTIVE_CANDIDATE_COOKIE)?.value ?? null;
}

/** Only valid inside a Server Action or Route Handler (mutates cookies). */
export async function setActiveCandidateId(id: string | null): Promise<void> {
  const c = await cookies();
  if (id) {
    c.set(ACTIVE_CANDIDATE_COOKIE, id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12,
    });
  } else {
    c.delete(ACTIVE_CANDIDATE_COOKIE);
  }
}

/** Load the active candidate with the fields the banner + guards need. */
export async function getActiveCandidate() {
  const id = await getActiveCandidateId();
  if (!id) return null;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: { profile: true, registrationState: true },
  });
  return candidate; // null if the cookie points at a deleted candidate
}

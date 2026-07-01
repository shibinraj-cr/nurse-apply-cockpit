// Automation-layer seam (DESIGN.md §1 "Per-candidate session/credential seam").
//
// The live browser automation runs OUTSIDE this web app — a Playwright/CDP desktop
// driver with one persistent, isolated userDataDir per candidate (see ../../../spikes).
// This module is the cockpit-side contract that the driver consults so it can never
// drive the wrong account: submitting candidate A's application while logged in as B
// is a notifiable privacy breach, so any mismatch is a HARD STOP.
//
// NODE-ONLY (Prisma).

import { prisma } from '../db';

export interface FillPlanField {
  selectorHint: string;
  value: string | null;
  confidence: number;
  fillable: boolean;
}

export interface BoundSession {
  candidateId: string;
  candidateName: string;
  portalAccountId: string;
  portal: string;
  browserProfileId: string;
}

export class WrongAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WrongAccountError';
  }
}

/**
 * Resolve the isolated browser profile bound to (candidate, portalAccount) and
 * assert the binding is internally consistent. Throws WrongAccountError on any
 * mismatch — the driver must refuse to proceed.
 */
export async function resolveBoundSession(
  candidateId: string,
  portalAccountId: string,
): Promise<BoundSession> {
  const account = await prisma.portalAccount.findUnique({
    where: { id: portalAccountId },
    include: { candidate: true },
  });
  if (!account) throw new WrongAccountError('portal account not found');
  if (account.candidateId !== candidateId) {
    throw new WrongAccountError(
      `binding mismatch: portal account belongs to ${account.candidateId}, not active candidate ${candidateId}`,
    );
  }
  if (!account.browserProfileId) {
    throw new WrongAccountError('portal account has no isolated browser profile bound');
  }
  return {
    candidateId,
    candidateName: account.candidate.displayName,
    portalAccountId,
    portal: account.portal,
    browserProfileId: account.browserProfileId,
  };
}

/**
 * Re-assert identity immediately before a fill/submit handoff. Call this right
 * after the active-candidate cookie is read and again before submit so a stale
 * binding can't slip through.
 */
export async function assertActiveMatchesBinding(
  activeCandidateId: string | null,
  session: BoundSession,
): Promise<void> {
  if (!activeCandidateId) throw new WrongAccountError('no active candidate set');
  if (activeCandidateId !== session.candidateId) {
    throw new WrongAccountError(
      `active candidate (${activeCandidateId}) does not match bound session (${session.candidateId})`,
    );
  }
}

import Link from 'next/link';
import { CandidateSwitcher } from './CandidateSwitcher';
import { Badge } from './ui';
import {
  REGISTRATION_META,
  WORK_RIGHTS_META,
  type RegistrationStatus,
  type WorkRights,
} from '@/lib/types';
import type { CandidateWithCore } from '@/lib/queries';

// The active candidate is the single source of truth (DESIGN.md §1). It is shown
// unmissably so the operator can never act on the wrong account.
export function ActiveCandidateBanner({
  active,
  candidates,
}: {
  active: CandidateWithCore | null;
  candidates: { id: string; displayName: string }[];
}) {
  const reg = (active?.registrationState?.status ?? 'self_check') as RegistrationStatus;
  const wr = (active?.profile?.workRights ?? 'unknown') as WorkRights;
  const ahpra =
    active?.profile?.ahpraRegNo && active.profile.ahpraVerified
      ? `AHPRA …${active.profile.ahpraRegNo.slice(-4)}`
      : 'AHPRA unverified';

  return (
    <div
      className={
        active
          ? 'flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-5 py-2.5 text-white'
          : 'flex flex-wrap items-center justify-between gap-3 bg-amber-500 px-5 py-2.5 text-amber-950'
      }
    >
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
          Active candidate
        </span>
        {active ? (
          <>
            <Link href={`/candidates/${active.id}`} className="text-sm font-semibold hover:underline">
              {active.displayName}
            </Link>
            <span className="font-mono text-xs opacity-80">{ahpra}</span>
            <Badge tone={REGISTRATION_META[reg].tone}>{REGISTRATION_META[reg].label}</Badge>
            <Badge tone={WORK_RIGHTS_META[wr].tone}>{WORK_RIGHTS_META[wr].label}</Badge>
          </>
        ) : (
          <span className="text-sm font-semibold">
            None selected — pick a candidate before acting on any account.
          </span>
        )}
      </div>
      <CandidateSwitcher candidates={candidates} activeId={active?.id ?? null} />
    </div>
  );
}

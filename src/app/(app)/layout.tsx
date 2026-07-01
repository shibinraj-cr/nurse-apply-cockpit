import type { ReactNode } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ActiveCandidateBanner } from '@/components/ActiveCandidateBanner';
import { prisma } from '@/lib/db';
import { getActiveCandidate } from '@/lib/session';
import { logout } from '@/lib/actions/auth';
import { hasAnthropic } from '@/lib/env';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [active, candidates] = await Promise.all([
    getActiveCandidate(),
    prisma.candidate.findMany({
      orderBy: { displayName: 'asc' },
      select: { id: true, displayName: true },
    }),
  ]);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 font-semibold text-white">
            ✚
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-slate-900">Nurse Cockpit</p>
            <p className="text-[11px] leading-tight text-slate-400">DesGro / DesMa</p>
          </div>
        </div>
        <Sidebar />
        <div className="space-y-2 border-t border-slate-100 p-3">
          <div className="px-2 text-[11px] text-slate-400">
            AI: {hasAnthropic ? 'live models' : 'heuristic / no-key mode'}
          </div>
          <form action={logout}>
            <button type="submit" className="btn-secondary w-full">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <ActiveCandidateBanner active={active} candidates={candidates} />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-8 py-7">{children}</main>
      </div>
    </div>
  );
}

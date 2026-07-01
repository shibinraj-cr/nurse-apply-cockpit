'use client';

import { useTransition } from 'react';
import { switchCandidate } from '@/lib/actions/candidates';

export function CandidateSwitcher({
  candidates,
  activeId,
}: {
  candidates: { id: string; displayName: string }[];
  activeId: string | null;
}) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Active candidate"
      disabled={pending}
      value={activeId ?? ''}
      onChange={(e) => {
        const id = e.target.value;
        if (id) start(() => switchCandidate(id));
      }}
      className="max-w-[16rem] rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm font-medium text-white outline-none focus:ring-2 focus:ring-white/30"
    >
      <option value="" disabled>
        {pending ? 'Switching…' : 'Select candidate…'}
      </option>
      {candidates.map((c) => (
        <option key={c.id} value={c.id} className="text-slate-900">
          {c.displayName}
        </option>
      ))}
    </select>
  );
}

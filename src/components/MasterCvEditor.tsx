'use client';

import { useState, useTransition } from 'react';
import { updateMasterCv } from '@/lib/actions/profile';

export function MasterCvEditor({ candidateId, initial }: { candidateId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        The single grounding source for anti-fabrication tailoring. Treated as verified — the model may only
        reorder/rephrase what is here.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={10}
        className="input font-mono text-xs leading-relaxed"
        placeholder="Paste the candidate's verified master CV text…"
      />
      <button
        onClick={() =>
          start(async () => {
            await updateMasterCv(candidateId, text);
            setSaved(true);
          })
        }
        disabled={pending}
        className="btn-primary"
      >
        {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save master CV'}
      </button>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Badge } from './ui';

interface Draft {
  specialties: string[];
  yearsExp: number;
  locations: string[];
  qualifications: { name: string; institution?: string; year?: number }[];
  referees: { name: string; role?: string }[];
  ahpraRegNoGuess: string | null;
  usedModel: boolean;
  model: string;
}

export function ResumeParseWidget() {
  const [cv, setCv] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function parse() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText: cv }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'request failed');
      setDraft(j.draft as Draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Paste résumé text to extract a structured draft. Registration number + qualifications are UNVERIFIED —
        confirm manually before locking.
      </p>
      <textarea
        value={cv}
        onChange={(e) => setCv(e.target.value)}
        rows={5}
        className="input text-xs"
        placeholder="Paste résumé text…"
      />
      <button onClick={parse} disabled={busy || !cv.trim()} className="btn-secondary">
        {busy ? 'Parsing…' : 'Parse résumé'}
      </button>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {draft && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-medium text-slate-900">Extracted draft</span>
            <Badge tone={draft.usedModel ? 'blue' : 'slate'}>{draft.usedModel ? draft.model : 'heuristic'}</Badge>
            <Badge tone="amber">needs human confirm</Badge>
          </div>
          <dl className="space-y-1 text-slate-700">
            <div>
              <span className="text-slate-500">Specialties:</span> {draft.specialties.join(', ') || '—'}
            </div>
            <div>
              <span className="text-slate-500">Years exp:</span> {draft.yearsExp}
            </div>
            <div>
              <span className="text-slate-500">Locations:</span> {draft.locations.join(', ') || '—'}
            </div>
            <div>
              <span className="text-slate-500">Qualifications:</span>{' '}
              {draft.qualifications.map((q) => q.name).join('; ') || '—'}
            </div>
            <div>
              <span className="text-slate-500">AHPRA guess:</span>{' '}
              {draft.ahpraRegNoGuess ? (
                <span className="font-mono">{draft.ahpraRegNoGuess}</span>
              ) : (
                '—'
              )}
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

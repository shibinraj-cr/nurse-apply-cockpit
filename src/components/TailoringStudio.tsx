'use client';

import { useState, useTransition } from 'react';
import { Badge } from './ui';
import { saveTailored } from '@/lib/actions/applications';

interface Claim {
  claim: string;
  supported: boolean;
  evidence: string | null;
}
interface VerifyResult {
  claims: Claim[];
  unsupportedCount: number;
  overall: 'clean' | 'flags' | 'unverified';
  usedModel: boolean;
  model: string;
}

export function TailoringStudio({
  applicationId,
  hasMasterCv,
  initialResume,
  initialCover,
}: {
  applicationId: string;
  hasMasterCv: boolean;
  initialResume: string;
  initialCover: string;
}) {
  const [resume, setResume] = useState(initialResume);
  const [cover, setCover] = useState(initialCover);
  const [notes, setNotes] = useState('');
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState<null | 'generate' | 'verify'>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  async function generate() {
    setBusy('generate');
    setError('');
    setVerify(null);
    try {
      const r = await fetch('/api/ai/tailor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'request failed');
      setResume(j.result.tailoredResume ?? '');
      setCover(j.result.tailoredCoverLetter ?? '');
      setNotes(j.result.notes ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function runVerify() {
    setBusy('verify');
    setError('');
    try {
      const r = await fetch('/api/ai/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, resume, coverLetter: cover }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'request failed');
      setVerify(j.result as VerifyResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function save() {
    start(async () => {
      await saveTailored(applicationId, resume, cover);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  const overallTone =
    verify?.overall === 'clean' ? 'green' : verify?.overall === 'flags' ? 'red' : 'amber';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={generate} disabled={busy !== null || !hasMasterCv} className="btn-primary">
          {busy === 'generate' ? 'Generating…' : 'Generate (grounded)'}
        </button>
        <button onClick={runVerify} disabled={busy !== null || (!resume && !cover)} className="btn-secondary">
          {busy === 'verify' ? 'Verifying…' : 'Verify claims'}
        </button>
        <button onClick={save} disabled={pending} className="btn-secondary">
          {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save edits'}
        </button>
        {!hasMasterCv && (
          <span className="text-xs text-amber-700">Add a master CV on the candidate to enable grounded tailoring.</span>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {notes && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">Grounding notes:</span> {notes}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <label className="label">Tailored résumé</label>
          <textarea
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            rows={14}
            className="input font-mono text-xs leading-relaxed"
            placeholder="Generate, then review/edit…"
          />
        </div>
        <div>
          <label className="label">Cover letter</label>
          <textarea
            value={cover}
            onChange={(e) => setCover(e.target.value)}
            rows={14}
            className="input text-sm leading-relaxed"
            placeholder="Generate, then review/edit…"
          />
        </div>
      </div>

      {verify && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">Anti-fabrication check</span>
            <Badge tone={overallTone}>
              {verify.overall === 'clean'
                ? 'All claims supported'
                : verify.overall === 'flags'
                  ? `${verify.unsupportedCount} unsupported`
                  : 'Could not verify'}
            </Badge>
            <span className="text-xs text-slate-400">{verify.usedModel ? verify.model : 'no model'}</span>
          </div>
          <ul className="space-y-1.5">
            {verify.claims.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={c.supported ? 'text-emerald-600' : 'text-red-600'}>
                  {c.supported ? '✓' : '✗'}
                </span>
                <span className="text-slate-700">
                  {c.claim}
                  {!c.supported && (
                    <span className="ml-1 font-medium text-red-600">— not supported by master CV</span>
                  )}
                  {c.evidence && <span className="ml-1 text-xs text-slate-400">({c.evidence})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

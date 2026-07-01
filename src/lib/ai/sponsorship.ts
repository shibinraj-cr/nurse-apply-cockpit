// Sponsorship classification (DESIGN.md §5). Four-class label with UNKNOWN as the
// honest default (most postings are silent). Algorithm precedence:
//   (1) exclusion/negation FIRST  → WORKING_RIGHTS_REQUIRED
//   (2) positive                   → SPONSORSHIP_AVAILABLE
//   (3) conditional                → CONDITIONAL
//   (4) else                       → UNKNOWN
// Always store the verbatim evidence snippet. A model second opinion only runs
// when the heuristic is UNKNOWN and a key is present, and is itself downgraded to
// UNKNOWN if it can't ground its answer in a verbatim quote from the posting.

import { z } from 'zod';
import {
  EXCLUSION_PHRASES,
  POSITIVE_PHRASES,
  CONDITIONAL_PHRASES,
} from '../constants';
import { env } from '../env';
import { structuredCall } from '../anthropic';
import { SPONSORED_SUBCLASSES, SELF_PR_SUBCLASSES, type SponsorshipStatus } from '../types';

export interface SponsorshipResult {
  status: SponsorshipStatus;
  evidenceQuote: string | null;
  confidence: number;
  visaSubclass: string | null;
  method: 'heuristic' | 'model';
  model?: string;
}

/** Pull the sentence/clause around a matched phrase, verbatim from the original. */
function extractContext(original: string, matchIndex: number, matchLen: number): string {
  const start = Math.max(
    0,
    Math.max(
      original.lastIndexOf('.', matchIndex),
      original.lastIndexOf('\n', matchIndex),
      original.lastIndexOf('!', matchIndex),
      original.lastIndexOf('?', matchIndex),
    ) + 1,
  );
  const tail = matchIndex + matchLen;
  const stops = ['.', '\n', '!', '?']
    .map((s) => original.indexOf(s, tail))
    .filter((i) => i >= 0);
  const end = stops.length ? Math.min(...stops) + 1 : Math.min(original.length, tail + 120);
  return original.slice(start, end).trim();
}

function findFirstPhrase(lower: string, phrases: string[]): { phrase: string; index: number } | null {
  let best: { phrase: string; index: number } | null = null;
  for (const p of phrases) {
    const i = lower.indexOf(p);
    if (i >= 0 && (best === null || i < best.index)) best = { phrase: p, index: i };
  }
  return best;
}

function detectVisaSubclass(lower: string): string | null {
  const m = lower.match(/\b(subclass\s*)?(482|186|494|189|190|491|407|457|188|888)\b/);
  return m ? m[2] : null;
}

/** Deterministic classifier — always available, no API key required. */
export function classifyHeuristic(rawText: string): SponsorshipResult {
  const original = rawText ?? '';
  const lower = original.toLowerCase();
  const visaSubclass = detectVisaSubclass(lower);

  // (1) exclusion first
  const excl = findFirstPhrase(lower, EXCLUSION_PHRASES);
  if (excl) {
    return {
      status: 'WORKING_RIGHTS_REQUIRED',
      evidenceQuote: extractContext(original, excl.index, excl.phrase.length),
      confidence: 0.9,
      visaSubclass: visaSubclass && SELF_PR_SUBCLASSES.includes(visaSubclass) ? visaSubclass : null,
      method: 'heuristic',
    };
  }

  // (2) positive
  const pos = findFirstPhrase(lower, POSITIVE_PHRASES);
  if (pos) {
    return {
      status: 'SPONSORSHIP_AVAILABLE',
      evidenceQuote: extractContext(original, pos.index, pos.phrase.length),
      confidence: 0.85,
      visaSubclass: visaSubclass && SPONSORED_SUBCLASSES.includes(visaSubclass) ? visaSubclass : null,
      method: 'heuristic',
    };
  }

  // (3) conditional
  const cond = findFirstPhrase(lower, CONDITIONAL_PHRASES);
  if (cond) {
    return {
      status: 'CONDITIONAL',
      evidenceQuote: extractContext(original, cond.index, cond.phrase.length),
      confidence: 0.6,
      visaSubclass,
      method: 'heuristic',
    };
  }

  // (4) default — most postings are silent
  return {
    status: 'UNKNOWN',
    evidenceQuote: null,
    confidence: 0.3,
    visaSubclass,
    method: 'heuristic',
  };
}

const modelSchema = z.object({
  status: z.enum(['SPONSORSHIP_AVAILABLE', 'WORKING_RIGHTS_REQUIRED', 'CONDITIONAL', 'UNKNOWN']),
  evidence_quote: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  visa_subclass: z.string().nullable().optional(),
});

/**
 * Heuristic is authoritative on a hit. Only when it returns UNKNOWN and a key is
 * present do we ask Haiku for a second opinion — and we reject any answer it can't
 * ground in a verbatim quote actually present in the posting.
 */
export async function classifySponsorship(rawText: string): Promise<SponsorshipResult> {
  const heuristic = classifyHeuristic(rawText);
  if (heuristic.status !== 'UNKNOWN') return heuristic;

  const res = await structuredCall<z.infer<typeof modelSchema>>({
    model: env.MODEL_HAIKU,
    system:
      'You classify whether an Australian nursing job posting offers visa sponsorship. ' +
      'Use exactly four classes: SPONSORSHIP_AVAILABLE, WORKING_RIGHTS_REQUIRED, CONDITIONAL, UNKNOWN. ' +
      'Scan for negation/exclusion ("no sponsorship", "PR required", "full working rights") BEFORE positive cues. ' +
      'You MUST copy a verbatim evidence_quote from the posting that justifies any non-UNKNOWN answer. ' +
      'If the posting is silent, return UNKNOWN with a null evidence_quote. Never infer sponsorship from absence of text.',
    user: `POSTING:\n${rawText}`,
    toolName: 'record_sponsorship',
    toolDescription: 'Record the sponsorship classification with verbatim evidence.',
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['SPONSORSHIP_AVAILABLE', 'WORKING_RIGHTS_REQUIRED', 'CONDITIONAL', 'UNKNOWN'],
        },
        evidence_quote: { type: ['string', 'null'], description: 'verbatim snippet from the posting' },
        confidence: { type: 'number' },
        visa_subclass: { type: ['string', 'null'] },
      },
      required: ['status', 'confidence'],
    },
    maxTokens: 400,
  });

  if (!res) return heuristic; // no key → keep deterministic UNKNOWN

  const parsed = modelSchema.safeParse(res.data);
  if (!parsed.success) return heuristic;

  const out = parsed.data;
  const quote = out.evidence_quote ?? null;
  // Anti-hallucination guard: the quote must really appear in the posting.
  const grounded = quote ? rawText.toLowerCase().includes(quote.toLowerCase().trim()) : false;

  if (out.status !== 'UNKNOWN' && !grounded) {
    return { ...heuristic, method: 'model', model: res.model }; // reject ungrounded claim
  }

  return {
    status: out.status,
    evidenceQuote: grounded ? quote : null,
    confidence: out.status === 'UNKNOWN' ? Math.min(out.confidence, 0.4) : out.confidence,
    visaSubclass: out.visa_subclass ?? heuristic.visaSubclass,
    method: 'model',
    model: res.model,
  };
}

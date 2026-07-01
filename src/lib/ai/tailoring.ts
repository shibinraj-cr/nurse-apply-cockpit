// CV + cover-letter tailoring (DESIGN.md §4 anti-fabrication subsystem). The model
// may ONLY reorder/select/rephrase content already in the verified master CV. It
// must never assert any qualification/registration/date/referee/check not present.
// Verified facts are handled as locked fields elsewhere and excluded from prose.

import { z } from 'zod';
import { structuredCall } from '../anthropic';
import { env } from '../env';
import type { CandidateShape, JobShape } from './shapes';

export interface TailoringResult {
  tailoredResume: string;
  tailoredCoverLetter: string;
  notes: string;
  usedModel: boolean;
  model: string;
}

const GROUNDING_SYSTEM =
  'You tailor a nurse candidate’s résumé and write a cover letter for a specific Australian job. ' +
  'STRICT GROUNDING RULE: you may only reorder, select, and rephrase content that is present in the ' +
  'MASTER CV provided. You must NEVER assert any qualification, registration number, employment date, ' +
  'referee, licence, or background-check status that is not explicitly in the master CV. If the posting ' +
  'asks for something the candidate does not evidence, do not claim it — omit it. Do not invent metrics. ' +
  'Write in Australian English, professional and concise. The cover letter must be truthful and specific ' +
  'to the posting using only grounded facts.';

function placeholder(candidate: CandidateShape, job: JobShape): TailoringResult {
  const cv = candidate.masterCvText?.trim();
  const cover = [
    `Dear Hiring Manager,`,
    ``,
    `I am writing to apply for the ${job.title} position at ${job.employer}` +
      `${job.location ? ` in ${job.location}` : ''}. I am an internationally-qualified Registered Nurse` +
      `${candidate.specialties.length ? ` with experience in ${candidate.specialties.join(', ')}` : ''}` +
      `${candidate.yearsExp ? ` and ${candidate.yearsExp} years of clinical experience` : ''}.`,
    ``,
    `[AI key not configured — this is a non-AI placeholder generated only from your stored profile ` +
      `facts. Review and complete before any use. No claims beyond your profile have been added.]`,
    ``,
    `Kind regards,`,
    candidate.displayName,
  ].join('\n');

  return {
    tailoredResume: cv || '[No master CV on file — upload/parse a résumé first.]',
    tailoredCoverLetter: cover,
    notes:
      'Generated WITHOUT an AI model (no ANTHROPIC_API_KEY). Placeholder grounded only in stored profile ' +
      'facts; run the verification pass and edit before use.',
    usedModel: false,
    model: 'placeholder',
  };
}

const schema = z.object({
  tailored_resume: z.string(),
  tailored_cover_letter: z.string(),
  notes: z.string(),
});

export async function tailorApplication(
  candidate: CandidateShape,
  job: JobShape,
): Promise<TailoringResult> {
  const master = candidate.masterCvText?.trim();
  if (!master) return placeholder(candidate, job);

  const res = await structuredCall<z.infer<typeof schema>>({
    model: env.MODEL_SONNET,
    system: GROUNDING_SYSTEM,
    cachedContext:
      `MASTER CV (the ONLY source of truth — do not exceed it):\n${master}\n\n` +
      `CANDIDATE: ${candidate.displayName}; specialties: ${candidate.specialties.join(', ') || '—'}; ` +
      `${candidate.yearsExp} years; locations: ${candidate.locations.join(', ') || '—'}.`,
    user: [
      `Tailor the résumé and write a cover letter for this posting.`,
      `Title: ${job.title}`,
      `Employer: ${job.employer}`,
      `Location: ${job.location ?? '—'}`,
      `Posting body:\n${job.rawText}`,
      ``,
      `In "notes", list anything the posting requested that the master CV does NOT support (so the operator can decide).`,
    ].join('\n'),
    toolName: 'record_tailoring',
    toolDescription: 'Record the tailored résumé, cover letter, and grounding notes.',
    schema: {
      type: 'object',
      properties: {
        tailored_resume: { type: 'string' },
        tailored_cover_letter: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['tailored_resume', 'tailored_cover_letter', 'notes'],
    },
    maxTokens: 3000,
  });

  if (!res) return placeholder(candidate, job);
  const parsed = schema.safeParse(res.data);
  if (!parsed.success) return placeholder(candidate, job);

  return {
    tailoredResume: parsed.data.tailored_resume,
    tailoredCoverLetter: parsed.data.tailored_cover_letter,
    notes: parsed.data.notes,
    usedModel: true,
    model: res.model,
  };
}

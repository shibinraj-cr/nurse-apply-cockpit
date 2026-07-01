// Job-fit ranking (DESIGN.md §4). Sonnet when a key is present; otherwise a
// deterministic heuristic so ranking still works offline. Two independent axes:
// registration readiness is reported but does NOT silently override fit.

import { z } from 'zod';
import { structuredCall } from '../anthropic';
import { env } from '../env';
import type { CandidateShape, JobShape } from './shapes';

export interface RankingResult {
  fitScore: number;
  specialtyMatch: number;
  locationMatch: number;
  experienceGapYears: number;
  registrationOk: boolean;
  rationale: string;
  model: string;
  usedModel: boolean;
}

function tokens(s: string): string[] {
  return (s || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
}

function overlapScore(a: string[], haystack: string): number {
  if (!a.length) return 0;
  const hay = haystack.toLowerCase();
  const hits = a.filter((x) => hay.includes(x.toLowerCase())).length;
  return Math.round((hits / a.length) * 100);
}

function parseRequiredYears(text: string): number | null {
  const m = text.toLowerCase().match(/(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)/);
  return m ? parseInt(m[1], 10) : null;
}

export function rankHeuristic(candidate: CandidateShape, job: JobShape): RankingResult {
  const jobBlob = `${job.title} ${job.specialty ?? ''} ${job.rawText}`;
  const specialtyMatch = overlapScore(candidate.specialties, jobBlob);
  const locationMatch = candidate.locations.length
    ? overlapScore(candidate.locations, `${job.location ?? ''}`)
    : 50;

  const required = parseRequiredYears(job.rawText);
  const experienceGapYears = required ? Math.max(0, required - candidate.yearsExp) : 0;
  const expScore = required ? Math.max(0, 100 - experienceGapYears * 20) : 70;

  const regScore = candidate.registrationOk ? 100 : 30;
  const fitScore = Math.round(
    0.45 * specialtyMatch + 0.2 * locationMatch + 0.2 * regScore + 0.15 * expScore,
  );

  const rationale =
    `Heuristic fit: specialty overlap ${specialtyMatch}%, location ${locationMatch}%, ` +
    `${candidate.registrationOk ? 'registration current' : 'registration NOT current (gates apply)'}` +
    (required ? `, posting wants ~${required}y vs ${candidate.yearsExp}y (gap ${experienceGapYears}y).` : '.') +
    ' (No AI key configured — deterministic estimate.)';

  return {
    fitScore,
    specialtyMatch,
    locationMatch,
    experienceGapYears,
    registrationOk: candidate.registrationOk,
    rationale,
    model: 'heuristic',
    usedModel: false,
  };
}

const schema = z.object({
  fit_score: z.number().min(0).max(100),
  specialty_match: z.number().min(0).max(100),
  location_match: z.number().min(0).max(100),
  experience_gap_years: z.number().min(0),
  registration_ok: z.boolean(),
  rationale: z.string(),
});

function profileContext(c: CandidateShape): string {
  return [
    `CANDIDATE PROFILE (grounding):`,
    `Name: ${c.displayName}`,
    `Specialties: ${c.specialties.join(', ') || '—'}`,
    `Years experience: ${c.yearsExp}`,
    `Preferred locations: ${c.locations.join(', ') || '—'}`,
    `Registration status: ${c.registrationStatus} (current enough to apply: ${c.registrationOk})`,
    `Work rights: ${c.workRights}`,
  ].join('\n');
}

export async function rankJob(candidate: CandidateShape, job: JobShape): Promise<RankingResult> {
  const res = await structuredCall<z.infer<typeof schema>>({
    model: env.MODEL_SONNET,
    system:
      'You score how well an internationally-qualified Registered Nurse fits an Australian nursing ' +
      'job posting. Score 0-100 for overall fit, specialty match, and location match. Report ' +
      'experience_gap_years (0 if none) and whether registration looks current enough to apply. ' +
      'Be specific in the rationale. Do not invent candidate facts not in the profile.',
    cachedContext: profileContext(candidate),
    user: [
      `JOB POSTING:`,
      `Title: ${job.title}`,
      `Employer: ${job.employer}`,
      `Location: ${job.location ?? '—'}`,
      `Specialty: ${job.specialty ?? '—'}`,
      `Body:\n${job.rawText}`,
    ].join('\n'),
    toolName: 'record_ranking',
    toolDescription: 'Record the structured job-fit ranking.',
    schema: {
      type: 'object',
      properties: {
        fit_score: { type: 'number' },
        specialty_match: { type: 'number' },
        location_match: { type: 'number' },
        experience_gap_years: { type: 'number' },
        registration_ok: { type: 'boolean' },
        rationale: { type: 'string' },
      },
      required: [
        'fit_score',
        'specialty_match',
        'location_match',
        'experience_gap_years',
        'registration_ok',
        'rationale',
      ],
    },
    maxTokens: 600,
  });

  if (!res) return rankHeuristic(candidate, job);
  const parsed = schema.safeParse(res.data);
  if (!parsed.success) return rankHeuristic(candidate, job);

  const d = parsed.data;
  return {
    fitScore: Math.round(d.fit_score),
    specialtyMatch: Math.round(d.specialty_match),
    locationMatch: Math.round(d.location_match),
    experienceGapYears: Math.round(d.experience_gap_years),
    // registration readiness is an objective candidate fact — trust ours, not the model's
    registrationOk: candidate.registrationOk,
    rationale: d.rationale,
    model: res.model,
    usedModel: true,
  };
}

// Résumé parsing for onboarding (DESIGN.md §4). Produces a structured profile
// DRAFT. Registration number + qualifications are NEVER trusted silently — the
// result is flagged needsHumanConfirm so the operator verifies before locking.

import { z } from 'zod';
import { structuredCall } from '../anthropic';
import { env } from '../env';

export interface ParsedProfile {
  specialties: string[];
  yearsExp: number;
  locations: string[];
  qualifications: { name: string; institution?: string; country?: string; year?: number }[];
  englishTest: { type?: string; overall?: number; date?: string } | null;
  referees: { name: string; role?: string; org?: string }[];
  ahpraRegNoGuess: string | null;
  usedModel: boolean;
  model: string;
  needsHumanConfirm: true;
}

function heuristicParse(cvText: string): ParsedProfile {
  const text = cvText || '';
  const yearsMatch = text.toLowerCase().match(/(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp|nursing)/);
  const ahpra = text.match(/\b(NMW|MED|PHA)[A-Z]?\d{10,}\b/);
  const SPECIALTY_HINTS = [
    'icu', 'intensive care', 'emergency', 'ed', 'theatre', 'perioperative', 'paediatric',
    'aged care', 'oncology', 'midwifery', 'mental health', 'renal', 'cardiac', 'surgical', 'medical',
  ];
  const lower = text.toLowerCase();
  const specialties = SPECIALTY_HINTS.filter((s) => lower.includes(s));
  return {
    specialties,
    yearsExp: yearsMatch ? parseInt(yearsMatch[1], 10) : 0,
    locations: [],
    qualifications: [],
    englishTest: null,
    referees: [],
    ahpraRegNoGuess: ahpra ? ahpra[0] : null,
    usedModel: false,
    model: 'heuristic',
    needsHumanConfirm: true,
  };
}

const schema = z.object({
  specialties: z.array(z.string()),
  years_experience: z.number().min(0),
  locations: z.array(z.string()),
  qualifications: z.array(
    z.object({
      name: z.string(),
      institution: z.string().nullable().optional(),
      country: z.string().nullable().optional(),
      year: z.number().nullable().optional(),
    }),
  ),
  english_test: z
    .object({
      type: z.string().nullable().optional(),
      overall: z.number().nullable().optional(),
      date: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  referees: z.array(
    z.object({
      name: z.string(),
      role: z.string().nullable().optional(),
      org: z.string().nullable().optional(),
    }),
  ),
  ahpra_reg_no_guess: z.string().nullable().optional(),
});

export async function parseResume(cvText: string): Promise<ParsedProfile> {
  const res = await structuredCall<z.infer<typeof schema>>({
    model: env.MODEL_SONNET,
    system:
      'Extract a structured nursing profile from this résumé text. Only extract what is present; do not ' +
      'infer or invent. Treat any AHPRA registration number and qualifications as UNVERIFIED guesses for a ' +
      'human to confirm. Return empty arrays when unsure.',
    user: `RÉSUMÉ:\n${cvText}`,
    toolName: 'record_profile',
    toolDescription: 'Record the extracted structured profile draft.',
    schema: {
      type: 'object',
      properties: {
        specialties: { type: 'array', items: { type: 'string' } },
        years_experience: { type: 'number' },
        locations: { type: 'array', items: { type: 'string' } },
        qualifications: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              institution: { type: ['string', 'null'] },
              country: { type: ['string', 'null'] },
              year: { type: ['number', 'null'] },
            },
            required: ['name'],
          },
        },
        english_test: {
          type: ['object', 'null'],
          properties: {
            type: { type: ['string', 'null'] },
            overall: { type: ['number', 'null'] },
            date: { type: ['string', 'null'] },
          },
        },
        referees: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              role: { type: ['string', 'null'] },
              org: { type: ['string', 'null'] },
            },
            required: ['name'],
          },
        },
        ahpra_reg_no_guess: { type: ['string', 'null'] },
      },
      required: ['specialties', 'years_experience', 'locations', 'qualifications', 'referees'],
    },
    maxTokens: 1500,
  });

  if (!res) return heuristicParse(cvText);
  const parsed = schema.safeParse(res.data);
  if (!parsed.success) return heuristicParse(cvText);

  const d = parsed.data;
  return {
    specialties: d.specialties,
    yearsExp: Math.round(d.years_experience),
    locations: d.locations,
    qualifications: d.qualifications.map((q) => ({
      name: q.name,
      institution: q.institution ?? undefined,
      country: q.country ?? undefined,
      year: q.year ?? undefined,
    })),
    englishTest: d.english_test
      ? {
          type: d.english_test.type ?? undefined,
          overall: d.english_test.overall ?? undefined,
          date: d.english_test.date ?? undefined,
        }
      : null,
    referees: d.referees.map((r) => ({ name: r.name, role: r.role ?? undefined, org: r.org ?? undefined })),
    ahpraRegNoGuess: d.ahpra_reg_no_guess ?? null,
    usedModel: true,
    model: res.model,
    needsHumanConfirm: true,
  };
}

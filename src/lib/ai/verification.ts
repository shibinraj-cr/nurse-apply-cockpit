// Tailoring verification pass (DESIGN.md §4). A SEPARATE model diffs the generated
// prose against the master CV at claim level. Any unsupported claim is surfaced in
// the review UI — this is the anti-fabrication backstop before human attestation.

import { z } from 'zod';
import { structuredCall } from '../anthropic';
import { env } from '../env';

export interface VerificationClaim {
  claim: string;
  supported: boolean;
  evidence: string | null;
}

export interface VerificationResult {
  claims: VerificationClaim[];
  unsupportedCount: number;
  overall: 'clean' | 'flags' | 'unverified';
  usedModel: boolean;
  model: string;
}

const schema = z.object({
  claims: z.array(
    z.object({
      claim: z.string(),
      supported: z.boolean(),
      evidence: z.string().nullable().optional(),
    }),
  ),
});

export async function verifyTailoring(input: {
  masterCvText: string;
  generatedResume: string;
  generatedCoverLetter: string;
}): Promise<VerificationResult> {
  const res = await structuredCall<z.infer<typeof schema>>({
    model: env.MODEL_HAIKU,
    system:
      'You are an anti-fabrication checker for a regulated profession (nursing). Extract every factual ' +
      'claim from the GENERATED résumé and cover letter (qualifications, registrations, dates, employers, ' +
      'durations, specialties, metrics, referees). For each, decide if it is SUPPORTED by the MASTER CV. ' +
      'A claim is supported only if the master CV clearly evidences it. Quote the supporting master-CV text ' +
      'as evidence, or null if unsupported. Be strict: when in doubt, mark unsupported.',
    cachedContext: `MASTER CV (ground truth):\n${input.masterCvText}`,
    user: [
      `GENERATED RÉSUMÉ:\n${input.generatedResume}`,
      ``,
      `GENERATED COVER LETTER:\n${input.generatedCoverLetter}`,
    ].join('\n'),
    toolName: 'record_verification',
    toolDescription: 'Record claim-level support against the master CV.',
    schema: {
      type: 'object',
      properties: {
        claims: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              claim: { type: 'string' },
              supported: { type: 'boolean' },
              evidence: { type: ['string', 'null'] },
            },
            required: ['claim', 'supported'],
          },
        },
      },
      required: ['claims'],
    },
    maxTokens: 2000,
  });

  if (!res) {
    return {
      claims: [
        {
          claim: 'Automated verification unavailable (no ANTHROPIC_API_KEY).',
          supported: false,
          evidence: null,
        },
      ],
      unsupportedCount: 0,
      overall: 'unverified',
      usedModel: false,
      model: 'none',
    };
  }

  const parsed = schema.safeParse(res.data);
  if (!parsed.success) {
    return { claims: [], unsupportedCount: 0, overall: 'unverified', usedModel: false, model: res.model };
  }

  const claims: VerificationClaim[] = parsed.data.claims.map((c) => ({
    claim: c.claim,
    supported: c.supported,
    evidence: c.evidence ?? null,
  }));
  const unsupportedCount = claims.filter((c) => !c.supported).length;

  return {
    claims,
    unsupportedCount,
    overall: unsupportedCount > 0 ? 'flags' : 'clean',
    usedModel: true,
    model: res.model,
  };
}

// Form-field mapping (DESIGN.md §4/§3). Deterministic rule-based mapping is the
// primary (field detection is largely rules); the model only resolves leftover
// ambiguous fields when a key is present. The model PROPOSES; the browser layer
// fills; everything is read back. Free-text criteria are NEVER auto-filled.

import { z } from 'zod';
import { structuredCall } from '../anthropic';
import { env } from '../env';

export interface DetectedField {
  selectorHint: string; // name/id/selector the automation layer will target
  detectedText: string; // label/aria/placeholder text detected on the page
  type?: string;
  required?: boolean;
}

export interface MappedField {
  selectorHint: string;
  detectedText: string;
  key: string;
  value: string | null;
  confidence: number;
  source: 'rule' | 'model' | 'none';
  fillable: boolean; // false for free-text / sensitive → surfaced for manual
}

export interface FieldMapResult {
  fields: MappedField[];
  usedModel: boolean;
  model: string;
}

// Canonical keys → matcher. Mirrors spikes/probe-ats.mjs CANON, kept in sync.
const RULES: { re: RegExp; key: string; fillable: boolean }[] = [
  { re: /first.?name|given.?name/, key: 'firstName', fillable: true },
  { re: /last.?name|surname|family.?name/, key: 'lastName', fillable: true },
  { re: /full.?name|^name$|your name/, key: 'fullName', fillable: true },
  { re: /e-?mail/, key: 'email', fillable: true },
  { re: /phone|mobile|contact.?number|telephone/, key: 'phone', fillable: true },
  { re: /ahpra|registration.?(number|no)|reg.?no/, key: 'ahpraNumber', fillable: true },
  { re: /address|street/, key: 'addressLine', fillable: true },
  { re: /suburb|city|town/, key: 'suburb', fillable: true },
  { re: /post.?code|zip/, key: 'postcode', fillable: true },
  { re: /linkedin/, key: 'linkedin', fillable: true },
  { re: /years.*experience|experience.*years/, key: 'yearsExperience', fillable: true },
  // Explicitly NOT auto-filled — the nurse's real effort lives here.
  { re: /cover.?letter|selection.?criteria|why.*(you|apply)|targeted.?question|tell us/, key: 'freeText', fillable: false },
  { re: /working.?rights|visa|citizen|resident|sponsor/, key: 'workRights', fillable: false },
];

function ruleMap(detectedText: string): { key: string; fillable: boolean } | null {
  const t = (detectedText || '').toLowerCase();
  for (const r of RULES) if (r.re.test(t)) return { key: r.key, fillable: r.fillable };
  return null;
}

export async function mapFields(
  fields: DetectedField[],
  profileValues: Record<string, string>,
): Promise<FieldMapResult> {
  const mapped: MappedField[] = [];
  const unresolved: DetectedField[] = [];

  for (const f of fields) {
    const r = ruleMap(f.detectedText);
    if (r) {
      mapped.push({
        selectorHint: f.selectorHint,
        detectedText: f.detectedText,
        key: r.key,
        value: r.fillable ? profileValues[r.key] ?? null : null,
        confidence: 0.9,
        source: 'rule',
        fillable: r.fillable && profileValues[r.key] != null,
      });
    } else {
      unresolved.push(f);
    }
  }

  // Resolve leftovers with the model only if a key is configured.
  if (unresolved.length) {
    const resolved = await modelResolve(unresolved, profileValues);
    mapped.push(...resolved.fields);
    return { fields: mapped, usedModel: resolved.usedModel, model: resolved.model };
  }

  return { fields: mapped, usedModel: false, model: 'rules' };
}

const schema = z.object({
  mappings: z.array(
    z.object({
      selectorHint: z.string(),
      key: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

async function modelResolve(
  fields: DetectedField[],
  profileValues: Record<string, string>,
): Promise<FieldMapResult> {
  const res = await structuredCall<z.infer<typeof schema>>({
    model: env.MODEL_HAIKU,
    system:
      'Map ambiguous web-form fields to a canonical profile key. Allowed keys: ' +
      `${Object.keys(profileValues).join(', ')}, freeText, unknown. ` +
      'Use freeText for cover-letter/selection-criteria style prose, unknown if you cannot tell. ' +
      'Return a confidence 0-1. Do not guess sensitive fields.',
    user: `FIELDS:\n${JSON.stringify(fields.map((f) => ({ selectorHint: f.selectorHint, detectedText: f.detectedText, type: f.type })), null, 2)}`,
    toolName: 'record_field_map',
    toolDescription: 'Record proposed field→key mappings with confidence.',
    schema: {
      type: 'object',
      properties: {
        mappings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              selectorHint: { type: 'string' },
              key: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['selectorHint', 'key', 'confidence'],
          },
        },
      },
      required: ['mappings'],
    },
    maxTokens: 800,
  });

  if (!res) {
    return {
      fields: fields.map((f) => ({
        selectorHint: f.selectorHint,
        detectedText: f.detectedText,
        key: 'unknown',
        value: null,
        confidence: 0,
        source: 'none' as const,
        fillable: false,
      })),
      usedModel: false,
      model: 'rules',
    };
  }

  const parsed = schema.safeParse(res.data);
  const byHint = new Map(parsed.success ? parsed.data.mappings.map((m) => [m.selectorHint, m]) : []);

  return {
    fields: fields.map((f) => {
      const m = byHint.get(f.selectorHint);
      const key = m?.key ?? 'unknown';
      const fillable = key !== 'freeText' && key !== 'unknown' && profileValues[key] != null;
      return {
        selectorHint: f.selectorHint,
        detectedText: f.detectedText,
        key,
        value: fillable ? profileValues[key] ?? null : null,
        // low-confidence fills are blanked per DESIGN — surfaced for manual instead
        confidence: m?.confidence ?? 0,
        source: 'model' as const,
        fillable: fillable && (m?.confidence ?? 0) >= 0.6,
      };
    }),
    usedModel: true,
    model: res.model,
  };
}

// Static config: portal adapter signatures (DESIGN.md §3) and the sponsorship
// classifier's phrase lists (DESIGN.md §5). Volatile migration facts (income
// thresholds, comparable countries, English benchmarks) live in the dated
// ReferenceFact table, NOT here.

export interface AdapterSig {
  pattern: string; // matched against the hostname/url
  vendor: string;
  note: string;
  priority: number; // build order from DESIGN §3
}

export const ADAPTER_SIGNATURES: AdapterSig[] = [
  { pattern: '.taleo.net', vendor: 'taleo', note: 'NSW Health, ACT Health, Healthscope', priority: 1 },
  { pattern: 'myworkdayjobs.com', vendor: 'workday', note: 'Ramsay, St Vincent’s', priority: 1 },
  { pattern: 'mercury.com.au', vendor: 'mercury', note: 'most VIC services; per-subdomain tenants', priority: 3 },
  { pattern: '/jobtools/', vendor: 'snaphire', note: 'QLD Health “Springboard” (in_organid=15550)', priority: 3 },
  { pattern: 'bigredsky.com', vendor: 'bigredsky', note: 'WA “CRAMS”, SA “I Work for SA”', priority: 3 },
  { pattern: 'pageuppeople.com', vendor: 'pageup', note: 'TasGov tenant 759, Ramsay legacy 953', priority: 3 },
  { pattern: 'smartrecruiters.com', vendor: 'smartrecruiters', note: 'VIC churn target', priority: 3 },
  { pattern: 'seek.com.au', vendor: 'seek', note: 'Quick Apply vs external redirect; discovery surface', priority: 4 },
];

export function fingerprintVendor(url: string): string {
  const u = url.toLowerCase();
  const hit = ADAPTER_SIGNATURES.find((a) => u.includes(a.pattern));
  return hit?.vendor ?? 'unknown';
}

// ── Sponsorship classifier phrase lists (exclusion scanned BEFORE positives) ──

// (1) Negation / exclusion → WORKING_RIGHTS_REQUIRED
export const EXCLUSION_PHRASES = [
  'sponsorship is not available',
  'no sponsorship',
  'unable to offer sponsorship',
  'not in a position to offer sponsorship',
  'cannot offer sponsorship',
  'will not sponsor',
  'unable to sponsor',
  'visa sponsorship is not',
  'must have permanent residency',
  'permanent residency required',
  'pr required',
  'permanent resident',
  'australian citizen',
  'citizens only',
  'full working rights',
  'unrestricted working rights',
  'must have the right to work in australia',
  'right to work in australia required',
  'ongoing work rights',
];

// (2) Positive → SPONSORSHIP_AVAILABLE
export const POSITIVE_PHRASES = [
  'sponsorship available',
  'visa sponsorship available',
  'willing to sponsor',
  'happy to sponsor',
  'able to offer sponsorship',
  'sponsorship may be available',
  'international applicants welcome',
  'overseas applicants welcome',
  'we welcome international',
  'dama',
  'designated area migration agreement',
  '482 visa',
  'subclass 482',
  'employer sponsored',
  'tss visa',
];

// (3) Conditional → CONDITIONAL
export const CONDITIONAL_PHRASES = [
  'sponsorship may be considered',
  'sponsorship considered for the right candidate',
  'may consider sponsorship',
  'sponsorship for exceptional candidates',
  'open to discussing sponsorship',
];

export const ANZSCO_RN = '254xxx'; // RN → ANZSCO 254 family

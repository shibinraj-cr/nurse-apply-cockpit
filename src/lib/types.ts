// Shared string-literal unions (mirroring the documented SQLite "enums") plus
// UI label/tone maps used by Badge/StatusPill. Keep this file dependency-light.

export type Tone = 'slate' | 'green' | 'red' | 'amber' | 'blue' | 'violet';

export const CANDIDATE_STATUSES = ['prospect', 'onboarding', 'active', 'placed', 'withdrawn'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const WORK_RIGHTS = ['citizen', 'pr', 'sponsored_visa', 'student', 'bridging', 'none', 'unknown'] as const;
export type WorkRights = (typeof WORK_RIGHTS)[number];

export const REGISTRATION_STATUSES = [
  'self_check',
  'oba_in_progress',
  'lodged',
  'under_assessment',
  'registered',
  'lapsed',
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const DOCUMENT_TYPES = [
  'resume',
  'cert',
  'ahpra',
  'passport',
  'english',
  'police',
  'wwcc',
  'reference',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const CONSENT_SCOPES = ['hold_docs', 'apply_on_behalf', 'disclose_to_employer'] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export const APPLICATION_STATUSES = [
  'queued',
  'drafting',
  'ready_for_review',
  'needs_manual',
  'submitted',
  'rejected',
  'interview',
  'offer',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const SPONSORSHIP_STATUSES = [
  'SPONSORSHIP_AVAILABLE',
  'WORKING_RIGHTS_REQUIRED',
  'CONDITIONAL',
  'UNKNOWN',
] as const;
export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number];

export const PROVISIONING_STATES = ['none', 'created', 'verified', 'locked'] as const;
export type ProvisioningState = (typeof PROVISIONING_STATES)[number];

// ── Label / tone maps for UI ────────────────────────────────────────────────

export const SPONSORSHIP_META: Record<SponsorshipStatus, { label: string; tone: Tone; short: string }> = {
  SPONSORSHIP_AVAILABLE: { label: 'Sponsorship available', tone: 'green', short: 'Sponsor' },
  WORKING_RIGHTS_REQUIRED: { label: 'Working rights required', tone: 'red', short: 'PR/WR' },
  CONDITIONAL: { label: 'Conditional', tone: 'amber', short: 'Cond.' },
  UNKNOWN: { label: 'Unknown (assume WR required)', tone: 'slate', short: 'Unknown' },
};

export const APPLICATION_META: Record<ApplicationStatus, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'slate' },
  drafting: { label: 'Drafting', tone: 'blue' },
  ready_for_review: { label: 'Ready for review', tone: 'violet' },
  needs_manual: { label: 'Needs manual', tone: 'amber' },
  submitted: { label: 'Submitted', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  interview: { label: 'Interview', tone: 'blue' },
  offer: { label: 'Offer', tone: 'green' },
  withdrawn: { label: 'Withdrawn', tone: 'slate' },
};

export const CANDIDATE_META: Record<CandidateStatus, { label: string; tone: Tone }> = {
  prospect: { label: 'Prospect', tone: 'slate' },
  onboarding: { label: 'Onboarding', tone: 'blue' },
  active: { label: 'Active', tone: 'green' },
  placed: { label: 'Placed', tone: 'violet' },
  withdrawn: { label: 'Withdrawn', tone: 'red' },
};

export const REGISTRATION_META: Record<RegistrationStatus, { label: string; tone: Tone }> = {
  self_check: { label: 'Self-check', tone: 'slate' },
  oba_in_progress: { label: 'OBA in progress', tone: 'blue' },
  lodged: { label: 'Lodged', tone: 'blue' },
  under_assessment: { label: 'Under assessment', tone: 'amber' },
  registered: { label: 'Registered', tone: 'green' },
  lapsed: { label: 'Lapsed', tone: 'red' },
};

export const WORK_RIGHTS_META: Record<WorkRights, { label: string; tone: Tone }> = {
  citizen: { label: 'AU citizen', tone: 'green' },
  pr: { label: 'Permanent resident', tone: 'green' },
  sponsored_visa: { label: 'Sponsored visa', tone: 'blue' },
  student: { label: 'Student visa', tone: 'amber' },
  bridging: { label: 'Bridging visa', tone: 'amber' },
  none: { label: 'No work rights', tone: 'red' },
  unknown: { label: 'Unknown', tone: 'slate' },
};

export const DOCUMENT_TYPE_META: Record<DocumentType, { label: string; sensitive: boolean; aiExcluded: boolean }> = {
  resume: { label: 'Résumé / CV', sensitive: false, aiExcluded: false },
  cert: { label: 'Certificate / qualification', sensitive: false, aiExcluded: false },
  ahpra: { label: 'AHPRA registration', sensitive: true, aiExcluded: true },
  passport: { label: 'Passport / ID', sensitive: true, aiExcluded: true },
  english: { label: 'English test (IELTS/OET)', sensitive: false, aiExcluded: false },
  police: { label: 'Police check', sensitive: true, aiExcluded: true },
  wwcc: { label: 'Working with Children Check', sensitive: true, aiExcluded: true },
  reference: { label: 'Reference', sensitive: false, aiExcluded: false },
  other: { label: 'Other', sensitive: false, aiExcluded: false },
};

export const CONSENT_SCOPE_META: Record<ConsentScope, { label: string; description: string }> = {
  hold_docs: {
    label: 'Hold documents',
    description: 'Store and hold the candidate’s documents and sensitive information.',
  },
  apply_on_behalf: {
    label: 'Apply on behalf',
    description: 'Prepare and assist applications using the candidate’s own account.',
  },
  disclose_to_employer: {
    label: 'Disclose to employer',
    description: 'Disclose specific documents to a specific named employer.',
  },
};

// Registration statuses that are considered "current enough" to submit applications.
export const REGISTRATION_OK_STATUSES: RegistrationStatus[] = ['registered'];

// Visa subclass → axis-B meaning.
export const SPONSORED_SUBCLASSES = ['482', '186', '494', '407', '457'];
export const SELF_PR_SUBCLASSES = ['189', '190', '491', '188', '888'];

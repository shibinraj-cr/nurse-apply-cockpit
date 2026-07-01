// Shared DB query + shape helpers used by API routes, server actions, and pages.
// Keeps Prisma-row → AI-shape conversion in one place. SERVER-ONLY.

import { prisma } from './db';
import { jsonArray } from './utils';
import { REGISTRATION_OK_STATUSES, type RegistrationStatus } from './types';
import type { CandidateShape, JobShape } from './ai/shapes';
import type { Candidate, Profile, RegistrationState, Job } from '@prisma/client';

export type CandidateWithCore = Candidate & {
  profile: Profile | null;
  registrationState: RegistrationState | null;
};

export function registrationOk(state: RegistrationState | null): boolean {
  if (!state) return false;
  return REGISTRATION_OK_STATUSES.includes(state.status as RegistrationStatus);
}

export function toCandidateShape(c: CandidateWithCore): CandidateShape {
  return {
    displayName: c.displayName,
    specialties: jsonArray<string>(c.profile?.specialties),
    yearsExp: c.profile?.yearsExp ?? 0,
    locations: jsonArray<string>(c.profile?.locations),
    registrationStatus: c.registrationState?.status ?? 'self_check',
    registrationOk: registrationOk(c.registrationState),
    workRights: c.profile?.workRights ?? 'unknown',
    masterCvText: c.profile?.masterCvText ?? null,
  };
}

export function toJobShape(j: Job): JobShape {
  return {
    title: j.title,
    employer: j.employer,
    location: j.location,
    specialty: j.specialty,
    worktype: j.worktype,
    rawText: j.rawText,
  };
}

export async function loadCandidateCore(id: string): Promise<CandidateWithCore | null> {
  return prisma.candidate.findUnique({
    where: { id },
    include: { profile: true, registrationState: true },
  });
}

/** Build the flat key→value map the field-mapper fills from. */
export function profileValuesFor(c: CandidateWithCore): Record<string, string> {
  const [firstName, ...rest] = c.displayName.split(/\s+/);
  const lastName = rest.join(' ');
  const out: Record<string, string> = {
    firstName: firstName ?? '',
    lastName: lastName ?? '',
    fullName: c.displayName,
    yearsExperience: String(c.profile?.yearsExp ?? ''),
  };
  if (c.profile?.ahpraRegNo && c.profile.ahpraVerified) out.ahpraNumber = c.profile.ahpraRegNo;
  // email/phone/address would come from contact fields when present in the model.
  return out;
}

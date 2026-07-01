// Plain input shapes for the AI modules, decoupled from Prisma row types so the
// pipeline is unit-testable and callers control exactly what is sent to the model.

export interface CandidateShape {
  displayName: string;
  specialties: string[];
  yearsExp: number;
  locations: string[];
  registrationStatus: string; // RegistrationStatus
  registrationOk: boolean; // derived: is registration current enough to apply?
  workRights: string; // WorkRights
  masterCvText?: string | null;
}

export interface JobShape {
  title: string;
  employer: string;
  location?: string | null;
  specialty?: string | null;
  worktype?: string | null;
  rawText: string;
}

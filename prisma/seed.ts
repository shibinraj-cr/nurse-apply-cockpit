import './seed-bootstrap';
import { prisma } from '../src/lib/db';
import { putBlob } from '../src/lib/storage';
import { putSecret } from '../src/lib/vault';
import { appendAudit } from '../src/lib/audit';
import { classifyHeuristic } from '../src/lib/ai/sponsorship';
import { rankHeuristic } from '../src/lib/ai/ranking';
import { ADAPTER_SIGNATURES } from '../src/lib/constants';
import { toJson } from '../src/lib/utils';
import type { CandidateShape } from '../src/lib/ai/shapes';

// ── Sample postings (rawText crafted to exercise each sponsorship class) ──────
const JOBS = [
  {
    source: 'taleo',
    externalId: 'NSWH-ICU-44021',
    title: 'Registered Nurse — Intensive Care Unit',
    employer: 'NSW Health (Sydney LHD)',
    location: 'Sydney, NSW',
    specialty: 'ICU',
    worktype: 'full_time',
    salary: '$72,152 - $101,299',
    url: 'https://nswhealth.taleo.net/careersection/jobdetail.ftl?job=44021',
    rawText:
      'An exciting opportunity exists for an experienced Registered Nurse to join our Intensive Care Unit. ' +
      'You will have current AHPRA registration as a Registered Nurse and a minimum of 3 years experience in critical care. ' +
      'Essential: demonstrated clinical competence, ability to work rotating rosters. We are committed to a diverse workforce.',
  },
  {
    source: 'manual',
    externalId: 'REGH-AGED-7781',
    title: 'Registered Nurse — Aged Care (Visa sponsorship available)',
    employer: 'Regional Health Group',
    location: 'Mildura, VIC',
    specialty: 'Aged Care',
    worktype: 'full_time',
    salary: 'Competitive + relocation',
    url: 'https://example.com/jobs/regh-aged-7781',
    rawText:
      'Regional Health Group is seeking Registered Nurses for our aged care facilities. ' +
      'Visa sponsorship is available for suitably qualified candidates and international applicants are welcome to apply. ' +
      'We can support eligible nurses with a 482 visa under a Designated Area Migration Agreement (DAMA). ' +
      'Current AHPRA registration required.',
  },
  {
    source: 'manual',
    externalId: 'METRO-ED-3310',
    title: 'Registered Nurse — Emergency Department',
    employer: 'Metro Private Hospital',
    location: 'Melbourne, VIC',
    specialty: 'Emergency',
    worktype: 'part_time',
    salary: undefined,
    url: 'https://example.com/jobs/metro-ed-3310',
    rawText:
      'We are recruiting Emergency Department nurses. Applicants must have full working rights in Australia; ' +
      'permanent residency required. Unfortunately we are unable to offer sponsorship for this role. ' +
      'AHPRA registration as a Registered Nurse is essential.',
  },
  {
    source: 'pageup',
    externalId: 'PVT-THEATRE-9020',
    title: 'Registered Nurse — Perioperative / Theatre',
    employer: 'St Heliers Private',
    location: 'Adelaide, SA',
    specialty: 'Theatre',
    worktype: 'full_time',
    salary: undefined,
    url: 'https://sthelier.pageuppeople.com/job/9020',
    rawText:
      'Perioperative Registered Nurse opportunity in our busy theatre suite. ' +
      'Sponsorship may be considered for the right candidate with significant perioperative experience. ' +
      'You will hold current AHPRA registration and have at least 5 years theatre experience.',
  },
];

const MARIA_CV = `MARIA SANTOS — Registered Nurse
Summary: Registered Nurse with 6 years experience in intensive care and emergency settings in the Philippines.
Experience:
- Senior Staff Nurse, ICU, St Luke's Medical Center, Manila (2019–2024) — 5 years
- Staff Nurse, Emergency Department, Makati Medical Center (2018–2019)
Education: Bachelor of Science in Nursing, University of Santo Tomas, 2017
Skills: ventilator management, ACLS, triage, IV therapy
English: IELTS Academic, Overall 7.5 (2023)`;

const AARAV_CV = `AARAV PATEL — Registered Nurse
Summary: Registered Nurse with 4 years experience in aged care and general medical wards.
Experience:
- Registered Nurse, Aged Care, Apollo Hospitals, Mumbai (2020–2024) — 4 years
Education: B.Sc Nursing, Maharashtra University of Health Sciences, 2019
English: OET, B grade across components (2024)
Registration: AHPRA Registered Nurse (Div 1)`;

async function main() {
  console.log('Seeding nurse-apply-cockpit…');

  // Wipe (idempotent reseed). Order respects FKs via cascade from Candidate/Job.
  await prisma.auditLog.deleteMany();
  await prisma.ranking.deleteMany();
  await prisma.sponsorshipClass.deleteMany();
  await prisma.application.deleteMany();
  await prisma.job.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.portalAdapter.deleteMany();
  await prisma.referenceFact.deleteMany();
  await prisma.blob.deleteMany();
  await prisma.vaultSecret.deleteMany();

  // ── Portal adapters (config-driven, versioned) ──
  for (const a of ADAPTER_SIGNATURES) {
    await prisma.portalAdapter.create({
      data: {
        hostnamePattern: a.pattern,
        vendor: a.vendor,
        version: 1,
        status: a.priority <= 1 ? 'healthy' : 'unknown',
        notes: a.note,
      },
    });
  }

  // ── Dated reference facts (volatile migration facts — never hardcoded) ──
  await prisma.referenceFact.createMany({
    data: [
      { key: 'tsmit_threshold', value: 'AUD 73,150', effectiveAt: new Date('2024-07-01'), source: 'Home Affairs TSMIT', notes: 'Temporary Skilled Migration Income Threshold' },
      { key: 'english_benchmark', value: 'IELTS 7.0 each band (or OET B)', effectiveAt: new Date('2024-01-01'), source: 'NMBA English standard' },
      { key: 'comparable_country', value: 'Canada, Ireland, NZ, UK, USA, Singapore, Hong Kong', effectiveAt: new Date('2024-01-01'), source: 'NMBA streamlined pathway' },
    ],
  });

  // ── Jobs + sponsorship classification (deterministic heuristic) ──
  const jobRows = [];
  for (const j of JOBS) {
    const job = await prisma.job.create({ data: { ...j } });
    const cls = classifyHeuristic(job.rawText);
    await prisma.sponsorshipClass.create({
      data: {
        jobId: job.id,
        status: cls.status,
        evidenceQuote: cls.evidenceQuote,
        confidence: cls.confidence,
        visaSubclass: cls.visaSubclass,
        method: cls.method,
      },
    });
    jobRows.push(job);
    await appendAudit({ actor: 'seed', action: 'job.create', entityRef: `job:${job.id}`, after: { title: job.title, sponsorship: cls.status } });
  }
  const [jobICU, jobAged, jobED, jobTheatre] = jobRows;

  // Helper to make a resume document (encrypted at rest) from text.
  async function addResume(candidateId: string, text: string) {
    const stored = await putBlob(Buffer.from(text, 'utf8'));
    const doc = await prisma.document.create({ data: { candidateId, type: 'resume', label: 'Master résumé' } });
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        blobRef: stored.blobRef,
        filename: 'resume.txt',
        mime: 'text/plain',
        sizeBytes: stored.sizeBytes,
        sha256: stored.sha256,
        isCurrent: true,
      },
    });
  }

  async function addExpiringDoc(candidateId: string, type: string, filename: string, daysOut: number) {
    const stored = await putBlob(Buffer.from(`sample ${type} for ${candidateId}`, 'utf8'));
    const doc = await prisma.document.create({ data: { candidateId, type } });
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        blobRef: stored.blobRef,
        filename,
        mime: 'application/pdf',
        sizeBytes: stored.sizeBytes,
        sha256: stored.sha256,
        isCurrent: true,
        validUntil: new Date(Date.now() + daysOut * 24 * 60 * 60 * 1000),
      },
    });
  }

  // ── Candidate 1: Maria Santos (needs sponsorship; under assessment) ──
  const maria = await prisma.candidate.create({
    data: {
      displayName: 'Maria Santos',
      status: 'active',
      notes: 'Filipino RN, ICU/Emergency. Seeking sponsored roles.',
      profile: {
        create: {
          specialties: toJson(['ICU', 'Emergency', 'Critical care']),
          yearsExp: 6,
          locations: toJson(['Sydney', 'Melbourne']),
          workRights: 'unknown',
          selfCheckStream: 'B',
          pathway: 'streamlined2',
          masterCvText: MARIA_CV,
          englishTest: toJson({ type: 'IELTS', overall: 7.5, date: '2023-08-01' }),
        },
      },
      registrationState: { create: { status: 'under_assessment', division: 'RN_Div1' } },
    },
  });
  await addResume(maria.id, MARIA_CV);
  await addExpiringDoc(maria.id, 'english', 'ielts.pdf', 40);
  await addExpiringDoc(maria.id, 'passport', 'passport.pdf', 380);
  await prisma.consentRecord.createMany({
    data: [
      { candidateId: maria.id, scope: 'hold_docs' },
      { candidateId: maria.id, scope: 'apply_on_behalf', expiry: new Date(Date.now() + 180 * 86400000) },
    ],
  });
  const mariaPortal = await prisma.portalAccount.create({
    data: {
      candidateId: maria.id,
      portal: 'taleo',
      tenantUrl: 'https://nswhealth.taleo.net',
      username: 'maria.santos',
      provisioningState: 'verified',
      browserProfileId: `profile-${maria.id.slice(0, 6)}-taleo`,
      mfaNotes: 'SMS OTP to registered mobile',
    },
  });
  const mariaVaultRef = await putSecret({ username: 'maria.santos', password: 'sample-not-real' });
  await prisma.credential.create({
    data: { portalAccountId: mariaPortal.id, vaultRef: mariaVaultRef },
  });
  await appendAudit({ actor: 'seed', action: 'candidate.create', candidateId: maria.id, after: { displayName: maria.displayName } });

  // ── Candidate 2: Aarav Patel (registered, 482 — eligible end-to-end) ──
  const aarav = await prisma.candidate.create({
    data: {
      displayName: 'Aarav Patel',
      status: 'active',
      notes: 'Indian RN, aged care. On 482; AHPRA registered.',
      profile: {
        create: {
          ahpraRegNo: 'NMW0001234567',
          ahpraVerified: true,
          specialties: toJson(['Aged Care', 'Medical']),
          yearsExp: 4,
          locations: toJson(['Mildura', 'Melbourne']),
          workRights: 'sponsored_visa',
          visaSubclass: '482',
          selfCheckStream: 'A',
          pathway: 'streamlined1',
          masterCvText: AARAV_CV,
          englishTest: toJson({ type: 'OET', overall: 'B', date: '2024-02-01' }),
        },
      },
      registrationState: { create: { status: 'registered', division: 'RN_Div1', expiry: new Date(Date.now() + 300 * 86400000) } },
    },
  });
  await addResume(aarav.id, AARAV_CV);
  await addExpiringDoc(aarav.id, 'ahpra', 'ahpra-cert.pdf', 300);
  await addExpiringDoc(aarav.id, 'police', 'police-check.pdf', 150);
  const aaravConsent = await prisma.consentRecord.create({
    data: { candidateId: aarav.id, scope: 'apply_on_behalf', expiry: new Date(Date.now() + 365 * 86400000) },
  });
  await prisma.consentRecord.create({ data: { candidateId: aarav.id, scope: 'hold_docs' } });
  await appendAudit({ actor: 'seed', action: 'candidate.create', candidateId: aarav.id, after: { displayName: aarav.displayName } });

  // ── Candidate 3: Grace Okafor (PR, registered, but NO apply_on_behalf consent) ──
  const grace = await prisma.candidate.create({
    data: {
      displayName: 'Grace Okafor',
      status: 'onboarding',
      notes: 'Nigerian RN, theatre. PR holder. Consent for apply-on-behalf still pending.',
      profile: {
        create: {
          ahpraRegNo: 'NMW0007654321',
          ahpraVerified: true,
          specialties: toJson(['Theatre', 'Perioperative']),
          yearsExp: 8,
          locations: toJson(['Adelaide']),
          workRights: 'pr',
          pathway: 'oba',
        },
      },
      registrationState: { create: { status: 'registered', division: 'RN_Div1', expiry: new Date(Date.now() + 200 * 86400000) } },
    },
  });
  await prisma.consentRecord.create({ data: { candidateId: grace.id, scope: 'hold_docs' } });
  await appendAudit({ actor: 'seed', action: 'candidate.create', candidateId: grace.id, after: { displayName: grace.displayName } });

  // ── Candidate 4: Linh Tran (early-stage prospect) ──
  const linh = await prisma.candidate.create({
    data: {
      displayName: 'Linh Tran',
      status: 'prospect',
      notes: 'Vietnamese RN, mental health. Self-check stage.',
      profile: {
        create: {
          specialties: toJson(['Mental Health']),
          yearsExp: 3,
          locations: toJson(['Melbourne']),
          workRights: 'student',
        },
      },
      registrationState: { create: { status: 'self_check' } },
    },
  });
  await appendAudit({ actor: 'seed', action: 'candidate.create', candidateId: linh.id, after: { displayName: linh.displayName } });

  // ── Rankings (deterministic heuristic) ──
  const shapeFor = (name: string, specialties: string[], years: number, locs: string[], regStatus: string, regOk: boolean, cv: string): CandidateShape => ({
    displayName: name,
    specialties,
    yearsExp: years,
    locations: locs,
    registrationStatus: regStatus,
    registrationOk: regOk,
    workRights: 'unknown',
    masterCvText: cv,
  });
  const mariaShape = shapeFor('Maria Santos', ['ICU', 'Emergency', 'Critical care'], 6, ['Sydney', 'Melbourne'], 'under_assessment', false, MARIA_CV);
  const aaravShape = shapeFor('Aarav Patel', ['Aged Care', 'Medical'], 4, ['Mildura', 'Melbourne'], 'registered', true, AARAV_CV);

  for (const [cand, shape, job] of [
    [maria, mariaShape, jobICU],
    [maria, mariaShape, jobED],
    [aarav, aaravShape, jobAged],
  ] as const) {
    const r = rankHeuristic(shape, { title: job.title, employer: job.employer, location: job.location, specialty: job.specialty, worktype: job.worktype, rawText: job.rawText });
    await prisma.ranking.create({
      data: {
        jobId: job.id,
        candidateId: cand.id,
        fitScore: r.fitScore,
        specialtyMatch: r.specialtyMatch,
        locationMatch: r.locationMatch,
        experienceGapYears: r.experienceGapYears,
        registrationOk: r.registrationOk,
        rationale: r.rationale,
        model: r.model,
        stage: 'interactive',
      },
    });
  }

  // ── Applications ──
  // Maria → ICU (drafting, tailored)
  await prisma.application.create({
    data: {
      candidateId: maria.id,
      jobId: jobICU.id,
      portal: jobICU.source,
      portalAccountId: mariaPortal.id,
      status: 'drafting',
      tailoredResume: MARIA_CV,
      tailoredCoverLetter: 'Dear Hiring Manager, I am writing to apply for the ICU Registered Nurse position…',
    },
  });
  // Grace → Theatre (ready_for_review; will be blocked at submit by missing apply_on_behalf consent)
  await prisma.application.create({
    data: { candidateId: grace.id, jobId: jobTheatre.id, portal: jobTheatre.source, status: 'ready_for_review' },
  });
  // Aarav → Aged (submitted with attestation + frozen docs)
  const aaravDocs = await prisma.documentVersion.findMany({
    where: { isCurrent: true, document: { candidateId: aarav.id } },
  });
  const submitted = await prisma.application.create({
    data: {
      candidateId: aarav.id,
      jobId: jobAged.id,
      portal: jobAged.source,
      status: 'submitted',
      tailoredResume: AARAV_CV,
      tailoredCoverLetter: 'Dear Hiring Manager, I am applying for the Aged Care Registered Nurse role…',
      consentRecordId: aaravConsent.id,
      reviewerId: 'Operator (seed)',
      attestationText: 'Reviewed all content against verified facts.',
      attestationTs: new Date(),
      submittedAt: new Date(),
      followUpAt: new Date(Date.now() + 7 * 86400000),
      docVersionsAttached: toJson(aaravDocs.map((v) => ({ documentVersionId: v.id, sha256: v.sha256, filename: v.filename }))),
    },
  });
  await appendAudit({ actor: 'Operator (seed)', action: 'application.attest_submit', candidateId: aarav.id, entityRef: `application:${submitted.id}`, after: { status: 'submitted' } });

  const counts = {
    candidates: await prisma.candidate.count(),
    jobs: await prisma.job.count(),
    applications: await prisma.application.count(),
    adapters: await prisma.portalAdapter.count(),
    audit: await prisma.auditLog.count(),
  };
  console.log('Seed complete:', counts);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

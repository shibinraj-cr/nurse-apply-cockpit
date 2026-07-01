# Nurse Application Cockpit

An AI operator cockpit that helps one DesGro/DesMa staff member assist 100+ internationally-qualified
Registered Nurse candidates applying to Australian jobs (Seek + public-hospital & private ATS),
routing by **visa sponsorship available** vs **PR / full-working-rights required**.

**Scope (v1):** assisted, human-in-the-loop. The AI does discovery, ranking, sponsorship
classification, anti-fabrication CV/cover-letter tailoring, and tracking; autofill is a **best-effort
accelerator** the operator reviews and submits. The operator creates accounts, logs in (incl. MFA),
reviews, and clicks Submit — by design, for both compliance and integrity. See [DESIGN.md](DESIGN.md)
for the full architecture, data model, AI pipeline, privacy/ToS posture, and phased roadmap.

## Status: Phase 0 scaffold + Phase 1 slice (runnable cockpit)

The operator cockpit is built and runnable. It implements the Phase 0 scaffold and the
core of the Phase 1 vertical slice from [DESIGN.md](DESIGN.md) §7:

- **Candidate roster + isolated active-candidate context** — unmissable banner showing
  *whose* account is active; switching is audited (wrong-account is a notifiable breach).
- **AI pipeline** (`@anthropic-ai/sdk`, degrades to deterministic heuristics with **no key**):
  job-fit ranking, sponsorship classification (exclusion-before-positive, verbatim evidence,
  UNKNOWN default), grounding-only CV/cover-letter tailoring, a separate anti-fabrication
  verification pass, résumé parsing, and form-field mapping.
- **Encrypted-at-rest** document vault (AES-256-GCM) + zero-knowledge **credential vault**
  with just-in-time fetch and an immutable access log.
- **Consent (APP 3)** capture + scoped, with **day-one revocation** that halts/withdraws
  in-flight applications.
- **Hash-chained, append-only audit log** with a live chain-verify check.
- **Human-in-the-loop applications**: tailor → verify → pre-submit identity confirmation →
  truthfulness attestation → submit (documents frozen + hashed). Nothing auto-submits.
- **Automation-layer seam** (`src/lib/automation/`) binding candidate ↔ isolated browser
  profile with a wrong-account hard-stop; the live driver remains the Playwright spikes.

### Running the cockpit

Needs a **PostgreSQL** database (encrypted document blobs + vaulted credentials are stored in
the DB so it deploys to serverless hosts). Set `DATABASE_URL` + `DIRECT_URL` in `.env` first
(a Neon free branch, or `docker run -e POSTGRES_PASSWORD=pw -p 5432:5432 postgres:16`).

```bash
cp .env.example .env    # set DATABASE_URL + DIRECT_URL to your Postgres
npm install             # installs deps + runs `prisma generate`
npm run setup           # pushes the schema + seeds sample data
npm run dev             # http://localhost:3000  (operator password: cockpit-dev)
```

AI features are **optional**: set `ANTHROPIC_API_KEY` in `.env` to use live models, or leave
it blank to run the deterministic heuristic / no-key fallbacks. Useful scripts: `npm run build`,
`npm run db:reset` (wipe + reseed), `npm run db:seed`. **Deploying to Vercel:** see
[DEPLOY.md](DEPLOY.md).

### Week-1 de-risk spikes (still the viability gate)

The cockpit is the *assisted* product; the spikes in [`spikes/`](spikes/README.md) still gate
scaling decisions and the first-portal choice — record outcomes in `SPIKE-RESULTS.md`:
1. Throughput dry run → realistic apps/day/operator (the business-case gate)
2. ATS fill-reliability probe → can we actually autofill the target ATS?
3. Session / MFA persistence → does a per-candidate login survive across runs?
4. Legal / ToS gate → is the on-behalf model defensible; is there a sanctioned pathway?

## Planned stack
- **Cockpit web app:** Next.js (App Router) + TypeScript, Postgres via Prisma
- **AI backend:** `@anthropic-ai/sdk` — Sonnet 4.6 (ranking, tailoring, parsing), Haiku 4.5
  (sponsorship classification, verification, simple field-mapping); strict structured outputs +
  prompt caching of the candidate profile
- **Automation layer:** Playwright/CDP desktop driver with a persistent isolated browser profile
  per candidate (handles MFA logins, dropzone uploads via filechooser, read-back verification)
- **Storage:** encrypted-at-rest documents + a zero-knowledge credential vault

## Repo layout (current)
```
DESIGN.md            full design & build plan (v2, corrected)
README.md            this file
prisma/              schema.prisma (full data model) + seed.ts (sample candidates/jobs)
src/
  app/               Next.js App Router — login, (app) cockpit pages, api/ai/* routes
  components/        UI primitives, active-candidate banner, tailoring studio
  lib/
    ai/              ranking, sponsorship, tailoring, verification, parsing, fieldmap
    actions/         server actions (candidates, profile, documents, jobs, apps, consent)
    automation/      cockpit-side seam for the Playwright driver (wrong-account hard-stop)
    crypto.ts, storage.ts, vault.ts, audit.ts, auth.ts, session.ts, db.ts, …
spikes/              Week-1 de-risk toolkit (Playwright probes + protocols + templates)
```

> Built on Next.js 15 (App Router) + TypeScript, Prisma + SQLite (Postgres-ready),
> Tailwind, and `@anthropic-ai/sdk`. See [DESIGN.md](DESIGN.md) for the full architecture.

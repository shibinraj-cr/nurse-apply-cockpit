# Nurse Application Cockpit

An AI operator cockpit that helps one DesGro/DesMa staff member assist 100+ internationally-qualified
Registered Nurse candidates applying to Australian jobs (Seek + public-hospital & private ATS),
routing by **visa sponsorship available** vs **PR / full-working-rights required**.

**Scope (v1):** assisted, human-in-the-loop. The AI does discovery, ranking, sponsorship
classification, anti-fabrication CV/cover-letter tailoring, and tracking; autofill is a **best-effort
accelerator** the operator reviews and submits. The operator creates accounts, logs in (incl. MFA),
reviews, and clicks Submit — by design, for both compliance and integrity. See [DESIGN.md](DESIGN.md)
for the full architecture, data model, AI pipeline, privacy/ToS posture, and phased roadmap.

## Status: Week-1 de-risk spikes

We are validating viability before building. See [`spikes/`](spikes/README.md):
1. Throughput dry run → realistic apps/day/operator (the business-case gate)
2. ATS fill-reliability probe → can we actually autofill the target ATS?
3. Session / MFA persistence → does a per-candidate login survive across runs?
4. Legal / ToS gate → is the on-behalf model defensible; is there a sanctioned pathway?

Record outcomes in `SPIKE-RESULTS.md`; those gate Phase 0 (scaffold) and the first-portal choice.

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
spikes/              Week-1 de-risk toolkit (Playwright probes + protocols + templates)
```

# Spike #1 — Throughput Dry Run (the business-case gate)

**Goal:** get a realistic number for *applications per operator per day* under the real workflow
(manual account creation + manual MFA login + human review + often-manual upload). This single number
validates or kills the 100-candidate model before any code is written.

## Protocol
1. Pick **5 real candidates** (or representative profiles) and **one target employer/ATS**.
2. For each candidate, do the **fully manual** end-to-end flow and time each stage with a stopwatch:
   - create the portal account (email verify + phone OTP + CAPTCHA)
   - log in (note if MFA fired and whether it succeeded first try)
   - find a suitable posting
   - tailor resume + cover letter (manually, as you do today)
   - fill the application form
   - upload documents (note: did the upload work, or fight you?)
   - review + submit
3. Do **3 applications per candidate** (so login/session reuse effects show up).
4. Record every row in `throughput-dryrun-template.csv`.

## The numbers that matter
- **Median minutes per application** (after account exists) → implies apps/day at, say, 6 focused hours.
- **Account-creation minutes** (one-off per candidate per portal) → the hidden tax at scale.
- **MFA-login failure rate** → how often a session can't be reused cleanly.
- **% applications where upload was manual** → caps how much autofill can ever save.

## Decision rule (suggested)
- If realistic **apps/day/operator ≥ ~20** and most time is in tailoring/review (not mechanics) →
  the cockpit's AI tailoring + tracking is the big win; proceed.
- If **< ~10** and dominated by account-creation/login/upload friction → rethink the operating model
  (more operators? candidate self-service for account + submit? narrower portal set?) before building.

Write the conclusion into `../SPIKE-RESULTS.md`.

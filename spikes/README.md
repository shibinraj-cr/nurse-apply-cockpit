# Week-1 De-risk Spikes

Run these **before** building the cockpit. They answer the three questions that decide whether
the whole project is viable. Cheap to run, decisive in outcome.

| # | Spike | What it answers | Who runs it |
|---|-------|-----------------|-------------|
| 1 | **Throughput dry run** (`throughput-protocol.md`) | Realistic applications/day/operator, MFA failure rate, % manual uploads | Human operator |
| 2 | **ATS fill-reliability** (`probe-ats.mjs`) | % of fields auto-identifiable, % fills that stick, settable upload vs dropzone | You + script |
| 3 | **Session / MFA persistence** (`session-spike.mjs`) | Does a per-candidate login (with MFA) persist across runs? | You + script |
| 4 | **Legal / ToS gate** (`legal-tos-checklist.md`) | Is the on-behalf model defensible? Sanctioned Seek pathway? | Lawyer + Seek |

## Setup (once)
```bash
cd spikes
npm install
npx playwright install chromium
```

## Spike #3 — session / MFA persistence
```bash
# First run: a real Chrome window opens. Log in manually + complete MFA. Press Enter when done.
node session-spike.mjs --profile ./profiles/jane-doe --url "https://<portal-login-url>"

# Second run, SAME profile: you should open already logged in. That's the proof. ✅
node session-spike.mjs --profile ./profiles/jane-doe --url "https://<portal-login-url>"
```
Each candidate gets their own `--profile` dir → isolated cookies/session. `profiles/` is gitignored.

## Spike #2 — ATS fill-reliability
Log in first (spike #3), then point the probe at a real application form **reusing the same profile**:
```bash
# Analysis only (safe — reads the form, fills nothing):
node probe-ats.mjs --profile ./profiles/jane-doe --url "https://<application-form-url>"

# With dry-run fill (dummy values, NEVER submits — measures the real autofill number):
node probe-ats.mjs --profile ./profiles/jane-doe --url "https://<application-form-url>" --fill
```
It scans every frame (Taleo iframes its form), reports vendor, field-identification rate, fill-stick
rate, and whether the upload is a settable `<input type=file>` or a manual dropzone. A JSON report
lands in `reports/`.

**Run #2 across ~10 real RN postings on your target ATS** (Workday or Taleo first). Record the
numbers. If field-ID + fill-stick rates are high and uploads are settable → autofill is worth
building. If low / dropzone-only → the cockpit's value is discovery + ranking + tailoring + tracking,
and autofill stays best-effort. Either way you'll know before committing.

## What to do with the results
Fill in `../SPIKE-RESULTS.md` (create it) with the four numbers:
1. apps/day/operator, 2. fill-stick %, 3. upload = settable/manual per portal, 4. legal go/no-go.
Those gate Phase 0 (scaffold) and the first-portal choice.

> Reminder: these spikes do **not** submit anything and do **not** automate login or CAPTCHA — the
> human always logs in and (later) submits. That's the compliance posture by design.

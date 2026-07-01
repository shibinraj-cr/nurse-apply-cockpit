# Assisted desktop driver (Seek)

A **local, human-in-the-loop** driver that connects a candidate's own Seek session,
pulls jobs into the cockpit for ranking, and pre-fills applications for you to
**review and submit**. It runs on your machine (needs a real browser) — **not** on
Vercel — and talks to the cockpit over HTTP with a shared `DRIVER_TOKEN`.

> **Compliance posture (read this).** Operating a candidate's personal Seek account
> on their behalf is restricted by Seek's Terms. This tool is built so a **human**
> does the parts that matter: **you** complete the email-code login, **you** review
> every pre-filled value, and **you** click Submit. It does **not** log in headlessly,
> scrape Seek server-side, burst requests, solve CAPTCHAs, or auto-submit. Get an
> Australian legal opinion (spikes/legal-tos-checklist.md) and per-candidate consent
> before using it at scale. It reads only the DOM of pages **you** have opened.

## Setup

```bash
cd driver
npm install
npx playwright install chromium
export DRIVER_TOKEN="<same value as the cockpit's DRIVER_TOKEN env var>"
export COCKPIT_URL="http://localhost:3000"   # or your deployed https URL
```

On the cockpit side, set `DRIVER_TOKEN` (a long random string) in `.env` / Vercel env,
and give each candidate an **email** on their profile (used for Seek login + autofill).

## Workflow

```bash
# 1) See candidates
node connect.mjs

# 2) Connect this candidate's Seek session (isolated profile).
#    Prefills the email; YOU enter the code from their email + finish login. Session persists.
node connect.mjs --candidate <id> --email nurse@example.com

# 3) Fetch jobs: run a Seek search in the window, then read + rank the results.
node fetch-jobs.mjs --candidate <id>
#    → jobs land in the cockpit (Jobs & ranking), classified + ranked for the candidate.

# 4) Assisted apply: open a Seek application, pre-fill from the profile, read back.
node apply.mjs --candidate <id> --url "<seek application url>"
#    → prints what filled / what needs manual entry. YOU review + click Submit.
```

Each candidate gets an isolated `profiles/<browserProfileId>` dir (gitignored), so
sessions never cross — the cockpit binds candidate ↔ profile and rejects mismatches.

## What it does / doesn't

- **Does:** open the right isolated profile, prefill the login email, read jobs from
  your open search page, rank them, pre-fill application fields (native-setter + events)
  and read back, surface what needs manual entry.
- **Doesn't:** enter your login code, bypass MFA/CAPTCHA, upload documents to dropzones,
  fill free-text selection criteria, or submit. Those stay with the human.

Selectors live in `lib/seek.mjs` — tune them there if Seek changes its markup.

# Automation layer (skeleton)

The **live** browser automation does **not** run inside this Next.js app. Per DESIGN.md
§1 it is a separate **Playwright/CDP desktop driver** with one persistent, isolated
`userDataDir` per candidate. The proofs-of-concept live in [`../../../spikes`](../../../spikes):

- `session-spike.mjs` — persistent isolated profile + MFA session survives across runs.
- `probe-ats.mjs` — field-identification + fill-stick + settable-upload vs dropzone probe.

## What the cockpit owns (this folder)

`profile-binding.ts` is the cockpit-side contract the driver consults so it can never
act on the wrong account:

- `resolveBoundSession(candidateId, portalAccountId)` → the isolated `browserProfileId`
  to launch, **only if** the portal account truly belongs to that candidate.
- `assertActiveMatchesBinding(...)` → re-checks the active candidate against the bound
  session right before fill/submit. Any mismatch throws `WrongAccountError` (hard stop).

## The compliance posture (unchanged by software)

- The **human** logs in, handles MFA/CAPTCHA, reviews, and clicks **Submit**.
- Autofill is **best-effort**: the field-mapper (`src/lib/ai/fieldmap.ts`) proposes values;
  the driver fills and **reads back**; low-confidence / free-text / sensitive fields are
  surfaced for manual entry, never auto-filled.
- Credentials are fetched **just-in-time** from the vault (`src/lib/vault.ts`) and every
  fetch writes an immutable `VaultAccessEvent`.

## Wiring the real driver (future)

A desktop driver (Electron/Node) imports `resolveBoundSession`, launches
`chromium.launchPersistentContext(profileDirFor(browserProfileId))`, navigates to the
ATS, pulls a fill plan from `POST /api/ai/fieldmap`, fills + reads back, and hands the
review surface to the operator. Nothing here auto-submits.

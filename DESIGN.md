# DesGro Nurse Application Cockpit — Design & Build Plan (v2, corrected)

> One operator (DesGro/DesMa staff) manages 100+ internationally-qualified RN candidates and
> helps them apply to Australian jobs (Seek + public-hospital & private ATS), routing by
> "visa sponsorship available" vs "PR / full-working-rights required."
> Built grounded in a 7-thread research fan-out + two adversarial critique passes.

---

## 0. Three hard truths the research surfaced (read first)

1. **The exact "one button auto-applies for 100 nurses via their own accounts" mechanic is prohibited by the platforms.**
   Seek's candidate Terms expressly forbid applying on behalf of another party (s8(f)), sharing
   login credentials (s8(g)), and automated access (s9(b)/s7(d)). Hospital ATS portals are
   per-applicant accounts in the same spirit. **No software control removes this** — it's a
   business/legal risk to accept consciously, not an engineering problem to solve.

2. **Even ignoring ToS, throughput is human-capped.** Every application still needs: a manually
   created portal account (email verify + phone OTP + CAPTCHA), a per-session login that usually
   triggers MFA, a human review, and (frequently) a manual file upload. Realistic ceiling is
   **low double-digits of applications per operator per day**, not hundreds. This number makes or
   breaks the business case and must be measured before building at scale.

3. **Autofill is best-effort, not guaranteed.** Modern ATS (Workday, SmartRecruiters, newer Taleo)
   use React/controlled components and drag-drop / presigned-S3 uploaders with **no settable
   `<input type=file>`**. The `DataTransfer` upload trick and `.value`+events fills will silently
   fail on a meaningful fraction of fields. Treat every fill as *unverified until read back*.

**Implication:** the durable, defensible, genuinely time-saving product is an **AI operator
cockpit** — discovery + ranking + sponsorship classification + anti-fabrication CV/cover-letter
tailoring + consent/audit/tracking — with **assisted autofill as an accelerator**, not an
unattended auto-apply robot.

---

## 1. System architecture

| Component | Tech | Responsibility |
|---|---|---|
| **Operator Web App** (cockpit) | Next.js (App Router) + TS, Postgres via Prisma | Candidate roster + switcher, per-candidate document vault, cross-candidate work queue & status dashboard, consent/audit views, tailoring review. Single operator login (NextAuth, one seat). |
| **AI Backend** | Next.js API routes + `@anthropic-ai/sdk` | Ranking, sponsorship classification, resume parsing, CV/cover-letter tailoring + anti-fabrication verification, field-mapping proposals. Owns Anthropic key + prompt-cache discipline + strict structured outputs. |
| **Automation layer** | **Playwright/CDP local desktop app** (recommended) *or* Chrome MV3 extension | Drives a persistent, isolated browser context per candidate; pre-fills forms; renders a review surface; hands login/MFA/CAPTCHA/Submit to the human. |
| **Credential / session layer** | Zero-knowledge vault (Bitwarden/1Password pattern) + per-candidate `userDataDir` | Holds 100+ portal logins encrypted; supplies the right creds to the right isolated profile just-in-time; MFA + per-credential access logging. |
| **Document & secret storage** | Encrypted at rest (see §6) | Resumes, certs, AHPRA/passport/English/police/WWCC/references, credentials. |

**Tech fork (the single biggest decision): Playwright desktop app vs MV3 extension.**
The critique strongly favours **Playwright/CDP with a persistent per-candidate `userDataDir`** over
an MV3 extension because it gives: persistent isolated sessions (no MV3 ~30s worker-death class of
bugs), **real file-chooser interception** (`page.on('filechooser')`) that handles dropzone uploaders
the `DataTransfer` hack cannot, stable multi-step fill state, and straightforward read-back
verification. The extension's only edge — "runs in the operator's normal browser" — is outweighed
for a stateful login+fill+review workflow at 100-candidate scale.

### Data flow: pick candidate → discover → rank → tailor → pre-fill → operator submits → track
```
[1] Operator picks Candidate → ACTIVE CANDIDATE set → that candidate's ISOLATED browser
        context opened → vault supplies creds just-in-time. Operator logs in (handles MFA).
[2] DISCOVER: prefer Seek email job alerts + ATS-native feeds (RSS/JSON) parsed server-side;
        DOM read only on operator-opened pages as fallback. (Decouple discovery from apply.)
[3] RANK: postings → backend → synchronous Haiku/Sonnet fit-score vs cached candidate profile.
        Sponsorship classified in the same pass. (Batch API only for overnight roster re-scoring.)
[4] TAILOR: chosen job → Sonnet tailors resume + cover letter GROUNDED ONLY in verified master CV
        → separate verification pass diffs claims → operator reviews/edits.
[5] PRE-FILL: detect ATS → load adapter → map profile→fields (native setter + input/change;
        per-framework strategies for React) → set files via filechooser → READ BACK every value.
[6] OPERATOR SUBMITS: review surface shows WHOSE account is active + every value + doc versions.
        CAPTCHA/MFA → pause for human. Operator ticks "I confirm all statements are true" → Submit.
[7] TRACK: Application row (candidate, job, portal, doc versions, consent, credential-access event,
        reviewer, attestation, timestamp). Follow-ups scheduled. Status → dashboard.
```

### Per-candidate session/credential seam (highest-integrity risk)
- **One isolated browser profile per nurse**; extension/app binds active-candidate ID ↔ profile;
  mismatch = hard stop. Submitting A's app while logged in as B is a **notifiable privacy breach**.
- Active candidate is a single source of truth, shown unmissably ("Logged in as: Jane Doe / passport …1234").
- **Pre-submit identity confirmation** re-displays whose account + which documents.
- Credentials fetched just-in-time, never written to disk / `chrome.storage.local` (unencrypted).
- Vault = single point of failure → MFA, per-credential ACL, immutable access log.

---

## 2. Data model (candidate-centric)
```
Candidate          id, displayName, status, notes, createdAt
 ├─ Profile        AHPRA/NMBA regNo (VERIFIED, locked), specialties[], yearsExp, locations[],
 │                 qualifications[], englishTest{type,scores,date}, workRights/visaStatus,
 │                 selfCheckStream(A/B/C), pathway(streamlined1/2|OBA), referees[]
 ├─ RegistrationState  status(self_check|oba_in_progress|lodged|under_assessment|registered),
 │                     division(RN_Div1|EN), endorsements[], expiry, conditions[]   ← STATEFUL, gates apps
 ├─ Document[]     type(resume|cert|ahpra|passport|english|police|wwcc|reference)
 │   └─ DocumentVersion  blobRef(encrypted), filename, mime, sha256, validFrom, validUntil,
 │                       createdAt, isCurrent          ← expiry tracked, not just versioning
 ├─ PortalAccount  portal, tenant/url, username, provisioningState(none|created|verified|locked)
 │   ├─ Credential vaultRef (NOT plaintext), lastRotated, mfaNotes
 │   └─ browserProfileId
 ├─ ConsentRecord[] scope(hold_docs|apply_on_behalf|disclose_to_employer), employer?, signedAt,
 │                  expiry, revokedAt, evidenceRef        ← APP 3 informed/specific/current
 └─ Application[]  jobId, portal, status, docVersionsAttached[](frozen+hashed at submit),
                   consentRecordId, credentialAccessEventId, reviewerId, attestationTs
                   UNIQUE(candidateId, jobExternalId, portal)   ← dedupe guard

Job                source, externalId, title, employer, location, specialty, worktype, salary, rawText, url, fetchedAt
Ranking            jobId, candidateId, fitScore, specialtyMatch, locationMatch, experienceGapYears, registrationOk, rationale, model, stage
SponsorshipClass   jobId, status(SPONSORSHIP_AVAILABLE|WORKING_RIGHTS_REQUIRED|CONDITIONAL|UNKNOWN), evidenceQuote(verbatim), confidence, visaSubclass?
PortalAdapter      hostnamePattern, vendor, tenantId, version, selectorMap(JSON), fallbackChains, fieldConfidenceRules, status(healthy|degraded)
AuditLog           actor, action, candidateId, entityRef, before/after, ts   ← append-only / hash-chained if it's the legal defense
```
- **Two independent axes:** (A) registration readiness, (B) work-rights/visa. Sponsorship filter is axis B only — never conflate.
- Verified facts (regNo, quals, dates, referees, check statuses) are **locked, never AI-writable**.
- Each employer = a separate tenant (esp. VIC `*.mercury.com.au` subdomains, per-employer Taleo accounts).

---

## 3. Per-portal adapter strategy (config-driven, backend-served, versioned)
Runtime ATS fingerprint by host signature; load matching adapter; brittle selectors live in
versioned `PortalAdapter.selectorMap` JSON (fix by editing config, not re-shipping).
```
.taleo.net            → Taleo (NSW Health, ACT Health, Healthscope)
*.myworkdayjobs.com   → Workday (Ramsay, St Vincent's)
*.mercury.com.au      → Mercury eRecruit (most VIC services; per-subdomain tenants)
/jobtools/            → SnapHire (QLD Health "Springboard", in_organid=15550)
*.bigredsky.com       → BigRedSky (WA "CRAMS", SA "I Work for SA")
*.pageuppeople.com    → PageUp (TasGov tenant 759, Ramsay legacy 953)
seek.com.au           → Seek (Quick Apply vs external-redirect detection)
```
**Field detection (layered, highest-confidence first):** `autocomplete` → `<label for>` → ancestor
`<label>` → `aria-label`/`aria-labelledby` → `placeholder` → tokenized `name`/`id` regex. Each match
carries a confidence score; low-confidence/unmapped → surfaced for manual fill.
**Graceful degradation (mandatory):** per-field schema/type validation; fallback selector chains;
unknown page state = **stop-and-ask, never guess-and-fill**; dropzone-only uploaders → "manual upload
required"; free-text "targeted questions"/selection criteria → **never autofilled**, offer STAR
drafting only (this is where the nurse's real effort and the tool's real value are).
**Priority:** Taleo & Workday first (native resume-parse autofill, documented fields). Mercury/SnapHire/
BigRedSky are older bespoke server-rendered forms → brittle, lower priority. Track vendor churn
(WA RAMS→CRAMS done; VIC Mercury→SuccessFactors→SmartRecruiters; Ramsay PageUp→Workday).
**Reality check from critique:** budget for *most* uploads being manual on several portals, and for
controlled-component fills needing per-framework strategies + read-back. Autofill may end up
"best-effort assist," not "fill everything."

---

## 4. AI pipeline (Anthropic Messages API)
Master CV + structured profile cached (`cache_control: ephemeral`) as a byte-stable prefix
(`tools → system → messages`; per-posting text after the last breakpoint; no timestamps/UUIDs;
verify `usage.cache_read_input_tokens`). Note Haiku 4096-token min cacheable prefix; cache TTL
expires between human-paced searches → caching is the big lever for **Batch/overnight**, weaker on
the interactive path.

| Task | Model (v1) | I/O | Guardrails |
|---|---|---|---|
| Job-fit ranking | **Sonnet 4.6** (`claude-sonnet-4-6`), synchronous | cached profile + posting → strict JSON `{fit_score, specialty_match, location_match, experience_gap_years, registration_ok, rationale}` | strict schema; *defer* a Haiku→Opus two-stage split until an eval proves it's needed |
| Sponsorship classification | **Haiku 4.5** (`claude-haiku-4-5`) | posting → `{status, evidence_quote(verbatim), confidence, visa_subclass?}` | exclusion phrases scanned BEFORE positives; verbatim quote required or confidence downgraded; default UNKNOWN |
| Resume parsing (onboarding) | **Sonnet 4.6** (PDF doc block / Files API) | CV → structured profile | validate; **human confirms regNo + quals**; never trust parsed credentials silently |
| CV tailoring + cover letter | **Sonnet 4.6** | master CV (grounding) + posting → tailored prose | anti-fabrication subsystem ↓ |
| Tailoring verification | **Haiku 4.5** | generated vs master CV → claim-level supported/unsupported | any unsupported claim flagged in review UI |
| Form-field mapping | **Haiku 4.5** simple / **Sonnet 4.6** ambiguous | form schema + profile → `{field → {key,value,confidence}}` | draft only; low-confidence blank; model proposes, browser layer fills |

Use bare alias model IDs. Batch + caching discounts stack but Batch is async (mins–24h) → **not** for
the interactive loop. Re-baseline cost with `count_tokens`.

### Anti-fabrication subsystem (highest-stakes — regulated profession)
A fabricated AHPRA registration / qualification / hours claim is misrepresentation to a regulator
(AHPRA honesty duty; NSW Health warns dismissal/prosecution; false stat-dec up to 4 yrs). So:
1. Grounding-only system prompt — model may only reorder/select/rephrase content present in the
   verified master CV; never assert any qualification/registration/date/referee/check not in profile.
2. Separate verification pass diffs output vs master CV at claim level.
3. Verified facts are locked fields, structurally separated from AI prose.
4. Police/WWCC fields read-only, excluded from AI generation entirely.
5. Mandatory human review + truthfulness attestation, logged, before any submit. Never auto-submit.

---

## 5. Sponsorship classification (the differentiator, honestly framed)
Four-class label (most postings are silent, so it's not binary):
`SPONSORSHIP_AVAILABLE` | `WORKING_RIGHTS_REQUIRED` | `CONDITIONAL` | `UNKNOWN` (default).
Algorithm precedence: (1) exclusion/negation phrases first ("sponsorship is **not** available",
"PR required", "full working rights") → WORKING_RIGHTS_REQUIRED; (2) positives ("482","willing to
sponsor","international applicants welcome","DAMA") → SPONSORSHIP_AVAILABLE; (3) conditional patterns;
(4) else UNKNOWN. **Always store + display the verbatim evidence snippet.** Tag visa subclass when
present (482/186/494 = sponsored; 189/190/491 = self/PR). Map RN → ANZSCO 254xxx.
**Honest reframing (from critique):** UNKNOWN will be the modal class, so position the feature as
*"flags the rare explicitly-sponsoring ads"* (assume working-rights-required unless stated), not
"routes everything by sponsorship." Two caveats surfaced in-product: sponsorship ≠ registrability
(axis A is a separate, higher-English-bar gate); an ad claiming sponsorship can't prove the employer
is an approved Standard Business Sponsor. Volatile facts (income thresholds + effective dates,
comparable-country list, English benchmarks) live in a dated, configurable reference table — never
hardcoded; classification is a heuristic with a disclaimer, not migration advice.

---

## 6. Security / privacy / consent / ToS posture (organizational scale)
**Storage:** encrypted at rest for ALL sensitive docs + credentials (AES-256 / SQLCipher pattern;
key from operator passphrase and/or OS keychain — never hardcoded). Credentials in a zero-knowledge
vault (client-side encryption, MFA, per-credential ACL, immutable access log, just-in-time fetch).
*Local-first vs centralized:* a single operator laptop holding 100 nurses' passports is itself a
honeypot with worse backup/continuity. **Recommendation: centralized but end-to-end-encrypted store**
so no provider holds plaintext, with proper backup — consistent with multi-machine/continuity reality.
**Privacy Act / APPs apply** (an agency handling *others'* sensitive data has no personal/domestic
exemption; an offshore agency likely still caught via "carrying on business in Australia"):
- APP 3: express, voluntary, informed, specific, current per-candidate consent (signed `ConsentRecord`,
  scoped to hold-docs / apply-on-behalf / disclose-to-specific-employer; expiry + revocation).
- APP 11: encryption, least-privilege, documented retention/destruction schedule (auto-destroy/
  de-identify when placement concludes). Revocation must work **day one**, not Phase 4: revoke →
  halt new apps → trigger destruction → process to withdraw submitted apps / notify employers.
- APP 8: cross-border disclosure register (docs → AU employers).
- APP 1/5: privacy policy + collection notices. Plus a Notifiable-Data-Breach response plan.
**ToS reality (state plainly):** on-behalf-via-candidate-account breaches Seek s8(f)/(g)/9(b) and the
hospital per-applicant model. Realistic consequence = candidate account suspension / IP blocking
(harms the very people served) + breach-of-contract exposure. Defensible mitigations the design *does*
implement: human reviews+submits every app; human-paced, no burst; never auto-solve CAPTCHA (detect→
pause→human→resume); per-candidate profile isolation; read DOM only on opened pages; immutable audit
trail; attestation step. **Actively investigate Seek's sanctioned recruiter / Talent Search pathway
and a model where the candidate self-operates their account** — a compliant sourcing model could
change the architecture. Get an Australian legal opinion before scaling past Phase 1 (gating spend),
and confirm activity doesn't drift into OMARA-regulated migration advice.

---

## 7. De-risk-first roadmap

**Week 1 — SPIKES BEFORE BUILDING (cheap, decisive; these decide whether the project is viable):**
1. **Throughput dry run.** One operator, 5 real candidates, real account creation + login + 3 apps
   each, fully manual. Measure wall-clock per app, per-login MFA failure rate, % uploads that are
   manual. Output: a realistic apps/day/operator number → validates or kills the business case.
2. **Fill-reliability spike.** On the chosen ATS, measure field-level fill success *with read-back*
   across 10 real RN postings, incl. file upload via filechooser. If low → pivot value prop to
   discovery + ranking + tailoring + tracking, autofill = best-effort.
3. **Session/MFA spike.** Prove the automation layer can drive a real login through an MFA challenge
   and recover gracefully, with correct per-candidate profile isolation + wrong-account prevention.
4. **Legal/ToS gate.** Commission the Australian legal opinion; open the Seek sanctioned-pathway question.

**Phase 0 — Scaffold (low-regret regardless of spike outcomes).** Next.js cockpit + Prisma schema
(all entities above) + single operator login + encrypted document store + vault integration +
Anthropic SDK with prompt-cache harness + automation-layer skeleton with one persistent isolated
profile. Delivers: secure shell + one cached profile round-trip + the consent/audit spine.

**Phase 1 — Thin vertical slice: ONE candidate, ONE external ATS, end-to-end.** Pick **Workday or
Taleo** (NOT Seek Quick Apply — it's thin + highest ToS risk + lowest fill payoff). Discovery done
manually in Phase 1. Slice: pick candidate → isolated profile + creds → operator logs in (real MFA) →
manual discovery → Sonnet rank + Haiku sponsorship classify → Sonnet tailor + verification → pre-fill
with read-back → review surface → attest + human submit → Application tracked + follow-up. **Named
deliverables:** the throughput number + a manual-account-creation runbook + field-level fill-success
metric. Proves the session/credential seam, anti-fabrication gate, graceful degradation.

**Phase 2 — Scale to the roster.** Candidate roster + switcher, cross-candidate work queue + status
dashboard, document vault UI with versioning + expiry alerts, consent capture/management + revocation
flow, per-candidate profile provisioning at scale, overnight Batch ranking across the roster.

**Phase 3 — More portals + batch ops.** Add Taleo/Workday (whichever wasn't first), then Mercury/
SnapHire/BigRedSky/PageUp with manual fallbacks. Adapter health monitoring + vendor-churn watch.
STAR selection-criteria drafting assistant. Seek added as a read-only discovery/ranking surface.

**Phase 4 — Hardening & compliance ops.** Retention/destruction automation (APP 11), cross-border
disclosure register (APP 8), full audit reporting (append-only/hash-chained), adapter rollback,
dated reference-table refresh for volatile migration facts.

---

## 8. Top risks → mitigations
| Risk | Severity | Mitigation |
|---|---|---|
| Seek/portal ToS breach (apply-on-behalf, credential sharing, automation) | High (legal) | Human reviews+submits; no burst; no CAPTCHA bypass; DOM read only on opened pages; legal opinion; pursue sanctioned recruiter pathway. *Cannot be engineered away.* |
| Account creation + per-session MFA at scale | High (operational, likely #1 killer) | Week-1 throughput dry run; account-provisioning runbook; per-candidate email/phone strategy; realistic apps/day ceiling |
| Fabrication in a regulated profession | Highest (career/legal) | Grounding-only prompts; locked verified facts; verification diff; human attestation; police/WWCC excluded from AI |
| Wrong-account / cross-contamination submit | High (privacy breach) | Strict per-candidate profile isolation; active-candidate single source of truth; pre-submit identity confirmation; read-back |
| Fill reliability on framework-heavy/churning ATS | High | Per-framework fill strategies; read-back verification; filechooser for uploads; confidence + fallback chains; degrade to manual; versioned adapters |
| Credential-vault single point of failure | High | Zero-knowledge vault, MFA, per-credential ACL, JIT fetch, no plaintext on disk, immutable access log |
| Privacy Act exposure (offshore agency, sensitive data) | High | E2E-encrypted store; APP 3 signed consent; APP 11 retention/destruction (day-one revocation); APP 8 register; NDB plan; legal advice |
| Sponsorship misclassification | Medium | 4-class + UNKNOWN default; exclusion-before-positive; verbatim evidence; honest framing; dated reference table |
| Document/registration expiry | Medium | `validFrom/validUntil` + alerts; RegistrationState stateful w/ expiry; gate apps on current registration |
| Selector drift | High (operational) | Backend-served versioned adapters; layered detection + confidence; health monitoring + rollback; vendor-churn watch |

**Bottom line:** build the assisted, human-in-the-loop, consent-and-audit-first **cockpit**. Prove
viability with Week-1 spikes (throughput, fill reliability, MFA) on ONE external ATS before committing
to the adapter framework. Treat autofill as a best-effort accelerator; the durable value is discovery
+ sponsorship classification + anti-fabrication tailoring + consent/audit/tracking. Carry the
on-behalf-via-candidate-account ToS issue as an explicit, legally-advised, leadership-accepted decision.
```

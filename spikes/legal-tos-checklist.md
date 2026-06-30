# Spike #4 — Legal / ToS Gate (do before scaling past Phase 1)

The on-behalf-via-candidate-account mechanic cannot be made compliant by software. Get answers to
these before committing real spend to Phase 2+. This is **not legal advice** — it's the question list
to take to an Australian lawyer and to Seek.

## For an Australian lawyer
1. **Privacy Act / "Australian link":** Does DesGro/DesMa "carry on business in Australia" such that
   the Privacy Act 1988 + 13 Australian Privacy Principles + Notifiable Data Breaches scheme apply,
   even if the entity/operator is offshore?
2. **APP 3 consent:** What does valid, express, informed, specific, current consent look like for
   holding + acting on candidates' sensitive info (passport, AHPRA/health, criminal history)? Get a
   consent-form template scoped to: hold documents / apply on behalf / disclose specific docs to
   specific employers, with expiry + revocation.
3. **APP 11 retention/destruction:** Required security controls + a retention/destruction schedule for
   100+ candidates' sensitive docs. When must data be destroyed/de-identified?
4. **APP 8 cross-border:** Obligations when disclosing candidate docs to Australian employers/hospitals.
5. **OMARA / migration advice:** Does any of this activity (sponsorship guidance, visa routing) cross
   into regulated migration advice requiring registration? Where's the line for "job-application help"?
6. **Liability of applying on behalf:** Exposure if an application contains an error, or if a candidate
   account is suspended for ToS breach; what authorization/indemnity wording is needed per candidate.

## For Seek (or via the SEEK Terms)
7. Is there a **sanctioned recruiter / agency / Talent Search pathway** that legitimately supports
   sourcing or applying for candidates — instead of operating candidates' personal seeker accounts?
8. Is there any **partner/API** access for job data so discovery doesn't rely on scraping?
9. Confirm the candidate-Terms clauses (apply-on-behalf, credential-sharing, automated access) and
   the realistic enforcement/consequences (account suspension thresholds).

## For each target hospital ATS
10. Per-applicant account terms — do any permit authorized-representative/agent application?
11. Any recruiter/agency portal that is the intended channel for third-party submissions?

## Output
Record a **go / no-go / modify** decision in `../SPIKE-RESULTS.md`, including any architecture change
(e.g. candidate self-operates account + submit; agency uses sanctioned recruiter channel).

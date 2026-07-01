# Nurse Cockpit — Seek assist (Chrome extension)

A Chrome/Edge (MV3) extension that gives you **buttons in your own browser** to:

- **Send the jobs on the current results page → the cockpit** (classified + ranked for the
  selected candidate). Supports **Seek** and **NSW Health** (`jobs.health.nsw.gov.au`).
- **Send THIS job (full description)** — on a single job's page, sends the full job text so
  **visa-sponsorship classification is accurate** (search cards are too thin to detect it).
  The result shows on the cockpit's Jobs & ranking page, where sponsorship-available roles
  are flagged and sorted to the top.
- **Pre-fill an application** from the candidate's profile, read back what stuck, and show
  what to fill manually.

You log into Seek **normally** in your browser; the extension never logs in for you,
never scrapes server-side, and **never submits** — you review and click Submit.

## Install (load unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.
3. Click the extension → **settings**, and set:
   - **Cockpit URL** — e.g. `https://nurse-apply-cockpit.vercel.app`
   - **Driver token** — the same value as the cockpit's `DRIVER_TOKEN` env var.

> If your cockpit URL is different from the default, also edit `host_permissions` in
> `manifest.json` to include it, then reload the extension.

## Use

1. Pick the **active candidate** in the popup. The popup checks the Seek account you're
   logged into and **warns if it doesn't match** the selected candidate (wrong-account
   guard). Make sure you're signed into *that candidate's* Seek account.
2. On a **Seek search page** → click **“Send jobs on this page → rank.”** The jobs appear
   ranked here and in the cockpit's Jobs & ranking page.
3. On a **Seek application page** → click **“Pre-fill this application.”** It fills what it
   can, reads back, and lists what needs manual entry (free-text, uploads). **Review every
   value, attach documents, and submit yourself.**

## Compliance note (same as the driver)

Operating a candidate's Seek account is restricted by Seek's Terms. This keeps the human
at login and submit by design. Get an Australian legal opinion + per-candidate consent
before using it beyond a test (see `../spikes/legal-tos-checklist.md`). Because a single
browser holds one Seek login at a time, the account guard above is your protection against
cross-candidate mistakes — heed it.

Selectors live in the `page*` functions in `popup.js` — tune them if Seek changes markup.

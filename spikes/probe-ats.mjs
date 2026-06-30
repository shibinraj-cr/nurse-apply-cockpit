// probe-ats.mjs
// ---------------------------------------------------------------------------
// DE-RISK SPIKE #2 — ATS fill-reliability probe
//
// Answers the question the whole "autofill" thesis depends on, for ONE real
// application page:
//   - Which ATS vendor is this?
//   - How many form fields can we confidently identify (label / aria / etc.)?
//   - Is the resume/cert upload a SETTABLE <input type=file> (automatable) or
//     a dropzone / presigned-upload widget (manual only)?
//   - If we attempt a dry-run fill, how many fields actually STICK on read-back?
//
// It scans every frame (Taleo etc. iframe their forms). It NEVER submits.
// Fill is OPT-IN (--fill) and writes harmless dummy values only into safe
// text-like fields (never password, never file). Run it on an application
// page you have ALREADY logged into (reuse the same --profile as session-spike).
//
// Usage:
//   node probe-ats.mjs --url <application-form-url> [--profile ./profiles/jane-doe] [--fill]
//
// Output: a console summary + a JSON report under ./reports/
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; } else { out[key] = true; }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.url) {
  console.error('ERROR: --url <application-form-url> is required.');
  process.exit(1);
}
const doFill = !!args.fill;
const profileDir = args.profile ? path.resolve(args.profile) : null;

mkdirSync(path.resolve('./reports'), { recursive: true });

// ATS fingerprint from hostname/url. (Mirrors the planned PortalAdapter map.)
function fingerprintATS(u) {
  const url = u.toLowerCase();
  if (/\.taleo\.net/.test(url)) return 'taleo';
  if (/myworkdayjobs\.com|\.workday\.com/.test(url)) return 'workday';
  if (/mercury\.com\.au/.test(url)) return 'mercury';
  if (/\/jobtools\/|snaphire/.test(url)) return 'snaphire';
  if (/bigredsky\.com/.test(url)) return 'bigredsky';
  if (/pageuppeople\.com/.test(url)) return 'pageup';
  if (/smartrecruiters\.com/.test(url)) return 'smartrecruiters';
  if (/greenhouse\.io/.test(url)) return 'greenhouse';
  if (/seek\.com\.au/.test(url)) return 'seek';
  return 'unknown';
}

// This function is serialized into the page; it must be fully self-contained.
function scanFrame(opts) {
  const { doFill } = opts;

  const CANON = [
    [/first.?name|given.?name/, 'firstName', 'Jane'],
    [/last.?name|surname|family.?name/, 'lastName', 'Doe'],
    [/full.?name|^name$|your name/, 'fullName', 'Jane Doe'],
    [/e-?mail/, 'email', 'jane.doe.spike@example.com'],
    [/phone|mobile|contact.?number|telephone/, 'phone', '0400000000'],
    [/ahpra|registration.?(number|no)|reg.?no/, 'ahpraNumber', 'NMW0000000000'],
    [/address|street/, 'addressLine', '1 Test St'],
    [/suburb|city|town/, 'suburb', 'Sydney'],
    [/post.?code|zip/, 'postcode', '2000'],
    [/cover.?letter/, 'coverLetter', null],          // never dummy-fill prose blindly
    [/resume|cv|curriculum/, 'resume', null],
    [/working.?rights|visa|citizen|resident|sponsor/, 'workRights', null],
    [/linkedin/, 'linkedin', null],
    [/years.*experience|experience.*years/, 'yearsExperience', null],
  ];

  function bestSignal(el) {
    const signals = [];
    const ac = el.getAttribute('autocomplete');
    if (ac && ac !== 'off' && ac !== 'on') signals.push({ via: 'autocomplete', text: ac, w: 0.95 });
    if (el.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl && lbl.innerText.trim()) signals.push({ via: 'label[for]', text: lbl.innerText.trim(), w: 0.9 });
      } catch { /* invalid id for selector */ }
    }
    const anc = el.closest('label');
    if (anc && anc.innerText.trim()) signals.push({ via: 'ancestor-label', text: anc.innerText.trim(), w: 0.85 });
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) signals.push({ via: 'aria-label', text: al.trim(), w: 0.8 });
    const alb = el.getAttribute('aria-labelledby');
    if (alb) {
      const t = alb.split(/\s+/).map((id) => (document.getElementById(id)?.innerText || '')).join(' ').trim();
      if (t) signals.push({ via: 'aria-labelledby', text: t, w: 0.8 });
    }
    const ph = el.getAttribute('placeholder');
    if (ph && ph.trim()) signals.push({ via: 'placeholder', text: ph.trim(), w: 0.6 });
    const ni = (el.getAttribute('name') || el.id || '').trim();
    if (ni) signals.push({ via: 'name/id', text: ni, w: 0.4 });
    signals.sort((a, b) => b.w - a.w);
    return signals[0] || null;
  }

  function toCanonical(text) {
    const t = (text || '').toLowerCase();
    for (const [re, key, dummy] of CANON) if (re.test(t)) return { key, dummy };
    return { key: 'unknown', dummy: null };
  }

  // React/controlled-component-safe value setter.
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  const controls = Array.from(
    document.querySelectorAll('input:not([type=hidden]), select, textarea')
  ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0); // visible-ish

  const fields = [];
  let fillAttempts = 0, fillStuck = 0;

  for (const el of controls) {
    const type = (el.getAttribute('type') || el.tagName).toLowerCase();
    if (type === 'password' || type === 'file' || type === 'submit' || type === 'button') continue;

    const sig = bestSignal(el);
    const { key, dummy } = toCanonical(sig?.text || '');
    const rec = {
      tag: el.tagName.toLowerCase(),
      type,
      name: el.getAttribute('name') || null,
      id: el.id || null,
      detectedVia: sig?.via || null,
      detectedText: sig?.text || null,
      guessedKey: key,
      confidence: sig ? sig.w : 0,
      required: el.required || el.getAttribute('aria-required') === 'true',
    };

    if (doFill && dummy && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.disabled && !el.readOnly) {
      fillAttempts++;
      try {
        setNativeValue(el, dummy);
        // read back AFTER the framework has had a chance to process events
        rec.fillStuck = el.value === dummy;
        if (rec.fillStuck) fillStuck++;
      } catch (e) {
        rec.fillStuck = false;
        rec.fillError = String(e);
      }
    }
    fields.push(rec);
  }

  // Upload-strategy detection.
  const fileInputs = Array.from(document.querySelectorAll('input[type=file]')).map((el) => ({
    name: el.getAttribute('name') || null,
    id: el.id || null,
    accept: el.getAttribute('accept') || null,
    hidden: !(el.offsetParent !== null || el.getClientRects().length > 0),
  }));
  const dropzones = Array.from(
    document.querySelectorAll('[class*="dropzone" i],[class*="drop-zone" i],[data-dropzone],[role="button"],[class*="upload" i]')
  )
    .filter((e) => /drag|drop|upload|attach/i.test(e.innerText || e.getAttribute('aria-label') || ''))
    .slice(0, 10)
    .map((e) => ({ tag: e.tagName.toLowerCase(), text: (e.innerText || '').slice(0, 80).trim() }));

  return {
    url: location.href,
    fieldCount: fields.length,
    fields,
    confidentFields: fields.filter((f) => f.confidence >= 0.8).length,
    fillAttempts,
    fillStuck,
    fileInputs,
    dropzones,
    hasPassword: !!document.querySelector('input[type=password]'),
  };
}

// --- run -------------------------------------------------------------------

const vendor = fingerprintATS(args.url);
console.log('\n=== ATS FILL-RELIABILITY PROBE ===');
console.log('URL    :', args.url);
console.log('Vendor :', vendor, vendor === 'unknown' ? '(no adapter signature matched)' : '');
console.log('Fill   :', doFill ? 'ON (dummy values, NO submit)' : 'off (analysis only)');
if (doFill) console.warn('⚠  --fill writes dummy values into visible text fields. It never submits, but some ATS autosave drafts. Use on a throwaway/test application where possible.');

const launchOpts = { headless: false, viewport: { width: 1280, height: 900 } };
const browser = profileDir
  ? await chromium.launchPersistentContext(profileDir, launchOpts)
  : await chromium.launch({ headless: false });
const context = profileDir ? browser : await browser.newContext({ viewport: launchOpts.viewport });
const page = (profileDir ? context.pages()[0] : null) || (await context.newPage());

await page.goto(args.url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => {
  console.warn('Navigation warning:', e.message);
});
await page.waitForTimeout(1500); // let SPA forms settle

const frames = page.frames();
const frameReports = [];
for (const frame of frames) {
  try {
    const r = await frame.evaluate(scanFrame, { doFill });
    if (r.fieldCount > 0 || r.fileInputs.length > 0 || r.dropzones.length > 0) {
      frameReports.push({ frameUrl: frame.url(), ...r });
    }
  } catch {
    frameReports.push({ frameUrl: frame.url(), skipped: 'cross-origin or inaccessible frame' });
  }
}

// Aggregate.
const totals = frameReports.reduce(
  (acc, r) => {
    acc.fields += r.fieldCount || 0;
    acc.confident += r.confidentFields || 0;
    acc.fillAttempts += r.fillAttempts || 0;
    acc.fillStuck += r.fillStuck || 0;
    acc.fileInputs += (r.fileInputs?.length) || 0;
    acc.dropzones += (r.dropzones?.length) || 0;
    return acc;
  },
  { fields: 0, confident: 0, fillAttempts: 0, fillStuck: 0, fileInputs: 0, dropzones: 0 }
);

const uploadStrategy =
  totals.fileInputs > 0 ? 'SETTABLE <input type=file> (automatable)' :
  totals.dropzones > 0 ? 'DROPZONE / widget (likely MANUAL upload)' :
  'none detected on this page';

console.log('\n--- RESULTS ------------------------------------------------');
console.log(`Frames scanned        : ${frames.length} (with form content: ${frameReports.filter((r) => !r.skipped).length})`);
console.log(`Form fields found      : ${totals.fields}`);
console.log(`Confidently identified : ${totals.confident}  (${pct(totals.confident, totals.fields)})  [confidence ≥ 0.8]`);
if (doFill) console.log(`Dry-run fill stuck     : ${totals.fillStuck}/${totals.fillAttempts}  (${pct(totals.fillStuck, totals.fillAttempts)})  ← the autofill viability number`);
console.log(`Upload strategy        : ${uploadStrategy}`);
console.log('------------------------------------------------------------');
console.log(
  uploadStrategy.startsWith('DROPZONE')
    ? '>> File upload will likely be MANUAL here. Playwright filechooser interception is the fallback to test next.'
    : totals.fileInputs > 0
    ? '>> File upload looks automatable via filechooser / setInputFiles.'
    : '>> No upload control on this page (may be a later wizard step).'
);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const host = safeHost(args.url);
const outPath = path.resolve(`./reports/${host}-${stamp}.json`);
writeFileSync(outPath, JSON.stringify({ url: args.url, vendor, doFill, totals, uploadStrategy, frameReports }, null, 2));
console.log('\nFull report written to:', outPath);
console.log('Browser left open for inspection — close it or Ctrl+C when done.\n');

// Keep the window open so the operator can eyeball the form vs the report.
await page.waitForTimeout(600000).catch(() => {});
await (profileDir ? context.close() : browser.close());

function pct(n, d) { return d ? `${Math.round((n / d) * 100)}%` : 'n/a'; }
function safeHost(u) { try { return new URL(u).hostname.replace(/[^a-z0-9.]/gi, '_'); } catch { return 'page'; } }

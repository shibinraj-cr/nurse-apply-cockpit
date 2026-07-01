// Seek-specific helpers. Selectors use Seek's data-automation attributes with
// fallbacks — brittle by nature (tune here if Seek changes markup). Nothing here
// logs in for the human or submits anything; it prefills + reads the open page.

const SEEK_LOGIN_URL = 'https://www.seek.com.au/oauth/login';

/** Navigate to Seek sign-in and prefill the candidate's email. Human finishes login. */
export async function prefillLoginEmail(page, email) {
  await page.goto(SEEK_LOGIN_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  if (!email) return false;
  const selector =
    'input[type="email"], input[name="email"], input[id*="email" i], input[autocomplete="username"]';
  const el = await page.$(selector);
  if (!el) return false;
  await el.fill(email).catch(() => {});
  return true;
}

/** Read job cards from the CURRENTLY OPEN Seek results page (operator-opened DOM). */
export async function scrapeJobs(page) {
  return page.evaluate(() => {
    const origin = location.origin;
    const cards = Array.from(
      document.querySelectorAll(
        '[data-automation="normalJob"], [data-automation="premiumJob"], article[data-card-type="JobCard"], article[data-testid="job-card"]',
      ),
    );
    const out = [];
    for (const card of cards) {
      const titleEl = card.querySelector(
        '[data-automation="jobTitle"], a[data-automation="jobTitle"], h3 a, a[href*="/job/"]',
      );
      const title = titleEl && titleEl.innerText ? titleEl.innerText.trim() : '';
      if (!title) continue;
      const companyEl = card.querySelector(
        '[data-automation="jobCompany"], [data-automation="jobCardCompany"], [data-automation="advertiserName"]',
      );
      const locEl = card.querySelector('[data-automation="jobLocation"], [data-automation="jobCardLocation"]');
      const descEl = card.querySelector(
        '[data-automation="jobShortDescription"], [data-testid="job-card-teaser"]',
      );
      const worktypeEl = card.querySelector('[data-automation="jobWorkType"]');
      const salaryEl = card.querySelector('[data-automation="jobSalary"]');
      const href = titleEl.getAttribute('href') || '';
      const url = href.startsWith('http') ? href : href ? origin + href : null;
      const idFromUrl = (url || '').match(/\/job\/(\d+)/);
      const externalId = idFromUrl ? idFromUrl[1] : card.getAttribute('data-job-id') || url || title;
      out.push({
        externalId,
        title,
        employer: companyEl && companyEl.innerText ? companyEl.innerText.trim() : 'Unknown',
        location: locEl && locEl.innerText ? locEl.innerText.trim() : null,
        worktype: worktypeEl && worktypeEl.innerText ? worktypeEl.innerText.trim() : null,
        salary: salaryEl && salaryEl.innerText ? salaryEl.innerText.trim() : null,
        url,
        rawText: [title, companyEl?.innerText, locEl?.innerText, descEl?.innerText]
          .filter(Boolean)
          .join(' — ')
          .slice(0, 2000),
      });
    }
    return out;
  });
}

// Serialized into the page — must be self-contained.
function scanFieldsInPage() {
  function bestSignal(el) {
    const signals = [];
    const ac = el.getAttribute('autocomplete');
    if (ac && ac !== 'off' && ac !== 'on') signals.push({ text: ac, w: 0.95 });
    if (el.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl && lbl.innerText.trim()) signals.push({ text: lbl.innerText.trim(), w: 0.9 });
      } catch {
        /* invalid id */
      }
    }
    const anc = el.closest('label');
    if (anc && anc.innerText.trim()) signals.push({ text: anc.innerText.trim(), w: 0.85 });
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) signals.push({ text: al.trim(), w: 0.8 });
    const ph = el.getAttribute('placeholder');
    if (ph && ph.trim()) signals.push({ text: ph.trim(), w: 0.6 });
    const ni = (el.getAttribute('name') || el.id || '').trim();
    if (ni) signals.push({ text: ni, w: 0.4 });
    signals.sort((a, b) => b.w - a.w);
    return signals[0] || null;
  }
  function selectorFor(el) {
    if (el.id) return `[id="${el.id}"]`;
    const name = el.getAttribute('name');
    if (name) return `[name="${name}"]`;
    return null; // unmappable → surfaced for manual
  }
  const controls = Array.from(
    document.querySelectorAll('input:not([type=hidden]), select, textarea'),
  ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);

  const fields = [];
  for (const el of controls) {
    const type = (el.getAttribute('type') || el.tagName).toLowerCase();
    if (['password', 'file', 'submit', 'button', 'checkbox', 'radio'].includes(type)) continue;
    const selectorHint = selectorFor(el);
    if (!selectorHint) continue;
    const sig = bestSignal(el);
    fields.push({
      selectorHint,
      detectedText: sig ? sig.text : '',
      type,
      required: el.required || el.getAttribute('aria-required') === 'true',
    });
  }
  const fileInputs = document.querySelectorAll('input[type=file]').length;
  const dropzones = Array.from(
    document.querySelectorAll('[class*="dropzone" i],[class*="upload" i],[data-dropzone]'),
  ).filter((e) => /drag|drop|upload|attach/i.test(e.innerText || e.getAttribute('aria-label') || '')).length;
  return { fields, fileInputs, dropzones };
}

/** Detect fillable fields across all frames of the open application page. */
export async function detectFields(page) {
  const fields = [];
  let fileInputs = 0;
  let dropzones = 0;
  for (const frame of page.frames()) {
    try {
      const r = await frame.evaluate(scanFieldsInPage);
      fields.push(...r.fields);
      fileInputs += r.fileInputs;
      dropzones += r.dropzones;
    } catch {
      /* cross-origin frame */
    }
  }
  return { fields, fileInputs, dropzones };
}

function fillInPage(items) {
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  const results = [];
  for (const it of items) {
    const el = document.querySelector(it.selectorHint);
    if (!el) continue; // not in this frame
    if (el.disabled || el.readOnly) {
      results.push({ ...it, found: true, stuck: false, note: 'read-only' });
      continue;
    }
    try {
      setNativeValue(el, it.value);
      results.push({ ...it, found: true, stuck: el.value === it.value });
    } catch (e) {
      results.push({ ...it, found: true, stuck: false, note: String(e) });
    }
  }
  return results;
}

/**
 * Fill mapped values across frames and READ BACK. Only fillable, non-null values
 * are attempted (free-text / sensitive fields are left for manual entry).
 */
export async function fillFields(page, mappedFields) {
  const toFill = mappedFields.filter((m) => m.fillable && m.value != null);
  const byHint = new Map();
  for (const frame of page.frames()) {
    try {
      const res = await frame.evaluate(fillInPage, toFill);
      for (const r of res) byHint.set(r.selectorHint, r);
    } catch {
      /* cross-origin frame */
    }
  }
  return toFill.map(
    (it) => byHint.get(it.selectorHint) || { ...it, found: false, stuck: false, note: 'not found' },
  );
}

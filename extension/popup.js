'use strict';
const $ = (id) => document.getElementById(id);

let cfg = {};
let candidates = [];
let activeId = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  $('settings').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
  $('openOptions').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

  cfg = await chrome.storage.local.get(['cockpitUrl', 'driverToken', 'activeCandidateId']);
  if (!cfg.cockpitUrl || !cfg.driverToken) {
    $('needsConfig').classList.remove('hidden');
    return;
  }
  $('main').classList.remove('hidden');

  try {
    const data = await cockpit('/api/driver/candidates', 'GET');
    candidates = data.candidates || [];
  } catch (e) {
    status('Cannot reach cockpit: ' + e.message, 'bad');
    return;
  }

  const sel = $('candidate');
  sel.innerHTML = '';
  for (const c of candidates) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.displayName + (c.email ? ` · ${c.email}` : '');
    sel.appendChild(opt);
  }
  activeId = cfg.activeCandidateId && candidates.some((c) => c.id === cfg.activeCandidateId)
    ? cfg.activeCandidateId
    : candidates[0]?.id;
  if (activeId) sel.value = activeId;

  sel.addEventListener('change', async () => {
    activeId = sel.value;
    await chrome.storage.local.set({ activeCandidateId: activeId });
    await checkAccount();
  });
  $('fetchBtn').addEventListener('click', () => guardRun(fetchJobs));
  $('fillBtn').addEventListener('click', () => guardRun(preFill));

  await refreshTabState();
  await checkAccount();
}

function candidate() { return candidates.find((c) => c.id === activeId) || null; }
function status(msg, kind) { const el = $('status'); el.textContent = msg || ''; el.className = 'status' + (kind ? ' ' + kind : ''); }

async function cockpit(path, method, body) {
  const res = await fetch(cfg.cockpitUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-driver-token': cfg.driverToken },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
  return json;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
async function onSeek() {
  const tab = await activeTab();
  return /:\/\/[^/]*seek\.com\.au/.test(tab?.url || '');
}
async function refreshTabState() {
  const seek = await onSeek();
  $('onSeek').classList.toggle('hidden', !seek);
  $('offSeek').classList.toggle('hidden', seek);
}

async function exec(func, args, allFrames) {
  const tab = await activeTab();
  return chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: !!allFrames }, func, args: args || [] });
}

async function guardRun(fn) {
  try { await fn(); } catch (e) { status(e.message, 'bad'); }
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function checkAccount() {
  const guard = $('acctGuard');
  const c = candidate();
  if (!c || !(await onSeek())) { guard.className = 'note hidden'; return; }
  let identity = null;
  try { const [r] = await exec(pageReadIdentity); identity = r?.result; } catch { /* not injectable */ }
  const email = (c.email || '').toLowerCase();
  if (identity && identity.email) {
    if (email && identity.email.toLowerCase() === email) {
      guard.className = 'note ok';
      guard.textContent = `Seek: ${identity.email} — matches ${c.displayName} ✓`;
    } else {
      guard.className = 'note bad';
      guard.textContent = `⚠ Seek is logged in as ${identity.email}, but the selected candidate is ${c.displayName}${email ? ` (${email})` : ''}. Fix before acting.`;
    }
  } else {
    guard.className = 'note warn';
    guard.textContent = `Confirm the Seek account logged in is ${c.displayName}${email ? ` (${email})` : ''}.`;
  }
}

async function fetchJobs() {
  if (!(await onSeek())) return status('Open a Seek search page first.', 'warn');
  status('Reading jobs on this page…');
  const [r] = await exec(pageScrapeJobs);
  const jobs = r?.result || [];
  if (!jobs.length) return status('No Seek job cards found on this page.', 'warn');
  status(`Sending ${jobs.length} job(s)…`);
  const data = await cockpit('/api/driver/jobs/ingest', 'POST', { candidateId: activeId, jobs });
  status(`Ranked ${data.count} job(s) for ${candidate()?.displayName}.`, 'ok');
  renderRanked(data.results || []);
}

async function preFill() {
  if (!(await onSeek())) return status('Open a Seek application page first.', 'warn');
  status('Detecting form fields…');
  const frames = await exec(pageDetectFields, [], true);
  const fields = [];
  let fileInputs = 0, dropzones = 0;
  for (const fr of frames) {
    if (fr.result) { fields.push(...fr.result.fields); fileInputs += fr.result.fileInputs; dropzones += fr.result.dropzones; }
  }
  if (!fields.length) return status('No mappable fields found on this page.', 'warn');
  status('Asking cockpit for a fill plan…');
  const { result } = await cockpit('/api/ai/fieldmap', 'POST', { candidateId: activeId, fields });
  const toFill = (result.fields || []).filter((f) => f.fillable && f.value != null);
  const fillFrames = await exec(pageFill, [toFill], true);
  const byHint = new Map();
  for (const fr of fillFrames) if (fr.result) for (const x of fr.result) byHint.set(x.selectorHint, x);
  status('Pre-filled. Review every value in the page, then submit yourself.', 'ok');
  renderReview(result.fields || [], byHint, dropzones);
}

// ── Rendering ─────────────────────────────────────────────────────────────

function renderRanked(results) {
  const el = $('results');
  el.innerHTML = '<h4>Ranked</h4>';
  for (const r of results.slice(0, 25)) {
    const spr = /pr|wr/i.test(r.sponsorship) ? 'r' : /sponsor/i.test(r.sponsorship) ? 'g' : '';
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span>${escapeHtml(r.title)}</span><span><span class="pill">fit ${r.fitScore}</span> <span class="pill ${spr}">${escapeHtml(r.sponsorship || '')}</span></span>`;
    el.appendChild(row);
  }
}

function renderReview(planFields, byHint, dropzones) {
  const el = $('results');
  el.innerHTML = '';
  const filled = [], failed = [], manual = [];
  for (const f of planFields) {
    if (!f.fillable || f.value == null) { manual.push(f); continue; }
    const res = byHint.get(f.selectorHint);
    (res && res.stuck ? filled : failed).push({ ...f, note: res?.note });
  }
  section(el, 'Filled (read back OK)', filled.map((f) => `✓ <b>${escapeHtml(f.key)}</b> ${escapeHtml(String(f.value))}`), 'g');
  if (failed.length) section(el, 'Did not stick — fill manually', failed.map((f) => `✗ <b>${escapeHtml(f.key)}</b> ${escapeHtml(f.note || 'controlled component')}`), 'r');
  const manualLines = manual.map((f) => `• ${escapeHtml(f.detectedText || f.key)}`);
  if (dropzones) manualLines.push('• document upload (dropzone) — attach files manually');
  section(el, 'Left for manual (free-text / sensitive)', manualLines, '');
}

function section(parent, title, lines, cls) {
  const h = document.createElement('h4');
  h.textContent = title;
  parent.appendChild(h);
  if (!lines.length) { const d = document.createElement('div'); d.className = 'note'; d.textContent = '—'; parent.appendChild(d); return; }
  for (const l of lines) {
    const d = document.createElement('div');
    d.className = 'row';
    d.innerHTML = `<span class="${cls === 'r' ? 'pill r' : cls === 'g' ? 'pill g' : ''}">${l}</span>`;
    parent.appendChild(d);
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ── Page-context functions (serialized into the Seek tab) ─────────────────────

function pageScrapeJobs() {
  const origin = location.origin;
  const cards = Array.from(document.querySelectorAll('[data-automation="normalJob"], [data-automation="premiumJob"], article[data-card-type="JobCard"], article[data-testid="job-card"]'));
  const out = [];
  for (const card of cards) {
    const titleEl = card.querySelector('[data-automation="jobTitle"], a[data-automation="jobTitle"], h3 a, a[href*="/job/"]');
    const title = titleEl && titleEl.innerText ? titleEl.innerText.trim() : '';
    if (!title) continue;
    const companyEl = card.querySelector('[data-automation="jobCompany"], [data-automation="jobCardCompany"], [data-automation="advertiserName"]');
    const locEl = card.querySelector('[data-automation="jobLocation"], [data-automation="jobCardLocation"]');
    const descEl = card.querySelector('[data-automation="jobShortDescription"], [data-testid="job-card-teaser"]');
    const worktypeEl = card.querySelector('[data-automation="jobWorkType"]');
    const salaryEl = card.querySelector('[data-automation="jobSalary"]');
    const href = titleEl.getAttribute('href') || '';
    const url = href.startsWith('http') ? href : href ? origin + href : null;
    const idm = (url || '').match(/\/job\/(\d+)/);
    out.push({
      externalId: idm ? idm[1] : (card.getAttribute('data-job-id') || url || title),
      title,
      employer: companyEl && companyEl.innerText ? companyEl.innerText.trim() : 'Unknown',
      location: locEl && locEl.innerText ? locEl.innerText.trim() : null,
      worktype: worktypeEl && worktypeEl.innerText ? worktypeEl.innerText.trim() : null,
      salary: salaryEl && salaryEl.innerText ? salaryEl.innerText.trim() : null,
      url,
      rawText: [title, companyEl && companyEl.innerText, locEl && locEl.innerText, descEl && descEl.innerText].filter(Boolean).join(' — ').slice(0, 2000),
    });
  }
  return out;
}

function pageDetectFields() {
  function bestSignal(el) {
    const s = [];
    const ac = el.getAttribute('autocomplete');
    if (ac && ac !== 'off' && ac !== 'on') s.push({ t: ac, w: 0.95 });
    if (el.id) { try { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l && l.innerText.trim()) s.push({ t: l.innerText.trim(), w: 0.9 }); } catch (e) {} }
    const anc = el.closest('label');
    if (anc && anc.innerText.trim()) s.push({ t: anc.innerText.trim(), w: 0.85 });
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) s.push({ t: al.trim(), w: 0.8 });
    const ph = el.getAttribute('placeholder');
    if (ph && ph.trim()) s.push({ t: ph.trim(), w: 0.6 });
    const ni = (el.getAttribute('name') || el.id || '').trim();
    if (ni) s.push({ t: ni, w: 0.4 });
    s.sort((a, b) => b.w - a.w);
    return s[0] || null;
  }
  function sel(el) {
    if (el.id) return '[id="' + el.id + '"]';
    const n = el.getAttribute('name');
    return n ? '[name="' + n + '"]' : null;
  }
  const controls = Array.from(document.querySelectorAll('input:not([type=hidden]), select, textarea')).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
  const fields = [];
  for (const el of controls) {
    const type = (el.getAttribute('type') || el.tagName).toLowerCase();
    if (['password', 'file', 'submit', 'button', 'checkbox', 'radio'].includes(type)) continue;
    const selectorHint = sel(el);
    if (!selectorHint) continue;
    const sig = bestSignal(el);
    fields.push({ selectorHint, detectedText: sig ? sig.t : '', type, required: el.required || el.getAttribute('aria-required') === 'true' });
  }
  const fileInputs = document.querySelectorAll('input[type=file]').length;
  const dropzones = Array.from(document.querySelectorAll('[class*="dropzone" i],[class*="upload" i],[data-dropzone]')).filter((e) => /drag|drop|upload|attach/i.test(e.innerText || e.getAttribute('aria-label') || '')).length;
  return { fields, fileInputs, dropzones };
}

function pageFill(items) {
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  const results = [];
  for (const it of items) {
    const el = document.querySelector(it.selectorHint);
    if (!el) continue;
    if (el.disabled || el.readOnly) { results.push({ selectorHint: it.selectorHint, stuck: false, note: 'read-only' }); continue; }
    try { setNativeValue(el, it.value); results.push({ selectorHint: it.selectorHint, stuck: el.value === it.value }); }
    catch (e) { results.push({ selectorHint: it.selectorHint, stuck: false, note: String(e) }); }
  }
  return results;
}

function pageReadIdentity() {
  const txt = document.body ? document.body.innerText : '';
  const signedIn = /\b(sign out|log ?out|my profile|saved searches)\b/i.test(txt);
  // Best-effort: first email-looking string on the page (often the account area).
  const m = txt.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return { email: m ? m[0] : null, signedIn };
}

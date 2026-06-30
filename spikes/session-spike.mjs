// session-spike.mjs
// ---------------------------------------------------------------------------
// DE-RISK SPIKE #3 — per-candidate session + MFA persistence
//
// Proves the core mechanic of the Playwright automation layer:
//   1. A persistent, ISOLATED browser profile per candidate (separate
//      cookies / storage), launched headed so the HUMAN can log in + MFA.
//   2. That the authenticated session SURVIVES across runs (so we don't
//      re-login + re-MFA on every application).
//
// It never auto-fills, never submits, never touches credentials. The human
// drives login. We only observe whether the session persisted.
//
// Usage:
//   node session-spike.mjs --profile ./profiles/jane-doe --url https://...portal-login...
//
// First run : you log in manually (+ MFA). Press Enter when done.
// Second run: same command — you should already be logged in. That's the proof.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { mkdirSync } from 'node:fs';
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
const profileDir = path.resolve(args.profile || './profiles/spike-default');
const url = args.url || 'https://www.seek.com.au/oauth/login';

mkdirSync(profileDir, { recursive: true });

console.log('\n=== SESSION / MFA PERSISTENCE SPIKE ===');
console.log('Profile dir :', profileDir);
console.log('Target URL  :', url);
console.log('A real, isolated browser profile lives in the dir above.\n');

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  // A normal desktop UA; we are NOT building an antidetect stack on purpose.
});

const page = context.pages()[0] || (await context.newPage());
await page.goto(url, { waitUntil: 'domcontentloaded' }).catch((e) => {
  console.warn('Navigation warning:', e.message);
});

// Snapshot auth signals BEFORE the human does anything.
const before = await authSignals(context, page);
console.log('Auth signals on open:', summarize(before));
console.log(
  before.likelyLoggedIn
    ? '\n>> Looks like you are ALREADY logged in (session persisted from a previous run). ✅'
    : '\n>> Not logged in yet. Log in manually in the browser window, complete any MFA,\n   then return here.'
);

const rl = createInterface({ input, output });
await rl.question('\nPress Enter once you have finished logging in (or to just close)… ');
rl.close();

const after = await authSignals(context, page);
console.log('\nAuth signals now    :', summarize(after));

const cookies = await context.cookies();
console.log(`\nStored cookies in this profile: ${cookies.length}`);
console.log('Persisted to:', profileDir);
console.log(
  '\nRUN THIS AGAIN with the SAME --profile to confirm the session is still live.\n' +
  'If the second run opens already-logged-in, per-candidate session persistence works. ✅\n'
);

await context.close();

// --- helpers ---------------------------------------------------------------

async function authSignals(context, page) {
  const cookies = await context.cookies();
  const cookieNames = cookies.map((c) => c.name.toLowerCase());
  const sessiony = cookieNames.filter((n) =>
    /sess|auth|token|sid|login|jwt|identity/.test(n)
  );
  // Heuristic page signals — presence of logout / account UI.
  let pageHints = [];
  try {
    pageHints = await page.evaluate(() => {
      const txt = document.body ? document.body.innerText.toLowerCase() : '';
      const hits = [];
      if (/\b(sign out|log ?out)\b/.test(txt)) hits.push('logout-link');
      if (/\b(my account|my profile|dashboard|welcome back)\b/.test(txt)) hits.push('account-ui');
      if (document.querySelector('input[type="password"]')) hits.push('password-field-present');
      return hits;
    });
  } catch { /* page may be cross-origin / closed */ }

  const likelyLoggedIn =
    sessiony.length > 0 &&
    pageHints.includes('logout-link') &&
    !pageHints.includes('password-field-present');

  return { cookieCount: cookies.length, sessionCookies: sessiony, pageHints, likelyLoggedIn };
}

function summarize(s) {
  return `cookies=${s.cookieCount} session-cookies=[${s.sessionCookies.join(',') || '-'}] page=[${s.pageHints.join(',') || '-'}] loggedIn=${s.likelyLoggedIn}`;
}

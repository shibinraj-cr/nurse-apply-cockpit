import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Launch a PERSISTENT, ISOLATED browser context for one candidate's profile id.
// One userDataDir per candidate → sessions never cross (wrong-account isolation).
export async function launchProfile(profilesDir, browserProfileId) {
  const safe = String(browserProfileId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(profilesDir, safe);
  mkdirSync(dir, { recursive: true });
  const context = await chromium.launchPersistentContext(dir, {
    headless: false,
    viewport: { width: 1360, height: 900 },
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page, dir };
}

// Heuristic: are we already logged in? (session persisted from a previous run)
export async function authSignals(context, page) {
  const cookies = await context.cookies();
  const sessiony = cookies
    .map((c) => c.name.toLowerCase())
    .filter((n) => /sess|auth|token|sid|login|jwt|identity/.test(n));
  let pageHints = [];
  try {
    pageHints = await page.evaluate(() => {
      const txt = document.body ? document.body.innerText.toLowerCase() : '';
      const hits = [];
      if (/\b(sign out|log ?out)\b/.test(txt)) hits.push('logout-link');
      if (/\b(my account|profile|dashboard|saved searches|welcome)\b/.test(txt)) hits.push('account-ui');
      if (document.querySelector('input[type="password"], input[type="email"]')) hits.push('login-field-present');
      return hits;
    });
  } catch {
    /* page may be navigating */
  }
  const likelyLoggedIn =
    sessiony.length > 0 && pageHints.includes('logout-link') && !pageHints.includes('login-field-present');
  return { cookieCount: cookies.length, sessionCookies: sessiony, pageHints, likelyLoggedIn };
}

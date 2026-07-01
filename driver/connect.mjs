// connect.mjs — Connect a candidate's ISOLATED Seek session.
// The app opens the per-candidate browser profile and prefills the email; the
// HUMAN enters the emailed code and finishes login. The session then persists.
//
//   node connect.mjs                          # list candidates
//   node connect.mjs --candidate <id> [--email name@x.com]
//
// Env/flags: DRIVER_TOKEN (required), COCKPIT_URL (default http://localhost:3000)

import { parseArgs, resolveConfig, prompt } from './lib/util.mjs';
import { makeApi } from './lib/api.mjs';
import { launchProfile, authSignals } from './lib/browser.mjs';
import { prefillLoginEmail } from './lib/seek.mjs';

const args = parseArgs(process.argv.slice(2));
const cfg = resolveConfig(args);
const api = makeApi(cfg);

if (!args.candidate) {
  const { candidates } = await api.listCandidates();
  console.log('\nCandidates (run: node connect.mjs --candidate <id> [--email …]):\n');
  for (const c of candidates) {
    console.log(
      `  ${c.id}  ${c.displayName.padEnd(22)} ${c.status.padEnd(11)} ` +
        `${c.email || '(no email)'}  ${c.hasSeekProfile ? '· seek profile ✓' : ''}`,
    );
  }
  console.log('');
  process.exit(0);
}

const session = await api.resolveSession(args.candidate, args.email);
console.log('\n=== CONNECT SEEK SESSION ===');
console.log('Candidate :', session.candidateName, `(${session.candidateId})`);
console.log('Login email:', session.loginEmail || '(none on file — pass --email)');
console.log('Profile dir:', session.browserProfileId);
console.log('This launches ONLY this candidate’s isolated browser profile.\n');

const { context, page } = await launchProfile(cfg.profilesDir, session.browserProfileId);
await page.goto(session.tenantUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

const before = await authSignals(context, page);
if (before.likelyLoggedIn) {
  console.log('>> Looks like you are ALREADY logged in (session persisted). ✅');
} else {
  await prefillLoginEmail(page, session.loginEmail);
  console.log(
    '>> Prefilled the email on the Seek sign-in page.\n' +
      '   Complete the login yourself: enter the code Seek sent to the candidate’s email\n' +
      '   (or password), and finish any verification. Then come back here.',
  );
}

await prompt('\nPress Enter once you have finished logging in… ');

const after = await authSignals(context, page);
console.log('\nAuth signals now:', {
  cookies: after.cookieCount,
  loggedIn: after.likelyLoggedIn,
  hints: after.pageHints,
});
console.log(
  after.likelyLoggedIn
    ? '\nConnected. The session is saved to this candidate’s profile and will persist. ✅'
    : '\nCould not confirm login automatically — if the Seek UI shows you signed in, it still persisted.',
);
console.log('Next: node fetch-jobs.mjs --candidate', args.candidate, '\n');

await context.close();

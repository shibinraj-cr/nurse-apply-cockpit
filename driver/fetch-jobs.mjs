// fetch-jobs.mjs — Read jobs from an operator-opened Seek results page and send
// them to the cockpit, where they're sponsorship-classified + ranked for the
// candidate. Reads only the DOM of a page YOU opened (no server-side scraping).
//
//   node fetch-jobs.mjs --candidate <id> [--url "https://www.seek.com.au/registered-nurse-jobs"]

import { parseArgs, resolveConfig, prompt } from './lib/util.mjs';
import { makeApi } from './lib/api.mjs';
import { launchProfile } from './lib/browser.mjs';
import { scrapeJobs } from './lib/seek.mjs';

const args = parseArgs(process.argv.slice(2));
const cfg = resolveConfig(args);
const api = makeApi(cfg);

if (!args.candidate) {
  console.error('Usage: node fetch-jobs.mjs --candidate <id> [--url <seek search url>]');
  process.exit(1);
}

const session = await api.resolveSession(args.candidate);
const { context, page } = await launchProfile(cfg.profilesDir, session.browserProfileId);

if (args.url) {
  await page.goto(args.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
} else {
  await page.goto(session.tenantUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
}
console.log('\nIn the browser window, run your Seek search for this candidate');
console.log('(specialty, location, "visa sponsorship", etc.) so the results are on screen.');
await prompt('Press Enter to read the jobs currently displayed… ');

const jobs = await scrapeJobs(page);
console.log(`\nRead ${jobs.length} job card(s) from the page.`);
if (jobs.length === 0) {
  console.log('No cards found — make sure Seek search results are visible, then re-run.');
  await context.close();
  process.exit(0);
}

const { count, results } = await api.ingestJobs(args.candidate, jobs);
console.log(`Ingested ${count} into the cockpit and ranked for ${session.candidateName}:\n`);
console.log('  FIT  SPONSOR  TITLE');
for (const r of results.slice(0, 30)) {
  console.log(`  ${String(r.fitScore).padStart(3)}  ${(r.sponsorship || '').padEnd(7)}  ${r.title}`);
}
console.log('\nOpen the cockpit → Jobs & ranking to review, tailor, and queue applications.');
console.log('Browser left open. Close it or Ctrl+C when done.\n');

await page.waitForTimeout(600000).catch(() => {});
await context.close();

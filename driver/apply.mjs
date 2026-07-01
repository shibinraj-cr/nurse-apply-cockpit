// apply.mjs — Pre-fill a Seek application form for HUMAN review + submit.
// Opens the candidate's isolated session, detects the form fields, asks the
// cockpit for a fill plan, fills + reads back, and prints a review. It NEVER
// clicks Submit — you review every value and submit yourself.
//
//   node apply.mjs --candidate <id> [--url "<seek application url>"]

import { parseArgs, resolveConfig, prompt } from './lib/util.mjs';
import { makeApi } from './lib/api.mjs';
import { launchProfile } from './lib/browser.mjs';
import { detectFields, fillFields } from './lib/seek.mjs';

const args = parseArgs(process.argv.slice(2));
const cfg = resolveConfig(args);
const api = makeApi(cfg);

if (!args.candidate) {
  console.error('Usage: node apply.mjs --candidate <id> [--url <seek application url>]');
  process.exit(1);
}

const session = await api.resolveSession(args.candidate);
const { context, page } = await launchProfile(cfg.profilesDir, session.browserProfileId);

console.log('\n=== ASSISTED APPLY (pre-fill only — you review + submit) ===');
console.log('Candidate:', session.candidateName);

if (args.url) {
  await page.goto(args.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
} else {
  await page.goto(session.tenantUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
}
console.log('Open the Seek application form for this candidate in the window.');
await prompt('Press Enter when the application form is on screen… ');

const { fields, fileInputs, dropzones } = await detectFields(page);
console.log(`\nDetected ${fields.length} fillable field(s); uploads: ${fileInputs} file input(s), ${dropzones} dropzone(s).`);
if (fields.length === 0) {
  console.log('No mappable fields found (form may be in a step you have not reached yet).');
  await context.close();
  process.exit(0);
}

const { result } = await api.fieldmap(args.candidate, fields);
const fillResults = await fillFields(page, result.fields);

const stuck = fillResults.filter((f) => f.stuck);
const failed = fillResults.filter((f) => f.found && !f.stuck);
const manual = result.fields.filter((f) => !f.fillable);

console.log('\n--- FILLED (read back OK) -------------------------------');
for (const f of stuck) console.log(`  ✓ ${f.key.padEnd(16)} ${f.value}`);
if (failed.length) {
  console.log('\n--- ATTEMPTED but did NOT stick (fill manually) --------');
  for (const f of failed) console.log(`  ✗ ${f.key.padEnd(16)} (${f.note || 'controlled component'})`);
}
console.log('\n--- LEFT FOR MANUAL (free-text / sensitive / unmapped) -');
for (const f of manual) console.log(`  • ${f.detectedText || f.key} (${f.key})`);
if (dropzones > 0) console.log('  • document upload looks like a dropzone → attach files manually');

console.log(
  '\n>> REVIEW every value in the browser against the candidate’s verified facts,\n' +
    '   attach documents, complete free-text/selection-criteria yourself, then YOU click Submit.\n' +
    '   This tool never submits. Record the application + attestation in the cockpit afterwards.\n',
);

await prompt('Press Enter to close the browser (after you have reviewed/submitted)… ');
await context.close();

import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

export function resolveConfig(args) {
  const cockpitUrl = (args.cockpit || process.env.COCKPIT_URL || 'http://localhost:3000').replace(/\/$/, '');
  const driverToken = args.token || process.env.DRIVER_TOKEN || '';
  const profilesDir = path.resolve(args.profiles || process.env.PROFILES_DIR || './profiles');
  if (!driverToken) {
    console.error(
      'ERROR: DRIVER_TOKEN not set. Export DRIVER_TOKEN (must match the cockpit env var) ' +
        'or pass --token <value>.',
    );
    process.exit(1);
  }
  return { cockpitUrl, driverToken, profilesDir };
}

export async function prompt(question) {
  const rl = createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

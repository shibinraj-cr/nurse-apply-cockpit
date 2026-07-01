// Centralised environment access with safe DEV defaults so the cockpit runs
// out-of-the-box. Production MUST override the secrets (see .env.example).

function read(name: string, devDefault: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : devDefault;
}

const isProd = process.env.NODE_ENV === 'production';
// `next build` evaluates this module with the dev defaults present; only enforce
// fail-closed secrets at real server runtime, not during the build phase.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

export const env = {
  isProd,
  DATABASE_URL: read('DATABASE_URL', 'file:./dev.db'),
  OPERATOR_PASSWORD: read('OPERATOR_PASSWORD', 'cockpit-dev'),
  SESSION_SECRET: read('SESSION_SECRET', 'dev-only-session-secret-change-me-please-32+chars'),
  APP_ENCRYPTION_KEY: read('APP_ENCRYPTION_KEY', 'dev-only-encryption-key-change-me-in-production'),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  MODEL_SONNET: read('ANTHROPIC_MODEL_SONNET', 'claude-sonnet-4-6'),
  MODEL_HAIKU: read('ANTHROPIC_MODEL_HAIKU', 'claude-haiku-4-5'),
};

export const hasAnthropic = env.ANTHROPIC_API_KEY.length > 0;

// Fail CLOSED in production: refuse to run on the bundled, source-published dev
// defaults (they would make the AES key reproducible and let anyone forge the
// operator session). The dev workflow uses NODE_ENV=development and is unaffected.
if (isProd && !isBuildPhase) {
  const offenders: string[] = [];
  if (env.SESSION_SECRET.startsWith('dev-only')) offenders.push('SESSION_SECRET');
  if (env.SESSION_SECRET.length < 32) offenders.push('SESSION_SECRET (must be >= 32 chars)');
  if (env.APP_ENCRYPTION_KEY.startsWith('dev-only')) offenders.push('APP_ENCRYPTION_KEY');
  if (env.OPERATOR_PASSWORD === 'cockpit-dev') offenders.push('OPERATOR_PASSWORD');
  if (offenders.length) {
    throw new Error(
      `[cockpit] Refusing to start in production with default/weak secrets: ${offenders.join(', ')}. ` +
        'Set real values in the environment (see .env.example).',
    );
  }
}

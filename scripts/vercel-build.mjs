// Vercel build entrypoint. Resolves DB env vars so the deploy "just works" with
// the common providers, then runs: prisma generate -> db push -> next build.
//
// - DATABASE_URL is required (runtime + build). Falls back to Vercel Postgres'
//   POSTGRES_PRISMA_URL / POSTGRES_URL if only those are present at build time.
// - DIRECT_URL (used by `prisma db push`) is OPTIONAL: falls back to the Neon
//   non-pooling var, else to DATABASE_URL.
import { execSync } from 'node:child_process';

const env = { ...process.env };

env.DATABASE_URL ||= env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || '';
env.DIRECT_URL ||= env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || '';

if (!env.DATABASE_URL || env.DATABASE_URL.includes('localhost')) {
  console.error(
    '\n[cockpit] DATABASE_URL is not set to a real Postgres (got: ' +
      (env.DATABASE_URL || '<empty>') +
      ').\n' +
      'Set DATABASE_URL (and ideally DIRECT_URL) in Vercel → Settings → Environment Variables\n' +
      'to your hosted Postgres (Neon/Vercel Postgres). See DEPLOY.md.\n',
  );
  process.exit(1);
}

execSync('prisma generate && prisma db push && next build', { stdio: 'inherit', env });

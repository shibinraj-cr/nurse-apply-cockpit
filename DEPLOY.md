# Deploying the cockpit to Vercel

The app is a Next.js 15 (App Router) server app backed by **PostgreSQL**. Encrypted
document blobs and vaulted credentials live **in the database** (not on disk), so it
runs cleanly on Vercel's serverless filesystem.

## 0. Prerequisites

- A GitHub repo containing this project (private recommended).
- A Vercel account.
- A hosted Postgres. **Neon** (free tier) is recommended; **Vercel Postgres**
  (Neon-backed) or **Supabase** work identically. You need two connection strings:
  a **pooled** URL (runtime) and a **direct** URL (used by `prisma db push`).

## 1. Create the Postgres database

**Neon:** create a project → copy two strings from the dashboard:
- Pooled (host contains `-pooler`) → `DATABASE_URL`
- Direct (no `-pooler`) → `DIRECT_URL`

**Vercel Postgres:** after creating the store, it exposes `POSTGRES_PRISMA_URL`
(pooled) and `POSTGRES_URL_NON_POOLING` (direct) — use those as the two values below.

**No pooler?** Set `DIRECT_URL` to the same value as `DATABASE_URL`.

## 2. Import the repo into Vercel

Vercel → **Add New → Project → Import** the GitHub repo. Framework preset auto-detects
Next.js. The build uses the `vercel-build` script (`prisma generate && prisma db push
&& next build`), which creates the schema on first deploy.

## 3. Set Environment Variables (Vercel → Project → Settings → Environment Variables)

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | ✅ | pooled Postgres URL |
| `DIRECT_URL` | ✅ | direct Postgres URL (migrations) |
| `SESSION_SECRET` | ✅ | ≥32 random chars — `openssl rand -base64 32` |
| `APP_ENCRYPTION_KEY` | ✅ | random secret — **back it up**; losing it makes every encrypted document/credential unrecoverable |
| `OPERATOR_PASSWORD` | ✅ | the single operator login password (not `cockpit-dev`) |
| `ANTHROPIC_API_KEY` | optional | enables live Claude models; blank = deterministic heuristic mode |
| `ANTHROPIC_MODEL_SONNET` | optional | defaults to `claude-sonnet-4-6` |
| `ANTHROPIC_MODEL_HAIKU` | optional | defaults to `claude-haiku-4-5` |

> The app **fails closed** in production: it refuses to boot on the bundled `dev-only`
> defaults or a `SESSION_SECRET` under 32 chars. Set real values above.

## 4. Deploy

Trigger a deploy (push to the connected branch, or "Redeploy"). The `vercel-build`
step runs `prisma db push` against `DIRECT_URL`, creating all tables, then builds.

## 5. (Optional) Seed sample data

Production starts empty. To load the demo candidates/jobs for testing, run **locally**
against the production DB (one-off):

```bash
DATABASE_URL="<pooled>" DIRECT_URL="<direct>" npm run db:seed
```

Skip this for a clean production instance and add real candidates through the UI.

## Local development (now needs Postgres)

```bash
cp .env.example .env          # then set DATABASE_URL + DIRECT_URL to a Postgres
npm install
npm run setup                 # prisma generate + db push + seed
npm run dev                   # http://localhost:3000  (password: cockpit-dev)
```

No local Postgres? Point `.env` at a Neon dev branch, or run one via Docker:
`docker run -e POSTGRES_PASSWORD=pw -p 5432:5432 postgres:16` and use
`postgresql://postgres:pw@localhost:5432/postgres`.

## Notes & limits on serverless

- **AI routes** call Anthropic from serverless functions — fine within Vercel's
  function timeout for the current prompts; heavy batch re-scoring should move to a
  background job / the Batch API.
- **The Playwright automation layer does NOT run on Vercel** (browsers need a
  persistent host) — it stays a separate desktop driver (see `src/lib/automation/`
  and `spikes/`). The cockpit (discovery, ranking, sponsorship, tailoring, consent,
  audit, tracking) is what's deployed here.

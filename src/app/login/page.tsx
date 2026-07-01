import { login } from '@/lib/actions/auth';
import { hasAnthropic } from '@/lib/env';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-lg font-semibold text-white">
            ✚
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Nurse Application Cockpit</h1>
          <p className="mt-1 text-sm text-slate-500">Single operator seat — sign in to continue.</p>
        </div>

        <form action={login} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {sp.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Incorrect password. Try again.
            </p>
          )}
          <div>
            <label className="label" htmlFor="password">
              Operator password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoFocus
              required
              className="input"
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            Sign in
          </button>
          <p className="text-center text-xs text-slate-400">
            Dev default password: <code className="rounded bg-slate-100 px-1">cockpit-dev</code>
          </p>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          AI features {hasAnthropic ? 'enabled' : 'running in heuristic / no-key mode'}.
        </p>
      </div>
    </main>
  );
}

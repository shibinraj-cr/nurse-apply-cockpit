'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSessionToken, verifyOperatorPassword, SESSION_COOKIE } from '@/lib/auth';
import { appendAudit } from '@/lib/audit';

export async function login(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  if (!verifyOperatorPassword(password)) {
    redirect('/login?error=1');
  }
  const token = await createSessionToken();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  await appendAudit({ actor: 'operator', action: 'auth.login' });
  redirect('/dashboard');
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  await appendAudit({ actor: 'operator', action: 'auth.logout' });
  redirect('/login');
}

// Single-operator auth (one seat by design, DESIGN.md §1). Edge-safe: uses jose
// (Web Crypto) only, so it can run in middleware. No node:crypto / no Prisma here.

import { SignJWT, jwtVerify } from 'jose';
import { env } from './env';

export const SESSION_COOKIE = 'cockpit_session';
const SECRET = new TextEncoder().encode(env.SESSION_SECRET);

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'operator' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('operator')
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(SECRET);
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

// Pure-JS constant-time compare (edge-safe; avoids node:crypto).
function constantTimeEqual(a: string, b: string): boolean {
  let mismatch = a.length === b.length ? 0 : 1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

export function verifyOperatorPassword(input: string): boolean {
  return constantTimeEqual(input, env.OPERATOR_PASSWORD);
}

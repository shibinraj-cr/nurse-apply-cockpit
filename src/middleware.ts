import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth';
import { env } from '@/lib/env';

// Single-operator gate. Everything except /login (and Next internals, excluded by
// the matcher) requires a valid operator session cookie. Edge-safe (jose only).
//
// The local desktop driver has no browser session, so it authenticates to the
// /api/driver + /api/ai endpoints with a shared DRIVER_TOKEN (x-driver-token).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isDriverPath = pathname.startsWith('/api/driver') || pathname.startsWith('/api/ai');
  if (isDriverPath && env.DRIVER_TOKEN) {
    const presented = req.headers.get('x-driver-token');
    if (presented && presented === env.DRIVER_TOKEN) return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySessionToken(token);
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
};

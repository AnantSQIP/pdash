import { NextRequest, NextResponse } from 'next/server';

// Optimistic, server-side route gate. Presence of the session cookie is enough to
// pass; the NestJS API remains the real authority (it verifies the JWT on every call).
const PUBLIC = ['/login', '/signup'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has('access_token') || req.cookies.has('refresh_token');
  const isPublic = PUBLIC.some(p => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if (hasSession && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/home';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Run on app routes only — skip /api (proxied), Next internals and static assets.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|fav.png|fonts).*)'],
};

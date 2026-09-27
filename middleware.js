import { NextResponse } from 'next/server';

export const config = {
  // Everything except static assets and the gate itself. /api/ingest is excluded
  // too — the CLI authenticates with its own bearer tokens, not the view cookie.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|gate|api/ingest).*)']
};

/**
 * Gates the dashboard behind one shared passphrase, when the deployment sets one.
 * This is a screen-lock for a team dashboard, not a per-user login — deliberately,
 * per how this project's identity model works (a display name, not an account).
 * With no SHREY_VIEW_KEY configured, nothing here does anything: fully open.
 */
export function middleware(req) {
  const viewKey = process.env.SHREY_VIEW_KEY;
  if (!viewKey) return NextResponse.next();

  const cookie = req.cookies.get('shrey_view')?.value;
  if (cookie === viewKey) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'locked' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/gate';
  url.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

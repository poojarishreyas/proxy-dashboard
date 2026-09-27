import { NextResponse } from 'next/server';
import { safeEqual } from '../../../lib/crypto';

export async function POST(req) {
  const viewKey = process.env.SHREY_VIEW_KEY;
  if (!viewKey) return NextResponse.json({ ok: true }); // no gate configured

  const body = await req.json().catch(() => null);
  const key = body?.key;
  if (!key || !safeEqual(key, viewKey)) {
    return NextResponse.json({ ok: false, error: 'Wrong passphrase.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('shrey_view', viewKey, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
  return res;
}

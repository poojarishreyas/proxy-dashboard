import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

/**
 * Polled by the dashboard every few seconds for the session list. Deliberately a
 * short-polling GET rather than a persistent connection: it works the same on
 * every Vercel plan and runtime, with no connection-limit or timeout surprises.
 */
export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('sessions')
    .select('identity_id, id, title, model, source, started_at, updated_at, requests, errors, usage, identities(name)')
    .order('updated_at', { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessions = (data ?? []).map((s) => ({
    identityId: s.identity_id,
    id: s.id,
    userName: s.identities?.name ?? 'unknown',
    title: s.title,
    model: s.model,
    source: s.source,
    startedAt: Date.parse(s.started_at),
    updatedAt: Date.parse(s.updated_at),
    requests: s.requests,
    errors: s.errors,
    usage: s.usage ?? {}
  }));
  return NextResponse.json({ sessions }, { headers: { 'cache-control': 'no-store' } });
}

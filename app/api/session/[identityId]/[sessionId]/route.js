import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin';

/** One session's full event log plus every message object its events reference. */
export async function GET(_req, { params }) {
  const { identityId, sessionId } = await params;
  const db = supabaseAdmin();

  const { data: session, error: sessionErr } = await db
    .from('sessions')
    .select('identity_id, id, title, model, source, started_at, updated_at, requests, errors, usage, identities(name)')
    .eq('identity_id', identityId)
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: events, error: eventsErr } = await db
    .from('events')
    .select('seq, time, type, data')
    .eq('identity_id', identityId)
    .eq('session_id', sessionId)
    .order('seq', { ascending: true });
  if (eventsErr) return NextResponse.json({ error: eventsErr.message }, { status: 500 });

  const refs = new Set();
  for (const e of events ?? []) {
    for (const ref of e.data?.messageRefs ?? []) refs.add(ref);
    if (e.data?.systemId) refs.add(e.data.systemId);
    if (e.data?.toolsId) refs.add(e.data.toolsId);
  }
  const objects = {};
  if (refs.size) {
    const { data: rows, error: objErr } = await db
      .from('objects')
      .select('id, value')
      .eq('identity_id', identityId)
      .in('id', [...refs]);
    if (objErr) return NextResponse.json({ error: objErr.message }, { status: 500 });
    for (const row of rows ?? []) objects[row.id] = row.value;
  }

  return NextResponse.json(
    {
      session: {
        identityId: session.identity_id,
        id: session.id,
        userName: session.identities?.name ?? 'unknown',
        title: session.title,
        model: session.model,
        startedAt: Date.parse(session.started_at),
        updatedAt: Date.parse(session.updated_at),
        requests: session.requests,
        errors: session.errors,
        usage: session.usage ?? {}
      },
      events: events ?? [],
      objects
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { sha256Hex, safeEqual } from '../../../lib/crypto';

const MAX_BODY = 4 * 1024 * 1024; // one sync batch; the CLI keeps batches well under this
const MAX_EVENTS = 500;

/**
 * Where `shrey`'s CLI pushes captures. Two independent secrets:
 *   - the shared cloud key (one per deployment) gates the endpoint from strangers
 *   - the per-install device token identifies *which* person this is, so activity
 *     attributes to the right name; it never gates access on its own
 * Neither is a login: there is no session, no account recovery, nothing to leak
 * beyond what the CLI already stores locally.
 */
export async function POST(req) {
  const cloudKey = process.env.SHREY_CLOUD_KEY;
  if (!cloudKey) {
    return NextResponse.json({ ok: false, error: 'This deployment has no SHREY_CLOUD_KEY configured' }, { status: 503 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!safeEqual(presented, cloudKey)) {
    return NextResponse.json({ ok: false, error: 'Invalid cloud key' }, { status: 401 });
  }

  const rawLength = Number(req.headers.get('content-length') ?? 0);
  if (rawLength > MAX_BODY) {
    return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
  }
  const body = await req.json().catch(() => null);
  const { deviceToken, name, session, events, objects } = body ?? {};

  if (!deviceToken || typeof deviceToken !== 'string' || deviceToken.length < 16) {
    return NextResponse.json({ ok: false, error: 'Missing or malformed deviceToken' }, { status: 400 });
  }
  if (!session?.id || !session?.startedAt) {
    return NextResponse.json({ ok: false, error: 'Missing session' }, { status: 400 });
  }
  if (events && (!Array.isArray(events) || events.length > MAX_EVENTS)) {
    return NextResponse.json({ ok: false, error: 'events must be an array of at most ' + MAX_EVENTS }, { status: 400 });
  }

  const db = supabaseAdmin();
  const tokenHash = sha256Hex(deviceToken);

  // Identify (or silently create) the identity behind this device token. A name
  // is required on the very first call from a device; after that it is optional
  // and, when present and different, simply renames the identity going forward.
  let identityId;
  const { data: known } = await db.from('identity_tokens').select('identity_id').eq('token_hash', tokenHash).maybeSingle();
  if (known) {
    identityId = known.identity_id;
    if (name && typeof name === 'string') {
      await db.from('identities').update({ name: name.slice(0, 80), last_seen_at: new Date().toISOString() }).eq('id', identityId);
    } else {
      await db.from('identities').update({ last_seen_at: new Date().toISOString() }).eq('id', identityId);
    }
  } else {
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ ok: false, error: 'First sync from a new device must include a name' }, { status: 400 });
    }
    const { data: created, error: createErr } = await db
      .from('identities')
      .insert({ name: name.slice(0, 80) })
      .select('id')
      .single();
    if (createErr) return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });
    identityId = created.id;
    const { error: tokenErr } = await db.from('identity_tokens').insert({ token_hash: tokenHash, identity_id: identityId });
    if (tokenErr) return NextResponse.json({ ok: false, error: tokenErr.message }, { status: 500 });
  }

  const { error: sessionErr } = await db.from('sessions').upsert(
    {
      identity_id: identityId,
      id: session.id,
      title: session.title ?? null,
      model: session.model ?? null,
      source: session.source ?? null,
      started_at: new Date(session.startedAt).toISOString(),
      updated_at: new Date(session.updatedAt ?? session.startedAt).toISOString(),
      requests: session.requests ?? 0,
      errors: session.errors ?? 0,
      usage: session.usage ?? {}
    },
    { onConflict: 'identity_id,id' }
  );
  if (sessionErr) return NextResponse.json({ ok: false, error: sessionErr.message }, { status: 500 });

  if (Array.isArray(objects) && objects.length) {
    const rows = objects.map((o) => ({ identity_id: identityId, id: o.id, kind: o.kind ?? 'blob', value: o.value }));
    // Content-addressed: an existing id already holds this exact content.
    const { error } = await db.from('objects').upsert(rows, { onConflict: 'identity_id,id', ignoreDuplicates: true });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (Array.isArray(events) && events.length) {
    const rows = events.map((e) => ({
      identity_id: identityId,
      session_id: session.id,
      seq: e.seq,
      time: e.time,
      type: e.type,
      data: e.data ?? {}
    }));
    // Retried batches are common (a flaky connection re-sends the same seq range);
    // (identity_id, session_id, seq) is the primary key, so this stays idempotent.
    const { error } = await db.from('events').upsert(rows, { onConflict: 'identity_id,session_id,seq', ignoreDuplicates: true });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, identityId });
}

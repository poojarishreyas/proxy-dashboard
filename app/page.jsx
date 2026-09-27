'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { project, fmtAgo, fmtCompact } from '../lib/projection';

const FEED_INTERVAL_MS = 3000;
const SESSION_INTERVAL_MS = 2500;

function initialsOf(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export default function Dashboard() {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null); // { identityId, id }
  const [detail, setDetail] = useState(null); // { session, events, objects }
  const [filter, setFilter] = useState('');
  const [live, setLive] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  // ---- session list: polled ----------------------------------------------
  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const res = await fetch('/api/feed', { cache: 'no-store' });
        if (res.status === 401) {
          window.location.href = '/gate';
          return;
        }
        const data = await res.json();
        if (stopped) return;
        setSessions(data.sessions || []);
        setLive(true);
        setError(null);
      } catch {
        if (!stopped) setLive(false);
      }
    }
    tick();
    const id = setInterval(tick, FEED_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  // Select the most recent session once the first feed arrives.
  useEffect(() => {
    if (!selected && sessions.length) setSelected({ identityId: sessions[0].identityId, id: sessions[0].id });
  }, [sessions, selected]);

  // ---- selected session detail: polled while open ------------------------
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let stopped = false;
    async function tick() {
      try {
        const res = await fetch(`/api/session/${selected.identityId}/${encodeURIComponent(selected.id)}`, { cache: 'no-store' });
        if (res.status === 401) {
          window.location.href = '/gate';
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped) setDetail(data);
      } catch {
        /* transient; the next poll retries */
      }
    }
    tick();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(tick, SESSION_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(pollRef.current);
    };
  }, [selected]);

  const rows = useMemo(() => (detail ? project(detail.events, detail.objects) : []), [detail]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) => s.title?.toLowerCase().includes(q) || s.userName?.toLowerCase().includes(q) || s.model?.toLowerCase().includes(q)
    );
  }, [sessions, filter]);

  const totals = useMemo(
    () =>
      sessions.reduce(
        (a, s) => {
          a.req += s.requests || 0;
          a.out += s.usage?.output || 0;
          return a;
        },
        { req: 0, out: 0 }
      ),
    [sessions]
  );

  const people = useMemo(() => new Set(sessions.map((s) => s.userName)).size, [sessions]);

  return (
    <div className="page">
      <div className="ambient"><i className="orb orb-a" /><i className="orb orb-b" /></div>

      <header className="topbar">
        <span className="brand">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
            <circle cx="12" cy="12" r="2.25" fill="currentColor" />
          </svg>
          shrey
        </span>
        <span className="chip"><i className={'dot ' + (live ? 'live' : 'warn')} />{live ? 'live' : 'reconnecting'}</span>
        <span className="chip mono">{people} {people === 1 ? 'person' : 'people'} · {sessions.length} sessions</span>
        <span className="chip mono">{fmtCompact(totals.req)} req · {fmtCompact(totals.out)} out</span>
        <span className="grow" />
      </header>

      <div className={'panes' + (selected ? '' : '')}>
        <aside className="shell sidebar">
          <div className="core">
            <div className="pane-head">
              <span className="eyebrow">Activity</span>
              <span className="mono" style={{ color: 'var(--text-3)' }}>{sessions.length}</span>
            </div>
            <div className="field">
              <input placeholder="Filter by person, title, model" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            <div className="list">
              {filtered.map((s) => (
                <div
                  key={s.identityId + ':' + s.id}
                  className={'session' + (selected?.id === s.id && selected?.identityId === s.identityId ? ' sel' : '')}
                  onClick={() => setSelected({ identityId: s.identityId, id: s.id })}
                >
                  <span className="who">
                    <span className="avatar">{initialsOf(s.userName)}</span>
                    {s.userName}
                  </span>
                  <div className="title">{s.title || '(untitled)'}</div>
                  <div className="meta">
                    <span>{fmtAgo(s.updatedAt)}</span>
                    {s.model && <span>{s.model.replace(/^claude-/, '')}</span>}
                    <span>{s.requests} req</span>
                    <span>{fmtCompact(s.usage?.output)} out</span>
                    {s.errors > 0 && <span style={{ color: 'var(--error)' }}>{s.errors} err</span>}
                  </div>
                </div>
              ))}
              {!filtered.length && <div className="list-empty">{sessions.length ? 'No match' : 'No activity yet — run `shrey` on any machine configured with this dashboard.'}</div>}
            </div>
            <div className="foot mono">{error || (live ? 'updating every ' + FEED_INTERVAL_MS / 1000 + 's' : 'reconnecting…')}</div>
          </div>
        </aside>

        <main className="shell">
          <div className="core trace">
            <div className="trace-head">
              <div className="title-block">
                <span className="eyebrow">{detail ? detail.session.userName : 'Trajectory'}</span>
                <h1 className="name">{detail ? detail.session.title || '(untitled)' : 'Select a session'}</h1>
              </div>
              {detail && <span className="chip mono">{detail.session.model || '—'}</span>}
            </div>
            <div className="ledger">
              {rows.map((row) =>
                row.kind === 'separator' ? (
                  <div className={'sep ' + row.sep} key={row.key}>
                    <span className="rid">{row.label}</span>
                    {row.detail && <span style={{ color: 'var(--text-3)' }}>{row.detail}</span>}
                  </div>
                ) : (
                  <div className={'row' + (row.indent ? ' indent' : '')} key={row.key}>
                    <div className="kind">
                      <span className={'tag ' + row.tagClass}>{row.tag}</span>
                      <span>{row.label}</span>
                    </div>
                    <div className={'body' + (row.meta ? ' meta' : '')} style={row.isError ? { color: 'var(--error)' } : undefined}>
                      {row.text}
                    </div>
                  </div>
                )
              )}
              {!rows.length && <div className="quiet">{detail ? 'No events yet.' : 'Pick a session on the left.'}</div>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

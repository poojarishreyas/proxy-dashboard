'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function GateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key })
      });
      const data = await res.json();
      if (!data.ok) {
        setErr(data.error || 'Wrong passphrase.');
        setBusy(false);
        return;
      }
      router.replace(params.get('next') || '/');
      router.refresh();
    } catch {
      setErr('The server did not answer.');
      setBusy(false);
    }
  }

  return (
    <form className="shell gate-card" onSubmit={submit}>
      <div className="core" style={{ padding: 28, borderRadius: 16 }}>
        <span className="eyebrow" style={{ marginBottom: 10, display: 'inline-flex' }}>shrey</span>
        <h1>Admin dashboard</h1>
        <p>Live Claude Code activity from every machine running shrey. Enter the passphrase to continue.</p>
        <input type="password" autoFocus placeholder="Passphrase" value={key} onChange={(e) => setKey(e.target.value)} />
        {err && <div className="gate-err">{err}</div>}
        <button type="submit" disabled={busy || !key}>{busy ? 'Checking…' : 'Enter'}</button>
      </div>
    </form>
  );
}

export default function GatePage() {
  return (
    <>
      <div className="ambient"><i className="orb orb-a" /><i className="orb orb-b" /></div>
      <div className="gate">
        <Suspense fallback={null}>
          <GateForm />
        </Suspense>
      </div>
    </>
  );
}

'use client';
// app/change-order/[token]/page.tsx — the customer says yes or no to a change (Phase 2 item 11).
//
// One page, two buttons, a name field. Reached from the customer portal or from an email.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Payload {
  changeOrder: { number: number; description: string; amount_cents: number; days_added: number; status: string; requested_at: string; decided_at: string | null; approved_by_name: string | null };
  job: { job_number: string | null; name: string | null; address: string | null; city: string | null; state: string | null } | null;
  firm: { name: string; phone: string | null; phoneE164: string | null; email: string };
  decidable: boolean;
}

const money = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function ChangeOrderPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/change-order/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setLoadError(j.error || 'This link is not valid.'); return; }
      setData(j);
    } catch {
      setLoadError('We could not load this change order. Please check your connection and try again.');
    }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  async function decide(decision: 'approve' | 'decline') {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/public/change-order/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, name: name.trim(), reason: reason.trim() || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      // "Already decided" comes back as ok — see the route's comment. Treating it as a failure sends
      // the customer round again.
      if (r.ok) setDone(j.status ?? decision);
      else setError(j.error || 'We could not record your decision. Please try again or call us.');
    } catch {
      setError('We could not reach the server. Your decision was not recorded — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main style={{ maxWidth: 620, margin: '80px auto', padding: 24, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 20 }}>Change order unavailable</h1>
        <p style={{ color: '#4a5470' }}>{loadError}</p>
      </main>
    );
  }
  if (!data) return <main style={{ maxWidth: 620, margin: '80px auto', padding: 24 }}><p>Loading…</p></main>;

  const { changeOrder: co, job, firm } = data;
  const settled = done ?? (co.status === 'approved' || co.status === 'declined' ? co.status : null);

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 80px', fontFamily: 'Inter, system-ui, sans-serif', color: '#152050' }}>
      <header style={{ borderBottom: '2px solid #1D3095', paddingBottom: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4a5470' }}>Change to the work</div>
        <h1 style={{ fontSize: 22, margin: '4px 0 0' }}>{firm.name}</h1>
        {job && (
          <div style={{ fontSize: 13, color: '#4a5470', marginTop: 4 }}>
            {job.address || job.name}{job.city ? `, ${job.city}` : ''}{job.state ? `, ${job.state}` : ''}
            {job.job_number ? ` · Job ${job.job_number}` : ''}
          </div>
        )}
      </header>

      {settled && (
        <div role="status" style={{ background: settled === 'approved' ? '#ecfdf3' : '#fffaeb', border: `1px solid ${settled === 'approved' ? '#027a48' : '#b54708'}`, color: settled === 'approved' ? '#027a48' : '#b54708', padding: '14px 18px', borderRadius: 10, marginBottom: 24 }}>
          <strong>{settled === 'approved' ? 'Approved.' : 'Declined.'}</strong>{' '}
          {settled === 'approved'
            ? 'Thank you — we will add this to your job and to your final invoice.'
            : 'Thank you for letting us know. We will carry on with the work as originally agreed.'}
        </div>
      )}

      <section style={{ border: '1px solid #e4e7ee', borderRadius: 10, padding: 18, marginBottom: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280' }}>Change #{co.number}</div>
        <p style={{ fontSize: 16, lineHeight: 1.6, margin: '8px 0 16px', whiteSpace: 'pre-wrap' }}>{co.description}</p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', borderTop: '1px solid #e4e7ee', paddingTop: 14 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' }}>Change in fee</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: co.amount_cents >= 0 ? '#BD1218' : '#027a48' }}>
              {co.amount_cents >= 0 ? '+' : '−'}{money(Math.abs(co.amount_cents))}
            </div>
          </div>
          {co.days_added > 0 && (
            <div>
              {/* Scope creep costs time as well as money, and usually only one of them is quoted. */}
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' }}>Extra time</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{co.days_added} day{co.days_added === 1 ? '' : 's'}</div>
            </div>
          )}
        </div>
      </section>

      {data.decidable && !settled && (
        <section style={{ border: '2px solid #1D3095', borderRadius: 12, padding: 20, background: '#f8f9fd' }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Your decision</h2>
          <p style={{ fontSize: 13, color: '#4a5470', marginTop: 0 }}>
            Typing your name and choosing below records your decision, with the date and time.
          </p>
          <label style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
            Your full name
            <input
              required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
              style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, fontSize: 15, border: '1px solid #c9cfe0', borderRadius: 8 }}
            />
          </label>

          {declining && (
            <label style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
              Why? (optional, but it helps us)
              <textarea
                value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, fontSize: 14, border: '1px solid #c9cfe0', borderRadius: 8 }}
              />
            </label>
          )}

          {error && <div role="alert" style={{ color: '#b42318', fontSize: 14, marginBottom: 10 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => decide('approve')}
              disabled={busy || name.trim().length < 2}
              style={{ padding: '13px 22px', fontSize: 15, fontWeight: 700, borderRadius: 10, border: 0, cursor: busy || name.trim().length < 2 ? 'not-allowed' : 'pointer', background: busy || name.trim().length < 2 ? '#c9cfe0' : '#027a48', color: '#fff' }}
            >
              {busy ? 'Recording…' : 'Approve this change'}
            </button>
            <button
              type="button"
              // Two clicks to decline: the first reveals the reason box. Declining is the answer the
              // firm most needs to understand, and asking why at the moment of the decision is the
              // only time anyone actually knows.
              onClick={() => (declining ? decide('decline') : setDeclining(true))}
              disabled={busy || (declining && name.trim().length < 2)}
              style={{ padding: '13px 22px', fontSize: 15, borderRadius: 10, border: '1px solid #c9cfe0', background: 'transparent', cursor: 'pointer' }}
            >
              {declining ? 'Confirm decline' : 'Decline'}
            </button>
          </div>
        </section>
      )}

      <footer style={{ marginTop: 28, fontSize: 13, color: '#4a5470' }}>
        Questions? {firm.phone ? <>Call <a href={`tel:${firm.phoneE164}`}>{firm.phone}</a></> : null}
        {firm.phone && firm.email ? ' or ' : null}
        {firm.email ? <a href={`mailto:${firm.email}`}>{firm.email}</a> : null}
      </footer>
    </main>
  );
}

'use client';
// app/proposal/[token]/page.tsx — what the customer sees and signs (audit §3, Phase 2 item 9).
//
// The public face of the front door. No account, no login: a link from an email, a document, and one
// button. §3's gap was that this did not exist at all — *"a lead has a `quote_amount` field and that's
// it. There is no document you send, no line items, no scope-of-work template, no acceptance."*
//
// ── THE ACCEPT BUTTON IS DELIBERATELY HARD TO PRESS BY ACCIDENT ─────────────────────────────────
//
// Typing your name is the signature, so the button stays disabled until a name is typed. That is not
// friction for its own sake: a one-click accept on a phone, on a priced contract, is a dispute
// waiting to happen, and the typed name is what makes the E-SIGN audit trail mean something.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface LineItem { description: string; quantity: number; unit: string; unit_price_cents: number; total_cents: number }
interface Payload {
  state: 'acceptable' | 'already_accepted' | 'declined' | 'expired' | 'superseded' | 'not_sent';
  proposal: { version: number; amount_cents: number; scope_of_work: string | null; terms: string | null; line_items: LineItem[]; valid_until: string | null; sent_at: string | null };
  property: { address: string | null; city: string | null; state: string | null; survey_type: string | null } | null;
  customer: { name: string | null; company: string | null } | null;
  firm: { name: string; phone: string | null; phoneE164: string | null; email: string; addressLine1: string; addressLine2: string; logoUrl: string | null };
  acceptance: { accepted_at: string; signed_name: string } | null;
}

const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const STATE_MESSAGE: Record<Payload['state'], string | null> = {
  acceptable: null,
  already_accepted: 'This proposal has been accepted. Thank you — we will be in touch about scheduling.',
  declined: 'This proposal was marked declined. Please contact us if that was not intended.',
  superseded: 'This proposal has been replaced by a newer version. Please use the most recent link we sent you.',
  expired: 'This proposal has expired. Please contact us and we will send you an updated one.',
  not_sent: 'This proposal is not ready to view yet.',
};

export default function ProposalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/proposal/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setLoadError(j.error || 'This proposal link is not valid.'); return; }
      setData(j);
    } catch {
      setLoadError('We could not load this proposal. Please check your connection and try again.');
    }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/public/proposal/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signed_name: name.trim(), signed_email: email.trim() || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      // A 409 "already accepted" is a SUCCESS from the customer's side — they double-clicked, or the
      // first response was lost. Telling them it failed makes them try again.
      if (r.ok || j.alreadyAccepted) { setAccepted(true); load(); }
      else setError(j.error || 'We could not record your acceptance. Please try again or call us.');
    } catch {
      setError('We could not reach the server. Your acceptance was not recorded — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main style={{ maxWidth: 640, margin: '80px auto', padding: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 20 }}>Proposal unavailable</h1>
        <p style={{ color: 'var(--color-doc-body)' }}>{loadError}</p>
      </main>
    );
  }
  if (!data) return <main style={{ maxWidth: 640, margin: '80px auto', padding: 24 }}><p>Loading…</p></main>;

  const { proposal, property, customer, firm } = data;
  const stateMessage = accepted ? null : STATE_MESSAGE[data.state];
  const showForm = data.state === 'acceptable' && !accepted;

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '32px 20px 80px', fontFamily: 'Inter, system-ui, sans-serif', color: 'var(--color-brand-navy-d)' }}>
      <header style={{ borderBottom: '2px solid var(--color-brand-navy)', paddingBottom: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-doc-body)' }}>Proposal</div>
        <h1 style={{ fontSize: 26, margin: '4px 0 0' }}>{firm.name}</h1>
        <div style={{ fontSize: 13, color: 'var(--color-doc-body)', marginTop: 4 }}>
          {firm.addressLine1}{firm.addressLine2 ? `, ${firm.addressLine2}` : ''}
          {firm.phone && <> · <a href={`tel:${firm.phoneE164}`}>{firm.phone}</a></>}
        </div>
      </header>

      {(accepted || data.state === 'already_accepted') && (
        <div role="status" style={{ background: 'var(--color-success-surface)', border: '1px solid var(--color-success-text)', color: 'var(--color-success-text)', padding: '14px 18px', borderRadius: 10, marginBottom: 24 }}>
          <strong>Accepted.</strong>{' '}
          {data.acceptance
            ? `Signed by ${data.acceptance.signed_name} on ${new Date(data.acceptance.accepted_at).toLocaleDateString()}.`
            : 'Thank you — we have recorded your acceptance.'}
          {' '}We will be in touch about scheduling.
        </div>
      )}

      {stateMessage && data.state !== 'already_accepted' && (
        <div role="status" style={{ background: 'var(--color-warning-surface)', border: '1px solid var(--color-warning-text)', color: 'var(--color-warning-text)', padding: '14px 18px', borderRadius: 10, marginBottom: 24 }}>
          {stateMessage}
          {firm.phone && <> Call us at <a href={`tel:${firm.phoneE164}`}>{firm.phone}</a>.</>}
        </div>
      )}

      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Prepared for</div>
            <div style={{ fontSize: 15 }}>{customer?.name || '—'}</div>
            {customer?.company && <div style={{ fontSize: 13, color: 'var(--color-doc-body)' }}>{customer.company}</div>}
          </div>
          {property && (
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Property</div>
              <div style={{ fontSize: 15 }}>{property.address || '—'}</div>
              <div style={{ fontSize: 13, color: 'var(--color-doc-body)' }}>
                {[property.city, property.state].filter(Boolean).join(', ')}
                {property.survey_type ? ` · ${property.survey_type}` : ''}
              </div>
            </div>
          )}
          {proposal.valid_until && (
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Valid until</div>
              <div style={{ fontSize: 15 }}>{new Date(`${proposal.valid_until}T12:00:00Z`).toLocaleDateString()}</div>
            </div>
          )}
        </div>
      </section>

      {proposal.scope_of_work && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, borderBottom: '1px solid var(--color-doc-line)', paddingBottom: 6 }}>Scope of work</h2>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--color-doc-ink)' }}>{proposal.scope_of_work}</p>
        </section>
      )}

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, borderBottom: '1px solid var(--color-doc-line)', paddingBottom: 6 }}>Fee</h2>
        {proposal.line_items.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--color-doc-body)', fontWeight: 600 }}>Item</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--color-doc-body)', fontWeight: 600 }}>Qty</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--color-doc-body)', fontWeight: 600 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {proposal.line_items.map((li, i) => (
                <tr key={i}>
                  <td style={{ padding: '8px 6px', borderTop: '1px solid var(--color-doc-line)' }}>{li.description}</td>
                  <td style={{ padding: '8px 6px', borderTop: '1px solid var(--color-doc-line)', textAlign: 'right' }}>{li.quantity} {li.unit}</td>
                  <td style={{ padding: '8px 6px', borderTop: '1px solid var(--color-doc-line)', textAlign: 'right' }}>{money(li.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--color-brand-navy-d)', marginTop: 8, paddingTop: 10, fontSize: 18, fontWeight: 700 }}>
          <span>Total</span>
          <span style={{ color: 'var(--color-brand-red)' }}>{money(proposal.amount_cents)}</span>
        </div>
      </section>

      {proposal.terms && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, borderBottom: '1px solid var(--color-doc-line)', paddingBottom: 6 }}>Terms</h2>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 13, color: 'var(--color-doc-body)' }}>{proposal.terms}</p>
        </section>
      )}

      {showForm && (
        <section style={{ border: '2px solid var(--color-brand-navy)', borderRadius: 12, padding: 20, background: 'var(--color-doc-surface)' }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Accept this proposal</h2>
          <p style={{ fontSize: 13, color: 'var(--color-doc-body)', marginTop: 0 }}>
            Typing your full name below and pressing Accept is your electronic signature. We record the
            date, time and version you accepted.
          </p>
          <form onSubmit={accept} style={{ display: 'grid', gap: 12 }}>
            <label style={{ fontSize: 13 }}>
              Your full name
              <input
                required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
                style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, fontSize: 15, border: '1px solid var(--color-doc-line-strong)', borderRadius: 8 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Your email (optional — we&rsquo;ll send you a copy)
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, fontSize: 15, border: '1px solid var(--color-doc-line-strong)', borderRadius: 8 }}
              />
            </label>
            {error && <div role="alert" style={{ color: 'var(--color-error-text)', fontSize: 14 }}>{error}</div>}
            <button
              type="submit"
              // Disabled until a name is typed. A one-click accept on a phone, on a priced contract,
              // is a dispute waiting to happen — and the typed name is what the audit trail rests on.
              disabled={busy || name.trim().length < 2}
              style={{
                padding: '14px 24px', fontSize: 16, fontWeight: 700, borderRadius: 10, border: 0, cursor: busy || name.trim().length < 2 ? 'not-allowed' : 'pointer',
                background: busy || name.trim().length < 2 ? 'var(--color-doc-line-strong)' : 'var(--color-brand-red)', color: 'var(--color-bg-card)',
              }}
            >
              {busy ? 'Recording…' : `Accept — ${money(proposal.amount_cents)}`}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}

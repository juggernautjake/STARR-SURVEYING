'use client';
// app/portal/[token]/page.tsx — the customer's view of their own job (audit §3, Phase 2 item 10).
//
// Job status, documents, invoices and change orders, on one page, reached from a link in an email.
// No account, because a surveying customer interacts three times over six weeks and then not again
// for a decade — see seed 524's header for why passwords are the build that fails here.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Deliverable { id: string; name: string; kind: string; revision: number; state: string; file_url: string | null; issued_at: string | null; sealed_at: string | null }
interface Invoice { id: string; invoice_number: string; public_slug: string | null; total_cents: number; status: string; issued_at: string | null; due_at: string | null; paid_at: string | null }
interface ChangeOrder { id: string; number: number; description: string; amount_cents: number; days_added: number; status: string; requested_at: string; decided_at: string | null; public_token: string | null }
interface Payload {
  job: { job_number: string | null; name: string | null; address: string | null; city: string | null; state: string | null; survey_type: string | null; acreage: number | null; date_delivered: string | null; deadline: string | null };
  phase: { label: string; note: string | null; progressPct: number } | null;
  issuedTo: { name: string | null; email: string | null };
  deliverables: Deliverable[];
  invoices: Invoice[];
  changeOrders: ChangeOrder[];
  firm: { name: string; phone: string | null; phoneE164: string | null; email: string; addressLine1: string; addressLine2: string; website: string };
}

const money = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString() : '—');

export default function CustomerPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/portal/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || 'This link is no longer valid.'); return; }
      setData(j);
    } catch {
      setError('We could not load your job. Please check your connection and try again.');
    }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  if (error) {
    return (
      <main style={{ maxWidth: 640, margin: '80px auto', padding: 24, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 20 }}>Link unavailable</h1>
        <p style={{ color: '#4a5470' }}>{error}</p>
      </main>
    );
  }
  if (!data) return <main style={{ maxWidth: 640, margin: '80px auto', padding: 24 }}><p>Loading…</p></main>;

  const { job, phase, firm, deliverables, invoices, changeOrders } = data;
  const unpaid = invoices.filter((i) => !i.paid_at);

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px 80px', fontFamily: 'Inter, system-ui, sans-serif', color: '#152050' }}>
      <header style={{ borderBottom: '2px solid #1D3095', paddingBottom: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4a5470' }}>Your survey</div>
        <h1 style={{ fontSize: 24, margin: '4px 0 0' }}>{job.address || job.name || 'Your job'}</h1>
        <div style={{ fontSize: 13, color: '#4a5470', marginTop: 4 }}>
          {[job.city, job.state].filter(Boolean).join(', ')}
          {job.survey_type ? ` · ${job.survey_type}` : ''}
          {job.acreage ? ` · ${job.acreage} acres` : ''}
          {job.job_number ? ` · Job ${job.job_number}` : ''}
        </div>
      </header>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, borderBottom: '1px solid #e4e7ee', paddingBottom: 6 }}>Where things stand</h2>
        {phase ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{phase.label}</div>
              <div style={{ fontSize: 13, color: '#4a5470' }}>{phase.progressPct}%</div>
            </div>
            <div style={{ height: 10, background: '#e4e7ee', borderRadius: 999, overflow: 'hidden', margin: '8px 0' }}>
              <div style={{ width: `${phase.progressPct}%`, height: '100%', background: '#1D3095' }} />
            </div>
            {phase.note && <p style={{ color: '#31405f', fontSize: 14, margin: 0 }}>{phase.note}</p>}
          </>
        ) : (
          // A stage the firm chose not to publish, or one nobody has mapped. Either way the customer
          // gets a neutral sentence and a phone number rather than an internal stage name.
          <p style={{ color: '#4a5470', fontSize: 14 }}>
            Your job is in progress. {firm.phone ? <>Call us at <a href={`tel:${firm.phoneE164}`}>{firm.phone}</a> for an update.</> : 'Contact us for an update.'}
          </p>
        )}
        {job.deadline && <p style={{ fontSize: 13, color: '#4a5470', marginTop: 8 }}>Target completion: {date(job.deadline)}</p>}
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, borderBottom: '1px solid #e4e7ee', paddingBottom: 6 }}>Your documents</h2>
        {deliverables.length === 0 ? (
          <p style={{ color: '#4a5470', fontSize: 14 }}>Nothing has been issued yet. Your documents will appear here as soon as they are ready.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {deliverables.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: '1px solid #e4e7ee', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 15 }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: '#4a5470' }}>
                    Revision {d.revision} · Issued {date(d.issued_at)}
                    {/* "Signed and sealed" is the state that means something legally, and the one a
                        lender or title company asks about. Said in words, not implied by a badge. */}
                    {d.sealed_at ? ' · Signed and sealed' : ''}
                  </div>
                </div>
                {d.file_url
                  ? <a href={d.file_url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>Download</a>
                  : <span style={{ fontSize: 12, color: '#4a5470' }}>Contact us for a copy</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {changeOrders.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, borderBottom: '1px solid #e4e7ee', paddingBottom: 6 }}>Changes to the work</h2>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {changeOrders.map((c) => (
              <div key={c.id} style={{ border: '1px solid #e4e7ee', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 14 }}>Change #{c.number} — {c.description}</div>
                  <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{c.amount_cents >= 0 ? '+' : '−'}{money(Math.abs(c.amount_cents))}</div>
                </div>
                <div style={{ fontSize: 12, color: '#4a5470', marginTop: 4 }}>
                  {c.days_added > 0 && `${c.days_added} extra day${c.days_added === 1 ? '' : 's'} · `}
                  {c.status === 'sent' ? 'Awaiting your approval' : c.status === 'approved' ? `Approved ${date(c.decided_at)}` : `Declined ${date(c.decided_at)}`}
                </div>
                {c.status === 'sent' && c.public_token && (
                  <a href={`/change-order/${c.public_token}`} style={{ display: 'inline-block', marginTop: 8, fontWeight: 600 }}>Review and approve →</a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, borderBottom: '1px solid #e4e7ee', paddingBottom: 6 }}>Invoices</h2>
        {invoices.length === 0 ? (
          <p style={{ color: '#4a5470', fontSize: 14 }}>No invoices yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {invoices.map((i) => (
              <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: '1px solid #e4e7ee', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 15 }}>{i.invoice_number}</div>
                  <div style={{ fontSize: 12, color: '#4a5470' }}>
                    {i.paid_at ? `Paid ${date(i.paid_at)}` : i.due_at ? `Due ${date(i.due_at)}` : 'Issued'}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{money(i.total_cents)}</div>
                {!i.paid_at && i.public_slug && (
                  // Straight into the pay portal the firm already has. §2.2's complaint was that a
                  // customer had to know their invoice number to reach it; from here they do not.
                  <a href={`/pay/${encodeURIComponent(i.public_slug)}`} style={{ fontWeight: 600, color: '#BD1218' }}>Pay now</a>
                )}
              </div>
            ))}
          </div>
        )}
        {unpaid.length > 0 && (
          <p style={{ fontSize: 13, color: '#4a5470', marginTop: 8 }}>
            Balance outstanding: <strong>{money(unpaid.reduce((a, i) => a + i.total_cents, 0))}</strong>
          </p>
        )}
      </section>

      <footer style={{ borderTop: '1px solid #e4e7ee', paddingTop: 16, fontSize: 13, color: '#4a5470' }}>
        <div><strong style={{ color: '#152050' }}>{firm.name}</strong></div>
        <div>{firm.addressLine1}{firm.addressLine2 ? `, ${firm.addressLine2}` : ''}</div>
        <div>
          {firm.phone && <a href={`tel:${firm.phoneE164}`}>{firm.phone}</a>}
          {firm.phone && firm.email && ' · '}
          {firm.email && <a href={`mailto:${firm.email}`}>{firm.email}</a>}
        </div>
      </footer>
    </main>
  );
}

'use client';

// app/admin/invoicing/page.tsx
//
// S6 of CUSTOMER_INVOICING_BUILD_2026-06-21.md — office invoicing dashboard.
// Lists every customer invoice with status + total, links to the composer
// (/admin/invoices/new), the payments inbox (/admin/payments/inbox), each
// invoice's customer pay page, and a one-click copy of the direct pay link.
//
// invoicing-cards-2026-06-22 — restyled from a tight table row into a
// card-per-invoice grid. Default sort: every NON-paid invoice (Draft,
// Sent, Past due, Partial, etc.) above the paid pile, both groups
// ordered most-recent-first by created_at. Each card shows the linked
// job (clickable to /admin/jobs/{id}) when present.
//
// Backend page — gated by admin login (no extra password). The customer-facing
// /pay portal is the password-gated surface (S7).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { describeInvoiceStatus, formatDollars } from '@/lib/payments/live';
import '../payments-admin.css';

const TONE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  success: { bg: '#E7F6EC', fg: '#1B7A3D', border: '#9DD9B0' },
  warn:    { bg: '#FFF4E0', fg: '#8A5A12', border: '#F2CB7C' },
  danger:  { bg: '#FDECEC', fg: '#9C0E13', border: '#F2B0B3' },
  info:    { bg: '#EAF0FB', fg: '#1D3095', border: '#B6C6EE' },
};

interface InvoiceJob {
  id: string;
  name: string | null;
  job_number: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  public_slug: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  total_cents: number;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
  job_id: string | null;
  job: InvoiceJob | null;
}

const PAID_STATUSES = new Set(['paid', 'refunded', 'void']);

function formatLongDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function sortInvoices(invoices: InvoiceRow[]): InvoiceRow[] {
  // Two-tier sort: unpaid first, then paid; within each tier, newest
  // by created_at first. Stable in modern engines so a tie keeps the
  // server's order.
  return [...invoices].sort((a, b) => {
    const aPaid = PAID_STATUSES.has(a.status);
    const bPaid = PAID_STATUSES.has(b.status);
    if (aPaid !== bPaid) return aPaid ? 1 : -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function InvoicingDashboardPage(): React.ReactElement {
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/invoices')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (!cancelled) setInvoices((j.invoices ?? []) as InvoiceRow[]); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!invoices) return [];
    const sorted = sortInvoices(invoices);
    if (!query.trim()) return sorted;
    const q = query.toLowerCase();
    return sorted.filter((inv) =>
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.customer_name ?? '').toLowerCase().includes(q) ||
      (inv.customer_email ?? '').toLowerCase().includes(q) ||
      (inv.job?.name ?? '').toLowerCase().includes(q) ||
      (inv.job?.job_number ?? '').toLowerCase().includes(q),
    );
  }, [invoices, query]);

  const counts = useMemo(() => {
    if (!invoices) return { total: 0, paid: 0, outstanding: 0 };
    let paid = 0;
    for (const inv of invoices) if (PAID_STATUSES.has(inv.status)) paid += 1;
    return { total: invoices.length, paid, outstanding: invoices.length - paid };
  }, [invoices]);

  function payLink(slug: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/pay/${slug}`;
  }

  function copyLink(inv: InvoiceRow) {
    navigator.clipboard?.writeText(payLink(inv.public_slug)).then(
      () => { setCopiedId(inv.id); window.setTimeout(() => setCopiedId(null), 2000); },
      () => {},
    );
  }

  return (
    <main className="invoice-page" data-payments-admin data-testid="invoicing-dashboard">
      <div className="invoice-page__card" style={{ maxWidth: 1200 }}>
        <div style={styles.headerRow}>
          <div>
            <h1 className="invoice-page__title">Invoicing</h1>
            <p className="invoice-page__lede">
              Create, send, and track customer invoices + payments. Unpaid
              invoices float to the top; paid ones drop to the bottom.
            </p>
          </div>
          <div style={styles.headerActions}>
            <Link href="/admin/payments/inbox" className="invoice-btn invoice-btn--ghost">Payments inbox</Link>
            <Link href="/admin/invoices/new" className="invoice-btn" data-testid="invoicing-new">+ New invoice</Link>
          </div>
        </div>

        {invoices !== null && (
          <div style={styles.statRow}>
            <span style={styles.statPill}>
              <strong>{counts.total}</strong> total
            </span>
            <span style={{ ...styles.statPill, ...styles.statOutstanding }}>
              <strong>{counts.outstanding}</strong> outstanding
            </span>
            <span style={{ ...styles.statPill, ...styles.statPaid }}>
              <strong>{counts.paid}</strong> paid
            </span>
          </div>
        )}

        <input
          type="search"
          placeholder="Search by invoice #, customer, email, or linked job…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="invoicing-search"
          style={styles.search}
        />

        {error && <p className="invoice-page__error" role="alert">Couldn&rsquo;t load invoices: {error}</p>}
        {invoices === null && !error && <p data-testid="invoicing-loading">Loading invoices…</p>}

        {invoices !== null && filtered.length === 0 && (
          <div data-testid="invoicing-empty" style={styles.emptyState}>
            {invoices.length === 0
              ? 'No invoices yet. Tap + New invoice to create your first one.'
              : 'No invoices match your search.'}
          </div>
        )}

        {filtered.length > 0 && (
          <div style={styles.cardGrid} data-testid="invoicing-list">
            {filtered.map((inv) => {
              const status = describeInvoiceStatus(inv.status);
              const tone = TONE_COLORS[status.tone] ?? TONE_COLORS.info;
              const isPaid = PAID_STATUSES.has(inv.status);
              return (
                <article
                  key={inv.id}
                  data-testid={`invoicing-row-${inv.invoice_number}`}
                  style={{
                    ...styles.card,
                    borderLeft: `4px solid ${tone.border}`,
                    opacity: isPaid ? 0.85 : 1,
                  }}
                >
                  <header style={styles.cardHeader}>
                    <div style={styles.cardHeaderText}>
                      <span style={styles.invoiceNumber}>{inv.invoice_number}</span>
                      <span style={{
                        ...styles.statusPill,
                        background: tone.bg,
                        color: tone.fg,
                        borderColor: tone.border,
                      }}>
                        {status.label}
                      </span>
                    </div>
                    <div style={styles.totalWrap}>
                      <span style={styles.totalLabel}>Total</span>
                      <span style={styles.totalValue}>{formatDollars(inv.total_cents)}</span>
                    </div>
                  </header>

                  <div style={styles.cardBody}>
                    <div style={styles.customerBlock}>
                      <span style={styles.customerName}>{inv.customer_name || 'Unknown customer'}</span>
                      {inv.customer_email && (
                        <a
                          href={`mailto:${inv.customer_email}`}
                          style={styles.customerEmail}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {inv.customer_email}
                        </a>
                      )}
                    </div>

                    <dl style={styles.metaList}>
                      <div style={styles.metaRow}>
                        <dt style={styles.metaKey}>Created</dt>
                        <dd style={styles.metaVal}>{formatLongDate(inv.created_at)}</dd>
                      </div>
                      {inv.issued_at && (
                        <div style={styles.metaRow}>
                          <dt style={styles.metaKey}>Sent</dt>
                          <dd style={styles.metaVal}>{formatLongDate(inv.issued_at)}</dd>
                        </div>
                      )}
                      {inv.due_at && (
                        <div style={styles.metaRow}>
                          <dt style={styles.metaKey}>Due</dt>
                          <dd style={styles.metaVal}>{formatLongDate(inv.due_at)}</dd>
                        </div>
                      )}
                      {inv.paid_at && (
                        <div style={styles.metaRow}>
                          <dt style={styles.metaKey}>Paid</dt>
                          <dd style={styles.metaVal}>{formatLongDate(inv.paid_at)}</dd>
                        </div>
                      )}
                    </dl>

                    {inv.job ? (
                      <Link
                        href={`/admin/jobs/${inv.job.id}`}
                        style={styles.jobBadge}
                        title={`Open linked job ${inv.job.job_number ?? ''}`}
                      >
                        <span style={styles.jobBadgeIcon} aria-hidden>🔗</span>
                        <span style={styles.jobBadgeText}>
                          <span style={styles.jobBadgeNumber}>
                            {inv.job.job_number ?? 'Linked job'}
                          </span>
                          {inv.job.name && (
                            <span style={styles.jobBadgeName}>{inv.job.name}</span>
                          )}
                        </span>
                        <span style={styles.jobBadgeArrow} aria-hidden>→</span>
                      </Link>
                    ) : (
                      <p style={styles.noJob}>
                        Not linked to a job —{' '}
                        <Link href={`/admin/invoices/new?duplicate=${inv.id}`} style={styles.inlineLink}>
                          edit
                        </Link>{' '}
                        to attach one.
                      </p>
                    )}
                  </div>

                  <footer style={styles.cardActions}>
                    <a
                      href={payLink(inv.public_slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="invoice-btn invoice-btn--ghost"
                      style={styles.actionBtn}
                    >
                      View
                    </a>
                    <button
                      type="button"
                      className="invoice-btn invoice-btn--ghost"
                      style={styles.actionBtn}
                      onClick={() => copyLink(inv)}
                      data-testid={`invoicing-copy-${inv.invoice_number}`}
                    >
                      {copiedId === inv.id ? 'Copied ✓' : 'Copy link'}
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  headerActions: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  statRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    margin: '1rem 0 0.4rem',
  },
  statPill: {
    fontSize: '0.82rem',
    padding: '0.32rem 0.8rem',
    borderRadius: 9999,
    background: '#F1F5F9',
    color: '#1F2937',
  },
  statOutstanding: {
    background: '#FFF4E0',
    color: '#8A5A12',
  },
  statPaid: {
    background: '#E7F6EC',
    color: '#1B7A3D',
  },
  search: {
    font: 'inherit',
    padding: '0.65rem 0.85rem',
    border: '1px solid #d6d9e3',
    borderRadius: 10,
    width: '100%',
    margin: '0.75rem 0 1rem',
  },
  emptyState: {
    padding: '2rem',
    textAlign: 'center',
    color: '#6b7280',
    background: '#F9FAFB',
    border: '1px dashed #d6d9e3',
    borderRadius: 12,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '1rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 12,
    padding: '1rem',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '0.5rem',
  },
  cardHeaderText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
    minWidth: 0,
  },
  invoiceNumber: {
    fontSize: '0.95rem',
    fontWeight: 700,
    fontFamily: 'SF Mono, Menlo, monospace',
    color: '#1F2937',
  },
  statusPill: {
    alignSelf: 'flex-start',
    fontSize: '0.72rem',
    padding: '0.18rem 0.6rem',
    borderRadius: 9999,
    fontWeight: 700,
    border: '1px solid transparent',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  totalWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
  },
  totalLabel: {
    fontSize: '0.68rem',
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: '#1F2937',
    whiteSpace: 'nowrap',
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  customerBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  customerName: {
    fontSize: '0.92rem',
    fontWeight: 600,
    color: '#1F2937',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  customerEmail: {
    fontSize: '0.78rem',
    color: '#1D3095',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  metaList: {
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0.35rem 0.75rem',
    fontSize: '0.78rem',
  },
  metaRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
  },
  metaKey: {
    margin: 0,
    color: '#6B7280',
    fontWeight: 600,
    fontSize: '0.68rem',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaVal: {
    margin: 0,
    color: '#1F2937',
  },
  jobBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.55rem',
    background: '#EAF0FB',
    border: '1px solid #B6C6EE',
    color: '#1D3095',
    borderRadius: 10,
    padding: '0.55rem 0.8rem',
    textDecoration: 'none',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  jobBadgeIcon: { fontSize: '1rem' },
  jobBadgeText: {
    flex: '1 1 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  jobBadgeNumber: {
    fontFamily: 'SF Mono, Menlo, monospace',
    fontWeight: 700,
    fontSize: '0.82rem',
  },
  jobBadgeName: {
    fontSize: '0.78rem',
    color: '#1D3095',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  jobBadgeArrow: { fontSize: '0.95rem' },
  noJob: {
    margin: 0,
    fontSize: '0.78rem',
    color: '#6B7280',
    fontStyle: 'italic',
  },
  inlineLink: {
    color: '#1D3095',
    fontWeight: 600,
    textDecoration: 'underline',
  },
  cardActions: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
    paddingTop: '0.5rem',
    borderTop: '1px solid #F1F5F9',
  },
  actionBtn: {
    padding: '0.4rem 0.85rem',
    fontSize: '0.82rem',
  },
};

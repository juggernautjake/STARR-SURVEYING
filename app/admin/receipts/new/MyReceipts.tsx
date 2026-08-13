'use client';
// app/admin/receipts/new/MyReceipts.tsx — "what happened to the ones I sent?"
//
// R1 let everyone at the firm file a receipt. Until this, nobody could see the result: the approval
// queue is a bookkeeper's page, correctly. So the flow ended in a void — photograph a receipt, and
// then nothing, ever. Submitting into a void is most of why people stop submitting.
//
// It sits under the capture form rather than on its own page for one reason: the moment somebody
// wonders "did last week's fuel go through?" is the moment they are standing there filing this
// week's. A separate page would be a second thing to find.
//
// Read-only on purpose. Editing a submitted receipt is the bookkeeper's job and has its own audit
// trail; a second editing surface would be a second way to change money that nothing watches.

import { useCallback, useEffect, useState } from 'react';

import type { MyReceiptRow } from '@/app/api/admin/receipts/mine/route';

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: '#FEF3C7', fg: '#92400E', label: 'Waiting on the bookkeeper' },
  approved: { bg: '#D1FAE5', fg: '#065F46', label: 'Approved' },
  rejected: { bg: '#FEE2E2', fg: '#991B1B', label: 'Sent back' },
  exported: { bg: '#E5E7EB', fg: '#374151', label: 'On the books' },
};

function money(cents: number | null): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function MyReceipts({ refreshKey }: { refreshKey?: number }) {
  const [rows, setRows] = useState<MyReceiptRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/receipts/mine?limit=20');
      if (!res.ok) throw new Error(`Could not load your receipts (${res.status})`);
      const data = (await res.json()) as { receipts?: MyReceiptRow[] };
      setRows(data.receipts ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRows([]);
    }
  }, []);

  // `refreshKey` changes after an upload, so a receipt filed a second ago appears without a reload —
  // the confirmation that the thing actually went somewhere.
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (rows === null) return null; // First load: the capture form is the point; don't flash a skeleton above it.
  if (rows.length === 0 && !error) return null; // Nothing filed yet — an empty box would just be noise.

  return (
    <section style={S.wrap} aria-label="Receipts you have submitted">
      <h2 style={S.title}>Your recent receipts</h2>
      {error ? <p style={S.error}>{error}</p> : null}
      <ul style={S.list}>
        {rows.map((r) => {
          const chip = STATUS_STYLE[r.status] ?? {
            bg: '#E5E7EB',
            fg: '#374151',
            label: r.status,
          };
          // The AI has not finished (or could not read it). Said plainly, because a blank vendor is
          // otherwise indistinguishable from a receipt that failed to upload.
          const stillReading =
            r.extraction_status === 'queued' || r.extraction_status === 'running';
          return (
            <li key={r.id} style={S.row}>
              <div style={S.main}>
                <span style={S.vendor}>
                  {r.vendor_name?.trim() ||
                    (stillReading ? 'Reading the photo…' : 'No vendor read from the photo')}
                </span>
                <span style={S.meta}>
                  {when(r.transaction_at ?? r.created_at)}
                  {r.job_label ? ` · ${r.job_label}` : ''}
                  {r.category ? ` · ${r.category.replace(/_/g, ' ')}` : ''}
                </span>
                {/* The one thing a submitter must not miss. A rejection with no visible reason is
                    how a receipt sits unfixed for a month. */}
                {r.status === 'rejected' && r.rejected_reason ? (
                  <span style={S.reason}>Reason: {r.rejected_reason}</span>
                ) : null}
              </div>
              <div style={S.right}>
                <span style={S.total}>{money(r.total_cents)}</span>
                <span style={{ ...S.chip, background: chip.bg, color: chip.fg }}>{chip.label}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { marginTop: 24, minWidth: 0 },
  title: {
    margin: '0 0 10px',
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--theme-fg-primary, #1F2937)',
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  // Wraps rather than overflowing: on a narrow phone the amount + chip drop below the vendor line
  // instead of pushing the row past the screen edge. M4's rule at the point of change.
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    padding: '10px 12px',
    border: '1px solid var(--theme-border, #E5E7EB)',
    borderRadius: 8,
    background: 'var(--theme-bg-surface)',
    minWidth: 0,
  },
  main: { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 200px', minWidth: 0 },
  vendor: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--theme-fg-primary, #1F2937)',
    overflowWrap: 'anywhere',
  },
  meta: {
    fontSize: 12,
    color: 'var(--theme-fg-muted)',
    overflowWrap: 'anywhere',
  },
  reason: { fontSize: 12, color: '#991B1B', overflowWrap: 'anywhere' },
  right: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  total: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--theme-fg-primary, #1F2937)',
    fontVariantNumeric: 'tabular-nums',
  },
  chip: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  error: { fontSize: 13, color: '#991B1B', margin: '0 0 8px' },
};

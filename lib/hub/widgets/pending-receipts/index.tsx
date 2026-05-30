'use client';
// Slice 136 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 210 of hub-grid-8x8-square-cells-2026-05-29.md — bucket-aware
// rendering so the widget reads cleanly at every size.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

// Slice 15 — wired to the Slice-12 schema fields:
//   - maxItems:  clamp the rendered list to 1–20; null → size cap
//   - showAmount: when false, hide the right-aligned $ column so the
//                 widget reads as a focused queue (count + names only)
import { resolveBoundedInt, resolveBool } from '@/lib/hub/widgets/_shared/content-resolvers';

export interface PendingReceiptsContent extends Record<string, unknown> {
  maxItems?: number;
  showAmount?: boolean;
}
const DEFAULTS: PendingReceiptsContent = { maxItems: 5, showAmount: true };

export const resolveMaxItems = (c: PendingReceiptsContent): number | null =>
  resolveBoundedInt(c.maxItems, 1, 20, null);
export const resolveShowAmount = (c: PendingReceiptsContent): boolean =>
  resolveBool(c.showAmount, true);

interface Receipt { id: string; vendor?: string | null; amount: number; submitted_by?: string | null; }

// hub-widget-excellence-11 R1 — the receipts GET returns rows with
// `vendor_name` / `total_cents` / `submitted_by_name|_email`, NOT the
// `vendor` / `amount` / `submitted_by` this widget originally read (so
// vendor was always "Vendor" + amounts were $0.00). Map the real shape.
interface RawReceipt {
  id: string;
  vendor_name?: string | null;
  total_cents?: number | null;
  submitted_by_name?: string | null;
  submitted_by_email?: string | null;
}

/** Map a raw receipts-API row to the widget's row. Pure + exported. */
export function toPendingReceipt(r: RawReceipt): Receipt {
  const cents = typeof r.total_cents === 'number' && Number.isFinite(r.total_cents) ? r.total_cents : 0;
  return {
    id: r.id,
    vendor: r.vendor_name ?? null,
    amount: cents / 100,
    submitted_by: r.submitted_by_name ?? r.submitted_by_email ?? null,
  };
}

function PendingReceiptsWidget({ size, content }: WidgetProps<PendingReceiptsContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const explicitCap = resolveMaxItems(content);
  const showAmount = resolveShowAmount(content);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<Receipt[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/receipts?status=pending');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { receipts?: RawReceipt[] } = await res.json();
      const receipts = (data.receipts ?? []).map(toPendingReceipt);
      setItems(receipts);
      setStatus(receipts.length === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={Math.min(3, capForBucket(bucket))} />;
  if (status === 'empty') return <PendingReceiptsEmpty bucket={bucket} />;

  // Tiny — single big number + total. No list room.
  if (bucket === 'tiny') {
    const total = items.reduce((s, r) => s + r.amount, 0);
    return (
      <div style={tinyWrapStyle}>
        <span style={tinyCountStyle}>{items.length}</span>
        <span style={tinyLabelStyle}>pending</span>
        <span style={tinyTotalStyle}>${total.toFixed(0)}</span>
      </div>
    );
  }

  const cap = explicitCap ?? capForBucket(bucket);
  const visible = items.slice(0, cap);
  // Small — compact rows, no submitter / date columns.
  // Medium+ — adds submitter or date depending on space.
  return (
    <ul role="list" style={listStyle}>
      {visible.map((r) => (
        <li key={r.id} style={rowStyle}>
          <span style={vendorStyle}>{r.vendor ?? 'Vendor'}</span>
          {bucket !== 'small' && r.submitted_by && (
            <span style={mutedStyle}>{r.submitted_by}</span>
          )}
          {showAmount && (
            <span style={amountStyle}>${r.amount.toFixed(2)}</span>
          )}
        </li>
      ))}
      {items.length > cap && (
        <li style={moreRowStyle}>+ {items.length - cap} more</li>
      )}
    </ul>
  );
}

function PendingReceiptsEmpty({ bucket }: { bucket: SizeBucket }) {
  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle}>
        <span style={tinyCountStyle}>0</span>
        <span style={tinyLabelStyle}>clear</span>
      </div>
    );
  }
  return <WidgetEmpty icon="🧾" title="Receipts clear" description="Pending receipts appear here for approval." />;
}

// consolidation Slice 3 (2026-05-30) — SUPERSEDED by `approvals`,
// the unified hours/receipts/time-off widget. Stays registered so
// saved hub layouts keep their tile.
defineWidget<PendingReceiptsContent>({
  id: 'pending-receipts',
  label: 'Pending Receipts',
  description: 'Receipts awaiting your approval.',
  category: 'office',
  iconName: 'Receipt',
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'tech_support'],
  Widget: PendingReceiptsWidget,
});

// ─── Helpers (exported for tests) ────────────────────────────────────

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 0;  // tiny renders the counter, not a list
    case 'small':  return 3;
    case 'medium': return 6;
    case 'large':  return 12;
    case 'xlarge': return 24;
  }
}

// ─── Style fragments ─────────────────────────────────────────────────

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hub-spc-2, 8px)',
  minWidth: 0,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '6px 12px',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
  minWidth: 0,
};

const vendorStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const mutedStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
  flexShrink: 0,
};

const amountStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  color: 'var(--theme-warning)',
  flexShrink: 0,
};

const moreRowStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
  padding: '4px 0',
};

const tinyWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 2,
};

const tinyCountStyle: React.CSSProperties = {
  fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
  fontWeight: 700,
  lineHeight: 1,
  color: 'var(--theme-warning)',
};

const tinyLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const tinyTotalStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  fontWeight: 600,
  color: 'var(--theme-fg-primary)',
  marginTop: 2,
};

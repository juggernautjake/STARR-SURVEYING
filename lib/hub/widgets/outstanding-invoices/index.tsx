'use client';
// Slice 140 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

// Slice 14 of employee-hub-overhaul-2026-05-30.md — content honors the
// Slice-12 schema fields:
//   - maxItems: caps the rendered list (1–20). When set, overrides the
//     size-bucket cap so the surveyor can shrink the list at any size.
//   - sortBy:   'due-date' | 'amount' | 'customer'.
//   - showAging: when true + due_date present, appends "N days late" /
//     "due in N" pill to each row.
export type InvoiceSortBy = 'due-date' | 'amount' | 'customer';
export interface OutstandingInvoicesContent extends Record<string, unknown> {
  maxItems?: number;
  sortBy?: InvoiceSortBy;
  showAging?: boolean;
}
const DEFAULTS: OutstandingInvoicesContent = {
  maxItems: 5,
  sortBy: 'due-date',
  showAging: true,
};

// hub-widget-excellence-11 R1 — realigned to the real billing source:
// `/api/admin/billing/invoices` reads the org's Stripe subscription
// invoices (the same data the /admin/billing/invoices footer page
// shows). "Outstanding" = status 'open'. `label` is the invoice number;
// `amount` is the unpaid balance in dollars; `href` is the Stripe-hosted
// invoice page for the row deep link.
interface Invoice { id: string; label: string; amount: number; due_date?: string | null; href?: string | null; }

interface BillingInvoice {
  id: string;
  number?: string | null;
  status: string;
  amountDueCents?: number | null;
  amountPaidCents?: number | null;
  periodEnd?: string | null;
  hostedUrl?: string | null;
}

/** Map a billing invoice to the widget's row shape; returns null for
 *  anything that isn't an open (unpaid) invoice. Pure + exported. */
export function toOutstandingInvoice(b: BillingInvoice): Invoice | null {
  if (b.status !== 'open') return null;
  const due = (b.amountDueCents ?? 0) - (b.amountPaidCents ?? 0);
  if (due <= 0) return null;
  return {
    id: b.id,
    label: b.number?.trim() || 'Invoice',
    amount: due / 100,
    due_date: b.periodEnd ?? null,
    href: b.hostedUrl ?? null,
  };
}

export function resolveSortBy(c: OutstandingInvoicesContent): InvoiceSortBy {
  return c.sortBy === 'due-date' || c.sortBy === 'amount' || c.sortBy === 'customer'
    ? c.sortBy
    : 'due-date';
}

export function resolveMaxItems(c: OutstandingInvoicesContent): number | null {
  const n = c.maxItems;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return null;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

export function resolveShowAging(c: OutstandingInvoicesContent): boolean {
  return c.showAging !== false; // default true
}

export function sortInvoices(items: Invoice[], by: InvoiceSortBy): Invoice[] {
  const copy = [...items];
  switch (by) {
    case 'amount':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'customer':
      return copy.sort((a, b) => a.label.localeCompare(b.label));
    case 'due-date':
    default:
      return copy.sort((a, b) => {
        const ad = a.due_date ? Date.parse(a.due_date) : Number.POSITIVE_INFINITY;
        const bd = b.due_date ? Date.parse(b.due_date) : Number.POSITIVE_INFINITY;
        return ad - bd;
      });
  }
}

export function agingLabel(dueDate: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (!dueDate) return null;
  const due = Date.parse(dueDate);
  if (!Number.isFinite(due)) return null;
  const days = Math.floor((nowMs - due) / 86400000);
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} late`;
  if (days === 0) return 'due today';
  return `due in ${-days}d`;
}

function OutstandingInvoicesWidget({ size, content }: WidgetProps<OutstandingInvoicesContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const sortBy = resolveSortBy(content);
  const explicitCap = resolveMaxItems(content);
  const showAging = resolveShowAging(content);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<Invoice[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/billing/invoices');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { invoices?: BillingInvoice[] } = await res.json();
      const outstanding = (data.invoices ?? [])
        .map(toOutstandingInvoice)
        .filter((i): i is Invoice => i !== null);
      setItems(outstanding);
      setStatus(outstanding.length === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>unpaid</span>
        </div>
      );
    }
    return <WidgetEmpty icon="🧾" title="All paid up" description="Outstanding invoices appear here." />;
  }

  const sorted = sortInvoices(items, sortBy);
  const total = sorted.reduce((sum, i) => sum + i.amount, 0);
  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>{sorted.length}</span>
        <span style={tinyStatLabelStyle()}>{'unpaid'}</span>
      </div>
    );
  }

  // Slice 14 — when the surveyor's explicit cap is set, honor it
  // verbatim; otherwise fall back to the size-bucket cap so existing
  // hub layouts keep their previous density.
  const sizeCap = bucket === 'small' ? 3 : bucket === 'medium' ? 5 : bucket === 'large' ? 10 : 20;
  const cap = explicitCap ?? sizeCap;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 'var(--hub-font-2xl, 1.5rem)', fontWeight: 700, color: 'var(--theme-warning)' }}>
        ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>across {sorted.length} invoices</span>
      {cap > 0 && (
        <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sorted.slice(0, cap).map((i) => {
            const aging = showAging ? agingLabel(i.due_date) : null;
            const rowInner = (
              <>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
                  {aging && (
                    <span style={{ color: 'var(--theme-fg-secondary)', fontSize: '0.7rem' }}>
                      {aging}
                    </span>
                  )}
                  <span style={{ fontWeight: 600 }}>${i.amount.toFixed(2)}</span>
                </span>
              </>
            );
            const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'inherit', textDecoration: 'none' };
            return (
              <li key={i.id}>
                {/* Build/Wire — deep-link each row to its Stripe-hosted
                    invoice page when available. */}
                {i.href ? (
                  <a href={i.href} target="_blank" rel="noopener noreferrer" style={rowStyle} aria-label={`Open invoice ${i.label}`}>
                    {rowInner}
                  </a>
                ) : (
                  <span style={rowStyle}>{rowInner}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

defineWidget<OutstandingInvoicesContent>({
  id: 'outstanding-invoices',
  label: 'Outstanding Invoices',
  description: 'Invoices awaiting payment.',
  category: 'financial',
  iconName: 'Coins',
  defaultSize: { w: 3, h: 2 },
  // Slice 217 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'tech_support'],
  Widget: OutstandingInvoicesWidget,
});

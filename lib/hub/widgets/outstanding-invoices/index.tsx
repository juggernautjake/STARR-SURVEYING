'use client';
// Slice 140 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export interface OutstandingInvoicesContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: OutstandingInvoicesContent = {};

interface Invoice { id: string; client_name: string; amount: number; due_date?: string | null; }

function OutstandingInvoicesWidget({ size }: WidgetProps<OutstandingInvoicesContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<Invoice[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/invoices?status=outstanding');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { invoices?: Invoice[] } = await res.json();
      setItems(data.invoices ?? []);
      setStatus((data.invoices ?? []).length === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') return <WidgetEmpty icon="🧾" title="All paid up" description="Outstanding invoices appear here." />;

  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const cap = bucket === 'tiny' ? 0 : bucket === 'small' ? 3 : bucket === 'medium' ? 5 : bucket === 'large' ? 10 : 20;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 'var(--hub-font-2xl, 1.5rem)', fontWeight: 700, color: 'var(--theme-warning)' }}>
        ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>across {items.length} invoices</span>
      {cap > 0 && (
        <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.slice(0, cap).map((i) => (
            <li key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--hub-font-xs, 0.75rem)' }}>
              <span>{i.client_name}</span>
              <span style={{ fontWeight: 600 }}>${i.amount.toFixed(2)}</span>
            </li>
          ))}
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
  minSize: { w: 2, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'tech_support'],
  Widget: OutstandingInvoicesWidget,
});

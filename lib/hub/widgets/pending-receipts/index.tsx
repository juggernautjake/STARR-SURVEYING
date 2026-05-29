'use client';
// Slice 136 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export interface PendingReceiptsContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: PendingReceiptsContent = {};

interface Receipt { id: string; vendor?: string | null; amount: number; submitted_by?: string | null; submitted_at: string; }

function PendingReceiptsWidget({ size }: WidgetProps<PendingReceiptsContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<Receipt[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/receipts?status=pending');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { receipts?: Receipt[] } = await res.json();
      setItems(data.receipts ?? []);
      setStatus((data.receipts ?? []).length === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') return <WidgetEmpty icon="🧾" title="Receipts clear" description="Pending receipts appear here for approval." />;

  const cap = bucket === 'tiny' ? 2 : bucket === 'small' ? 4 : bucket === 'medium' ? 6 : bucket === 'large' ? 12 : 24;
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {items.slice(0, cap).map((r) => (
        <li key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
          <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{r.vendor ?? 'Vendor'}</span>
          <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, color: 'var(--theme-warning)' }}>${r.amount.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  );
}

defineWidget<PendingReceiptsContent>({
  id: 'pending-receipts',
  label: 'Pending Receipts',
  description: 'Receipts awaiting your approval.',
  category: 'office',
  iconName: 'Receipt',
  defaultSize: { w: 4, h: 2 },
  minSize: { w: 2, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'tech_support'],
  Widget: PendingReceiptsWidget,
});

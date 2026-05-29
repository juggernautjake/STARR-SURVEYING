'use client';
// Slice 137 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export interface PendingTimeOffContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: PendingTimeOffContent = {};

interface TimeOff { id: string; user_email: string; user_name?: string | null; start_date: string; end_date: string; hours_requested: number; reason?: string | null; }

function PendingTimeOffWidget({ size }: WidgetProps<PendingTimeOffContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<TimeOff[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/time-off?status=pending');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { requests?: TimeOff[] } = await res.json();
      setItems(data.requests ?? []);
      setStatus((data.requests ?? []).length === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') return <WidgetEmpty icon="🏖" title="No pending requests" description="Time-off requests appear here." />;

  const cap = bucket === 'tiny' ? 2 : bucket === 'small' ? 4 : bucket === 'medium' ? 6 : bucket === 'large' ? 12 : 24;
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {items.slice(0, cap).map((t) => (
        <li key={t.id} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
          <span style={{ display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{t.user_name ?? t.user_email}</span>
          <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{new Date(t.start_date).toLocaleDateString()} → {new Date(t.end_date).toLocaleDateString()} · {t.hours_requested}h</span>
        </li>
      ))}
    </ul>
  );
}

defineWidget<PendingTimeOffContent>({
  id: 'pending-time-off',
  label: 'Pending Time-Off',
  description: 'PTO requests awaiting approval.',
  category: 'office',
  iconName: 'CalendarMinus',
  defaultSize: { w: 6, h: 2 },
  minSize: { w: 3, h: 1 },
  maxSize: { w: 12, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'tech_support'],
  Widget: PendingTimeOffWidget,
});

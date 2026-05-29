'use client';
// Slice 137 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 214 of hub-grid-8x8-square-cells-2026-05-29.md — tiny mode +
// row truncation + minSize lowered to 1×1.

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
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>requests</span>
        </div>
      );
    }
    return <WidgetEmpty icon="🏖" title="No pending requests" description="Time-off requests appear here." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>{items.length}</span>
        <span style={tinyStatLabelStyle()}>{items.length === 1 ? 'request' : 'requests'}</span>
      </div>
    );
  }

  const cap = bucket === 'small' ? 4 : bucket === 'medium' ? 6 : bucket === 'large' ? 12 : 24;
  return (
    <ul role="list" style={listStyle}>
      {items.slice(0, cap).map((t) => (
        <li key={t.id} style={rowStyle}>
          <span style={nameStyle}>{t.user_name ?? t.user_email}</span>
          <span style={mutedStyle}>{new Date(t.start_date).toLocaleDateString()} → {new Date(t.end_date).toLocaleDateString()} · {t.hours_requested}h</span>
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
  defaultSize: { w: 4, h: 2 },
  // Slice 214 — minSize lowered to 1×1 with the tiny request-count mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'tech_support'],
  Widget: PendingTimeOffWidget,
});

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)', minWidth: 0 };
const rowStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)', minWidth: 0 };
const nameStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const mutedStyle: React.CSSProperties = { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' };

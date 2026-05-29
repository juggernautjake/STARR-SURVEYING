'use client';
// Slice 138 of customizable-hub-and-work-mode-2026-05-28.md.
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

export interface PendingHoursContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: PendingHoursContent = {};

interface Timesheet { id: string; user_email: string; user_name?: string | null; week_start: string; total_hours: number; }

function PendingHoursWidget({ size }: WidgetProps<PendingHoursContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<Timesheet[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/time-logs/approve?status=pending');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { timesheets?: Timesheet[] } = await res.json();
      setItems(data.timesheets ?? []);
      setStatus((data.timesheets ?? []).length === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-success)')}>0</span>
          <span style={tinyStatLabelStyle()}>to approve</span>
        </div>
      );
    }
    return <WidgetEmpty icon="⏱" title="Hours approved" description="Timesheets awaiting approval appear here." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>{items.length}</span>
        <span style={tinyStatLabelStyle()}>to approve</span>
      </div>
    );
  }

  const cap = bucket === 'small' ? 4 : bucket === 'medium' ? 6 : bucket === 'large' ? 12 : 24;
  return (
    <ul role="list" style={listStyle}>
      {items.slice(0, cap).map((t) => (
        <li key={t.id} style={rowStyle}>
          <span style={nameStyle}>{t.user_name ?? t.user_email}</span>
          <span style={mutedStyle}>{t.total_hours}h · week of {new Date(t.week_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </li>
      ))}
    </ul>
  );
}

defineWidget<PendingHoursContent>({
  id: 'pending-hours',
  label: 'Pending Hours',
  description: 'Timesheets awaiting approval.',
  category: 'office',
  iconName: 'TimerReset',
  defaultSize: { w: 4, h: 2 },
  // Slice 214 — minSize lowered to 1×1 with the tiny to-approve count.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'tech_support'],
  Widget: PendingHoursWidget,
});

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)', minWidth: 0 };
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)', minWidth: 0 };
const nameStyle: React.CSSProperties = { fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const mutedStyle: React.CSSProperties = { fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)', flexShrink: 0 };

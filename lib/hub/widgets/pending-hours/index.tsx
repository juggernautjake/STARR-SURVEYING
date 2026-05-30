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

// Slice 15 — wired to the Slice-12 schema fields:
//   - maxItems:     clamp the rendered list to 1–20; null → size cap
//   - groupByPerson: stub flag the body annotates per row when on
//     (real grouping data isn't on the timesheet payload yet — the
//     toggle exists so a future commit can groupBy(user_email) without
//     re-touching the schema or panel)
import { resolveBoundedInt, resolveBool } from '@/lib/hub/widgets/_shared/content-resolvers';

export interface PendingHoursContent extends Record<string, unknown> {
  maxItems?: number;
  groupByPerson?: boolean;
}
const DEFAULTS: PendingHoursContent = { maxItems: 5, groupByPerson: false };

export const resolveMaxItems = (c: PendingHoursContent): number | null =>
  resolveBoundedInt(c.maxItems, 1, 20, null);
export const resolveGroupByPerson = (c: PendingHoursContent): boolean =>
  resolveBool(c.groupByPerson, false);

interface Timesheet { id: string; user_email: string; user_name?: string | null; week_start: string; total_hours: number; }

// hub-widget-excellence-11 R1 — `/api/admin/time-logs/approve` is
// POST-only (bulk approve), so the old GET always 404'd → empty. The
// real pending data is `/api/admin/time-logs?status=pending` (returns
// individual `{ logs }` for every user when an admin calls it). We
// aggregate those daily rows into per-(submitter, week) timesheets.
interface PendingLog {
  user_email?: string | null;
  user_name?: string | null;
  log_date?: string | null;
  hours?: number | null;
}

/** Monday (UTC) of the week containing `logDate` as 'YYYY-MM-DD'. */
export function weekStartOf(logDate: string): string {
  const d = new Date(`${logDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return logDate;
  const dow = d.getUTCDay(); // 0 = Sunday
  const offset = dow === 0 ? 6 : dow - 1;
  return new Date(d.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
}

/** Roll up pending daily time logs into per-submitter, per-week
 *  timesheets (newest week first). Pure + exported. */
export function aggregatePendingTimesheets(logs: readonly PendingLog[]): Timesheet[] {
  const map = new Map<string, Timesheet>();
  for (const log of logs) {
    const email = log.user_email?.trim();
    if (!email || !log.log_date) continue;
    const ws = weekStartOf(log.log_date);
    const key = `${email}:${ws}`;
    const entry = map.get(key) ?? {
      id: key, user_email: email, user_name: log.user_name ?? null, week_start: ws, total_hours: 0,
    };
    entry.total_hours += typeof log.hours === 'number' && Number.isFinite(log.hours) ? log.hours : 0;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.week_start.localeCompare(a.week_start));
}

function PendingHoursWidget({ size, content }: WidgetProps<PendingHoursContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const explicitCap = resolveMaxItems(content);
  const groupByPerson = resolveGroupByPerson(content);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<Timesheet[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/time-logs?status=pending');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { logs?: PendingLog[] } = await res.json();
      const timesheets = aggregatePendingTimesheets(data.logs ?? []);
      setItems(timesheets);
      setStatus(timesheets.length === 0 ? 'empty' : 'ok');
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

  const sizeCap = bucket === 'small' ? 4 : bucket === 'medium' ? 6 : bucket === 'large' ? 12 : 24;
  const cap = explicitCap ?? sizeCap;
  const rendered = groupByPerson
    // When the surveyor opts into "group by submitter", surface the
    // person's name as a leading row tag so duplicates from the same
    // approver visibly cluster. Real groupBy will come with the
    // backend's roll-up endpoint; this is the on-canvas cue.
    ? [...items].sort((a, b) =>
        (a.user_name ?? a.user_email).localeCompare(b.user_name ?? b.user_email))
    : items;
  return (
    <ul role="list" style={listStyle}>
      {rendered.slice(0, cap).map((t) => (
        <li key={t.id} style={rowStyle}>
          <span style={nameStyle}>{t.user_name ?? t.user_email}</span>
          <span style={mutedStyle}>{t.total_hours.toFixed(1)}h · week of {new Date(`${t.week_start}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
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

'use client';
// lib/hub/widgets/crew-calendar/index.tsx
// Slice 121 of customizable-hub-and-work-mode-2026-05-28.md.
//
// hub-widget-excellence-12 R1 — the crew-calendar GET takes `?from=&to=`
// (not `?range=`) and returns `{ days: string[], users: [{ user_email,
// user_name, cells: Record<dayIso, { state }> }] }` with cell states
// open / proposed / confirmed / split_shift / time_off / unavailable /
// unconfirmed_overdue — NOT the flat `{ cells: [{ day, status }] }` with
// available/assigned/off/pto this widget originally read. Realigned to
// the real per-user-per-day grid.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export type CrewWeekRange = 'this-week' | 'next-week' | 'two-weeks';

export interface CrewCalendarContent extends Record<string, unknown> {
  employeeFilter: string;
  weekRange: CrewWeekRange;
}

const DEFAULTS: CrewCalendarContent = { employeeFilter: '', weekRange: 'this-week' };

interface CalendarUser {
  user_email: string;
  user_name?: string | null;
  cells: Record<string, { state?: string | null } | undefined>;
}

const DAY_MS = 86_400_000;

/** Monday (UTC) of the week containing `nowMs`. */
function mondayUtc(nowMs: number): number {
  const d = new Date(nowMs);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = new Date(base).getUTCDay(); // 0 = Sun
  const offset = dow === 0 ? 6 : dow - 1;
  return base - offset * DAY_MS;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The `{ from, to }` date window for a week range. Pure + exported. */
export function crewWindow(range: CrewWeekRange, nowMs: number = Date.now()): { from: string; to: string } {
  const monday = mondayUtc(nowMs);
  if (range === 'next-week') {
    return { from: isoDate(monday + 7 * DAY_MS), to: isoDate(monday + 14 * DAY_MS) };
  }
  if (range === 'two-weeks') {
    return { from: isoDate(monday), to: isoDate(monday + 14 * DAY_MS) };
  }
  return { from: isoDate(monday), to: isoDate(monday + 7 * DAY_MS) };
}

/** Color for a (real) crew-calendar cell state. Pure + exported. */
export function cellColor(state: string | null | undefined): string {
  switch (state) {
    case 'confirmed':
      return 'var(--theme-success)';
    case 'proposed':
    case 'split_shift':
      return 'var(--theme-accent)';
    case 'unconfirmed_overdue':
      return 'var(--theme-danger)';
    case 'time_off':
    case 'unavailable':
      return 'var(--theme-warning)';
    case 'open':
    default:
      return 'var(--theme-fg-muted)';
  }
}

function CrewCalendarWidget({ size, content }: WidgetProps<CrewCalendarContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [users, setUsers] = useState<CalendarUser[]>([]);
  const [days, setDays] = useState<string[]>([]);

  const fetchCalendar = useCallback(async () => {
    setStatus('loading');
    try {
      const { from, to } = crewWindow(settings.weekRange);
      const res = await fetch(`/api/admin/personnel/crew-calendar?from=${from}&to=${to}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { users?: CalendarUser[]; days?: string[] } = await res.json();
      let list = data.users ?? [];
      const filter = settings.employeeFilter.trim().toLowerCase();
      if (filter) list = list.filter((u) => u.user_email.toLowerCase().includes(filter));
      setUsers(list);
      setDays(data.days ?? []);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.employeeFilter, settings.weekRange]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') return <WidgetEmpty icon="📅" title="No crew scheduled" description="Open crew calendar to assign shifts." />;

  const visibleUsers = users.slice(0, capForBucket(bucket));
  const visibleDays = days.slice(0, bucket === 'tiny' ? 3 : 7);

  return (
    <ul role="list" style={listStyle}>
      {visibleUsers.map((u) => (
        <li key={u.user_email} style={rowStyle}>
          <span style={nameStyle}>{u.user_name ?? u.user_email}</span>
          <span style={{ display: 'inline-flex', gap: 2 }}>
            {visibleDays.map((day) => {
              const state = u.cells[day]?.state ?? 'open';
              return <span key={day} title={`${day}: ${state}`} style={statusDot(state)} />;
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CrewCalendarSettings({ value, onChange }: WidgetSettingsFormProps<CrewCalendarContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Week range</span>
        <select value={settings.weekRange} onChange={(e) => onChange({ ...settings, weekRange: e.target.value as CrewWeekRange })}>
          <option value="this-week">This week</option>
          <option value="next-week">Next week</option>
          <option value="two-weeks">Next 2 weeks</option>
        </select>
      </label>
      <label>
        <span style={labelStyle}>Filter to employee (email)</span>
        <input
          type="email"
          value={settings.employeeFilter}
          placeholder="leave blank for all"
          onChange={(e) => onChange({ ...settings, employeeFilter: e.target.value })}
        />
      </label>
    </div>
  );
}

defineWidget<CrewCalendarContent>({
  id: 'crew-calendar',
  label: 'Crew Calendar',
  description: 'Multi-employee schedule at a glance.',
  category: 'operational',
  iconName: 'CalendarDays',
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'tech_support', 'equipment_manager'],
  Widget: CrewCalendarWidget,
  SettingsForm: CrewCalendarSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 2;
    case 'small':  return 4;
    case 'medium': return 6;
    case 'large':  return 10;
    case 'xlarge': return 20;
  }
}

export function statusDot(state: string | null | undefined): React.CSSProperties {
  return { display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: cellColor(state) };
}

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' };
const nameStyle: React.CSSProperties = { fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 };

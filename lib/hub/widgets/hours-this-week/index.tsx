'use client';
// lib/hub/widgets/hours-this-week/index.tsx
//
// Hours This Week widget. Reads `/api/admin/time-logs?week_start=…`
// and renders a per-day bar chart (small+) or a big number (tiny).
//
// Slice 113 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetError from '@/lib/hub/components/WidgetError';

export type WeekStart = 'sunday' | 'monday';

export interface HoursThisWeekContent extends Record<string, unknown> {
  weekStart: WeekStart;
  showBreakdownByJob: boolean;
  goalHours: number;
}

const DEFAULTS: HoursThisWeekContent = {
  weekStart: 'monday',
  showBreakdownByJob: false,
  goalHours: 40,
};

interface TimeLog {
  id: string;
  user_email: string;
  log_date: string;
  hours: number;
  job_id?: string | null;
  job_name?: string | null;
  work_type?: string | null;
}

function HoursThisWeekWidget({ size, content }: WidgetProps<HoursThisWeekContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);

  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [logs, setLogs] = useState<TimeLog[]>([]);

  const fetchLogs = useCallback(async () => {
    setStatus('loading');
    try {
      const ws = weekStartIso(settings.weekStart, new Date());
      const res = await fetch(`/api/admin/time-logs?week_start=${ws}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { logs?: TimeLog[] } = await res.json();
      const list = data.logs ?? [];
      setLogs(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('error');
    }
  }, [settings.weekStart]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totals = useMemo(() => summarizeWeek(logs, settings.weekStart), [logs, settings.weekStart]);
  const total = totals.reduce((sum, d) => sum + d.hours, 0);

  if (status === 'loading') return <WidgetSkeleton rows={2} />;
  if (status === 'error') return <WidgetError message="Couldn't load hours." onRetry={fetchLogs} />;
  if (status === 'empty') {
    return (
      <WidgetEmpty
        icon="⏱"
        title="No hours logged"
        description="Start the clock from My Hours when you begin your day."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--hub-spc-2, 8px)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 'var(--hub-font-2xl, 1.5rem)', fontWeight: 700, color: 'var(--theme-fg-primary)' }}>
          {total.toFixed(1)}h
        </span>
        <span style={mutedStyle}>
          of {settings.goalHours}h goal
        </span>
      </div>

      {bucket !== 'tiny' && (
        <BarChart totals={totals} goalHours={settings.goalHours} />
      )}

      {settings.showBreakdownByJob && bucket !== 'tiny' && bucket !== 'small' && (
        <JobBreakdown logs={logs} />
      )}
    </div>
  );
}

function BarChart({ totals, goalHours }: { totals: { label: string; hours: number }[]; goalHours: number }) {
  const max = Math.max(goalHours / 5, ...totals.map((t) => t.hours), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flex: 1, minHeight: 40 }}>
      {totals.map((d) => {
        const pct = Math.max(2, Math.round((d.hours / max) * 100));
        return (
          <div key={d.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
            <div
              aria-label={`${d.label}: ${d.hours.toFixed(1)} hours`}
              style={{
                width: '100%',
                height: `${pct}%`,
                background: 'var(--theme-accent)',
                borderRadius: 2,
                opacity: d.hours > 0 ? 1 : 0.25,
              }}
            />
            <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function JobBreakdown({ logs }: { logs: TimeLog[] }) {
  const totals = aggregateByJob(logs);
  if (totals.length === 0) return null;
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2, borderTop: '1px solid var(--theme-border)', paddingTop: 6 }}>
      {totals.slice(0, 5).map((t) => (
        <li key={t.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--hub-font-xs, 0.75rem)' }}>
          <span style={mutedStyle}>{t.label}</span>
          <span style={{ fontWeight: 600 }}>{t.hours.toFixed(1)}h</span>
        </li>
      ))}
    </ul>
  );
}

function HoursThisWeekSettings({ value, onChange }: WidgetSettingsFormProps<HoursThisWeekContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Week starts on</span>
        <select
          value={settings.weekStart}
          onChange={(e) => onChange({ ...settings, weekStart: e.target.value as WeekStart })}
        >
          <option value="monday">Monday</option>
          <option value="sunday">Sunday</option>
        </select>
      </label>
      <label>
        <span style={labelStyle}>Weekly goal (hours)</span>
        <input
          type="number"
          min={1}
          max={168}
          value={settings.goalHours}
          onChange={(e) => onChange({ ...settings, goalHours: Math.max(1, Math.min(168, Number(e.target.value))) })}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={settings.showBreakdownByJob}
          onChange={(e) => onChange({ ...settings, showBreakdownByJob: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>Show breakdown by job</span>
      </label>
    </div>
  );
}

defineWidget<HoursThisWeekContent>({
  id: 'hours-this-week',
  label: 'Hours This Week',
  description: 'Your logged hours per day this week + a goal line.',
  category: 'time-pay',
  iconName: 'Clock',
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 1 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'],
  Widget: HoursThisWeekWidget,
  SettingsForm: HoursThisWeekSettings,
});

// ─── Helpers (exported for tests) ────────────────────────────────────

const DAY_LABELS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekStartIso(weekStart: WeekStart, now: Date): string {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const dow = day.getDay(); // 0 = Sunday
  const offset = weekStart === 'monday' ? (dow === 0 ? 6 : dow - 1) : dow;
  day.setDate(day.getDate() - offset);
  return day.toISOString().split('T')[0];
}

export function summarizeWeek(logs: TimeLog[], weekStart: WeekStart): { label: string; hours: number }[] {
  const labels = weekStart === 'monday' ? DAY_LABELS_MON : DAY_LABELS_SUN;
  const totals: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const log of logs) {
    const date = new Date(`${log.log_date}T00:00:00`);
    const dow = date.getDay();
    const idx = weekStart === 'monday' ? (dow === 0 ? 6 : dow - 1) : dow;
    totals[idx] += Number(log.hours) || 0;
  }
  return labels.map((label, i) => ({ label, hours: totals[i] }));
}

export function aggregateByJob(logs: TimeLog[]): { label: string; hours: number }[] {
  const map = new Map<string, number>();
  for (const log of logs) {
    const key = log.job_name ?? log.work_type ?? 'Other';
    map.set(key, (map.get(key) ?? 0) + (Number(log.hours) || 0));
  }
  return Array.from(map.entries())
    .map(([label, hours]) => ({ label, hours }))
    .sort((a, b) => b.hours - a.hours);
}

const mutedStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};

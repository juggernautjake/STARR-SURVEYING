'use client';
// lib/hub/widgets/assignments-due/index.tsx
//
// Assignments Due widget. Tasks/action items assigned to the user
// from `/api/admin/assignments`.
// Slice 120 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetError from '@/lib/hub/components/WidgetError';

export type AssignedToFilter = 'me' | 'all';
export type AssignmentsDueWindow = 'today' | 'week' | 'month' | 'all';

export interface AssignmentsDueContent extends Record<string, unknown> {
  assignedTo: AssignedToFilter;
  dueWithin: AssignmentsDueWindow;
}

const DEFAULTS: AssignmentsDueContent = { assignedTo: 'me', dueWithin: 'week' };

interface Task {
  id: string;
  title: string;
  due_date?: string | null;
  status?: string | null;
  assigned_to?: string | null;
  priority?: string | null;
}

function AssignmentsDueWidget({ size, content }: WidgetProps<AssignmentsDueContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [tasks, setTasks] = useState<Task[]>([]);

  const fetchTasks = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams();
      if (settings.assignedTo === 'me') params.set('mine', 'true');
      const res = await fetch(`/api/admin/assignments?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { assignments?: Task[] } = await res.json();
      const list = filterByDueWindow(data.assignments ?? [], settings.dueWithin).sort(byDueAscending);
      setTasks(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('error');
    }
  }, [settings.assignedTo, settings.dueWithin]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const visible = useMemo(() => tasks.slice(0, capForBucket(bucket)), [tasks, bucket]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'error') return <WidgetError message="Couldn't load assignments." onRetry={fetchTasks} />;
  if (status === 'empty') return <WidgetEmpty icon="✅" title="No assignments due" description="Everything in scope is on schedule." />;

  return (
    <ul role="list" style={listStyle}>
      {visible.map((t) => (
        <li key={t.id} style={rowStyle}>
          {t.priority === 'high' && (
            <span aria-label="High priority" style={{ color: 'var(--theme-danger)' }}>!</span>
          )}
          <span style={titleStyle}>{t.title}</span>
          {t.due_date && bucket !== 'tiny' && (
            <span style={dueStyle(t.due_date)}>{formatDue(t.due_date)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function AssignmentsDueSettings({ value, onChange }: WidgetSettingsFormProps<AssignmentsDueContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Assigned to</span>
        <select value={settings.assignedTo} onChange={(e) => onChange({ ...settings, assignedTo: e.target.value as AssignedToFilter })}>
          <option value="me">Me only</option>
          <option value="all">Everyone</option>
        </select>
      </label>
      <label>
        <span style={labelStyle}>Due within</span>
        <select value={settings.dueWithin} onChange={(e) => onChange({ ...settings, dueWithin: e.target.value as AssignmentsDueWindow })}>
          <option value="today">Today</option>
          <option value="week">Next 7 days</option>
          <option value="month">Next 30 days</option>
          <option value="all">All</option>
        </select>
      </label>
    </div>
  );
}

defineWidget<AssignmentsDueContent>({
  id: 'assignments-due',
  label: 'Assignments Due',
  description: 'Action items + tasks coming due.',
  category: 'work',
  iconName: 'ClipboardList',
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'],
  Widget: AssignmentsDueWidget,
  SettingsForm: AssignmentsDueSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 2;
    case 'small':  return 4;
    case 'medium': return 6;
    case 'large':  return 12;
    case 'xlarge': return 24;
  }
}

export function filterByDueWindow(list: Task[], window: AssignmentsDueWindow, nowMs: number = Date.now()): Task[] {
  if (window === 'all') return list;
  const cap = windowToMs(window);
  return list.filter((t) => {
    if (!t.due_date) return false;
    const d = Date.parse(t.due_date);
    if (!Number.isFinite(d)) return false;
    if (d < nowMs) return true;
    return d - nowMs <= cap;
  });
}

export function byDueAscending(a: Task, b: Task): number {
  return Date.parse(a.due_date ?? '9999-12-31') - Date.parse(b.due_date ?? '9999-12-31');
}

function windowToMs(w: Exclude<AssignmentsDueWindow, 'all'>): number {
  switch (w) {
    case 'today': return 24 * 3600 * 1000;
    case 'week':  return 7 * 24 * 3600 * 1000;
    case 'month': return 30 * 24 * 3600 * 1000;
  }
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dueStyle(iso: string): React.CSSProperties {
  const ms = Date.parse(iso);
  const past = ms < Date.now();
  return {
    fontSize: 'var(--hub-font-xs, 0.75rem)',
    color: past ? 'var(--theme-danger)' : 'var(--theme-fg-secondary)',
    fontWeight: past ? 600 : 400,
  };
}

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' };
const titleStyle: React.CSSProperties = { flex: 1, fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 };

'use client';
// lib/hub/widgets/assignments-due/index.tsx
//
// Assignments Due widget. Tasks/action items assigned to the user
// from `/api/admin/assignments`.
// Slice 120 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import { jobHref, lessonHref } from '@/lib/hub/widgets/_shared/widget-links';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetError from '@/lib/hub/components/WidgetError';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

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
  job_id?: string | null;
  module_id?: string | null;
  lesson_id?: string | null;
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
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-success)')}>0</span>
          <span style={tinyStatLabelStyle()}>due</span>
        </div>
      );
    }
    return <WidgetEmpty icon="✅" title="No assignments due" description="Everything in scope is on schedule." />;
  }

  if (bucket === 'tiny') {
    const overdue = tasks.filter((t) => isOverdue(t.due_date)).length;
    const color = overdue > 0 ? 'var(--theme-danger)' : 'var(--theme-fg-primary)';
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, color)}>{tasks.length}</span>
        <span style={tinyStatLabelStyle()}>{overdue > 0 ? `${overdue} overdue` : 'due'}</span>
      </div>
    );
  }

  // Per-bucket field priority: small = title + due + priority dot;
  // medium adds the status chip; large+ adds the assignee.
  const showStatus = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';
  const showAssignee = bucket === 'large' || bucket === 'xlarge';

  return (
    <ul role="list" style={listStyle}>
      {visible.map((t) => (
        <li key={t.id}>
          <Link href={assignmentHref(t)} style={rowStyle} aria-label={`Open assignment: ${t.title}`}>
            <PriorityDot priority={t.priority} />
            <span style={titleStyle}>{t.title}</span>
            {showStatus && t.status && <StatusChip status={t.status} />}
            {showAssignee && t.assigned_to && (
              <span style={mutedStyle}>{shortEmail(t.assigned_to)}</span>
            )}
            {t.due_date && (
              <span style={dueStyle(t.due_date)}>{formatDue(t.due_date)}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Canonical drill-in for an assignment: its owning job, then its
 *  lesson, else the assignments list. */
export function assignmentHref(t: Pick<Task, 'job_id' | 'module_id' | 'lesson_id'>): string {
  if (t.job_id) return jobHref(t.job_id);
  if (t.module_id && t.lesson_id) return lessonHref(t.module_id, t.lesson_id);
  return '/admin/assignments';
}

function PriorityDot({ priority }: { priority?: string | null }) {
  if (priority !== 'high' && priority !== 'urgent') return null;
  const color = priority === 'urgent' ? 'var(--theme-danger)' : 'var(--theme-warning)';
  return (
    <span
      aria-label={`${priority} priority`}
      title={`${priority} priority`}
      style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }}
    />
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span style={statusChipStyle}>{status.replace('_', ' ')}</span>
  );
}

function shortEmail(email: string): string {
  return email.split('@')[0];
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
  // Slice 214 — minSize lowered to 1×1 with the tiny due-count mode.
  minSize: { w: 1, h: 1 },
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

/** Relative due label: "overdue Nd", "today", "in Nd", or a short date
 *  past two weeks out. Exported for testing. */
export function formatDue(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const days = Math.round((startOfUtcDay(t) - startOfUtcDay(nowMs)) / 86_400_000);
  if (days < 0) return `overdue ${Math.abs(days)}d`;
  if (days === 0) return 'today';
  if (days <= 14) return `in ${days}d`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function isOverdue(iso: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms < nowMs;
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
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)', textDecoration: 'none', color: 'inherit' };
const titleStyle: React.CSSProperties = { flex: 1, fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const mutedStyle: React.CSSProperties = { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', whiteSpace: 'nowrap' };
const statusChipStyle: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 600, textTransform: 'capitalize',
  padding: '1px 7px', borderRadius: 999,
  background: 'var(--theme-bg-surface)', color: 'var(--theme-fg-secondary)',
  border: '1px solid var(--theme-border)', whiteSpace: 'nowrap',
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 };

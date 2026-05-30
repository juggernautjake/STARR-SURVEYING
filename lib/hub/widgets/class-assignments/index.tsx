'use client';
// lib/hub/widgets/class-assignments/index.tsx
//
// Class Assignments widget. Reads `/api/admin/learn/assignments` and
// surfaces a student's outstanding assignments with theme-tinted
// due-date chips.
//
// Slice 110 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import { lessonHref } from '@/lib/hub/widgets/_shared/widget-links';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetError from '@/lib/hub/components/WidgetError';

export type DueWithin = 'today' | 'week' | 'month' | 'all';
export type AssignmentColumn = 'title' | 'class' | 'due' | 'status';
export type AssignmentSortBy = 'due' | 'created' | 'title' | 'class';

export const ALL_ASSIGNMENT_COLUMNS: ReadonlyArray<AssignmentColumn> = ['title', 'class', 'due', 'status'];

export interface ClassAssignmentsContent extends Record<string, unknown> {
  dueWithin: DueWithin;
  includeCompleted: boolean;
  groupByClass: boolean;
  columns: AssignmentColumn[];
  sortBy: AssignmentSortBy;
  rowLimit: number;
}

const DEFAULTS: ClassAssignmentsContent = {
  dueWithin: 'week',
  includeCompleted: false,
  groupByClass: false,
  columns: ['title', 'due', 'status'],
  sortBy: 'due',
  rowLimit: 8,
};

interface Assignment {
  id: string;
  module_id?: string | null;
  lesson_id?: string | null;
  module_title?: string | null;
  lesson_title?: string | null;
  due_date?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export type DueStatus = 'overdue' | 'today' | 'week' | 'future' | 'no-due';

function ClassAssignmentsWidget({ size, content }: WidgetProps<ClassAssignmentsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);

  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const fetchAssignments = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams();
      if (!settings.includeCompleted) params.set('status', 'assigned');
      const res = await fetch(`/api/admin/learn/assignments?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { assignments?: Assignment[] } = await res.json();
      const filtered = filterByDueWithin(data.assignments ?? [], settings.dueWithin);
      const sorted = sortAssignments(filtered, settings.sortBy);
      setAssignments(sorted);
      setStatus(sorted.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('error');
    }
  }, [settings.dueWithin, settings.includeCompleted, settings.sortBy]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const visible = useMemo(
    () => assignments.slice(0, capForBucket(bucket)),
    [assignments, bucket],
  );
  const visibleCols = useMemo(
    () => visibleColumnsForBucket(settings.columns, bucket),
    [settings.columns, bucket],
  );

  if (status === 'loading') {
    return <WidgetSkeleton rows={Math.min(4, settings.rowLimit)} />;
  }
  if (status === 'error') {
    return <WidgetError message="Couldn't load assignments." onRetry={fetchAssignments} />;
  }
  if (status === 'empty') {
    return (
      <WidgetEmpty
        icon="🎓"
        title="All caught up"
        description="No assignments due in the chosen window."
      />
    );
  }

  if (settings.groupByClass) {
    const grouped = groupByClass(visible);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
        {Array.from(grouped.entries()).map(([cls, items]) => (
          <section key={cls}>
            <h3 style={sectionTitleStyle}>{cls}</h3>
            <ul role="list" style={listStyle}>
              {items.map((a) => <AssignmentRow key={a.id} assignment={a} visibleCols={visibleCols} />)}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <ul role="list" style={listStyle}>
      {visible.map((a) => <AssignmentRow key={a.id} assignment={a} visibleCols={visibleCols} />)}
    </ul>
  );
}

/** Open the assignment's lesson (canonical
 *  `/admin/learn/modules/{module}/{lesson}`); fall back to the module,
 *  then the learning hub. Pure + exported. */
export function assignmentHref(a: Pick<Assignment, 'module_id' | 'lesson_id'>): string {
  if (a.module_id && a.lesson_id) return lessonHref(a.module_id, a.lesson_id);
  if (a.module_id) return `/admin/learn/modules/${a.module_id}`;
  return '/admin/learn';
}

function AssignmentRow({ assignment, visibleCols }: { assignment: Assignment; visibleCols: AssignmentColumn[] }) {
  const due = assignment.due_date ? dueStatusFor(assignment.due_date) : 'no-due';
  return (
    <li>
      {/* Row deep link → the canonical lesson route. */}
      <Link href={assignmentHref(assignment)} style={rowStyle} aria-label={`Open ${assignment.lesson_title ?? assignment.module_title ?? 'assignment'}`}>
        {visibleCols.includes('title') && (
          <span style={titleStyle}>
            {assignment.lesson_title ?? assignment.module_title ?? 'Assignment'}
          </span>
        )}
        {visibleCols.includes('class') && assignment.module_title && (
          <span style={mutedStyle}>{assignment.module_title}</span>
        )}
        {visibleCols.includes('due') && (
          <DueChip status={due} dueDate={assignment.due_date ?? null} />
        )}
        {visibleCols.includes('status') && assignment.status && (
          <span style={mutedStyle}>{statusLabel(assignment.status)}</span>
        )}
      </Link>
    </li>
  );
}

function DueChip({ status, dueDate }: { status: DueStatus; dueDate: string | null }) {
  const { color, bg, label } = chipMetaFor(status, dueDate);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 'var(--hub-font-xs, 0.75rem)',
        fontWeight: 600,
        color,
        background: bg,
      }}
    >
      {label}
    </span>
  );
}

function ClassAssignmentsSettings({ value, onChange }: WidgetSettingsFormProps<ClassAssignmentsContent>) {
  const settings = { ...DEFAULTS, ...value };
  function toggleCol(col: AssignmentColumn) {
    const next = settings.columns.includes(col)
      ? settings.columns.filter((c) => c !== col)
      : [...settings.columns, col];
    onChange({ ...settings, columns: next });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Due within</span>
        <select
          value={settings.dueWithin}
          onChange={(e) => onChange({ ...settings, dueWithin: e.target.value as DueWithin })}
        >
          <option value="today">Today</option>
          <option value="week">Next 7 days</option>
          <option value="month">Next 30 days</option>
          <option value="all">All assignments</option>
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={settings.includeCompleted}
          onChange={(e) => onChange({ ...settings, includeCompleted: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>Include completed</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={settings.groupByClass}
          onChange={(e) => onChange({ ...settings, groupByClass: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>Group by class</span>
      </label>
      <label>
        <span style={labelStyle}>Sort by</span>
        <select
          value={settings.sortBy}
          onChange={(e) => onChange({ ...settings, sortBy: e.target.value as AssignmentSortBy })}
        >
          <option value="due">Due date</option>
          <option value="created">Most recent</option>
          <option value="title">Title</option>
          <option value="class">Class</option>
        </select>
      </label>
      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={labelStyle}>Columns</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ALL_ASSIGNMENT_COLUMNS.map((c) => (
            <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={settings.columns.includes(c)}
                onChange={() => toggleCol(c)}
              />
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>{labelForColumn(c)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        <span style={labelStyle}>Max rows</span>
        <input
          type="number"
          min={1}
          max={50}
          value={settings.rowLimit}
          onChange={(e) => onChange({ ...settings, rowLimit: Math.max(1, Math.min(50, Number(e.target.value))) })}
        />
      </label>
    </div>
  );
}

defineWidget<ClassAssignmentsContent>({
  id: 'class-assignments',
  label: 'Class Assignments',
  description: 'Your outstanding lessons + assignments with due-date status.',
  category: 'learning',
  iconName: 'GraduationCap',
  defaultSize: { w: 4, h: 3 },
  // Slice 217 — minSize lowered to 1×1; widget already had a tiny bucket render.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  // Students + teachers see the widget. Hidden for internal-only roles
  // (admins still see it because the role-picker treats admin as a
  // superset).
  allowedRoles: ['student', 'teacher', 'admin', 'developer'],
  Widget: ClassAssignmentsWidget,
  SettingsForm: ClassAssignmentsSettings,
});

// ─── Helpers (exported for tests) ────────────────────────────────────

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 2;
    case 'small':  return 4;
    case 'medium': return 6;
    case 'large':  return 12;
    case 'xlarge': return 24;
  }
}

export function visibleColumnsForBucket(cols: AssignmentColumn[], bucket: SizeBucket): AssignmentColumn[] {
  if (bucket === 'tiny') {
    return cols.filter((c) => c === 'title' || c === 'due').slice(0, 2);
  }
  if (bucket === 'small') {
    return cols.filter((c) => c !== 'class');
  }
  return cols;
}

export function sortAssignments(list: Assignment[], sortBy: AssignmentSortBy): Assignment[] {
  const copy = [...list];
  switch (sortBy) {
    case 'due':
      return copy.sort((a, b) => Date.parse(a.due_date ?? '9999-12-31') - Date.parse(b.due_date ?? '9999-12-31'));
    case 'created':
      return copy.sort((a, b) => Date.parse(b.created_at ?? '0') - Date.parse(a.created_at ?? '0'));
    case 'title':
      return copy.sort((a, b) => (a.lesson_title ?? a.module_title ?? '').localeCompare(b.lesson_title ?? b.module_title ?? ''));
    case 'class':
      return copy.sort((a, b) => (a.module_title ?? '').localeCompare(b.module_title ?? ''));
  }
}

/** Filter to assignments with a due_date inside the chosen window.
 *  Assignments without a due date pass through `all`. */
export function filterByDueWithin(list: Assignment[], window: DueWithin, nowMs: number = Date.now()): Assignment[] {
  if (window === 'all') return list;
  const windowMs = windowToMs(window);
  return list.filter((a) => {
    if (!a.due_date) return false;
    const dueMs = Date.parse(a.due_date);
    if (!Number.isFinite(dueMs)) return false;
    // Always include overdue items.
    if (dueMs < nowMs) return true;
    return dueMs - nowMs <= windowMs;
  });
}

export function dueStatusFor(dueDate: string, nowMs: number = Date.now()): DueStatus {
  const dueMs = Date.parse(dueDate);
  if (!Number.isFinite(dueMs)) return 'no-due';
  const deltaDays = (dueMs - nowMs) / (24 * 3600 * 1000);
  if (deltaDays < 0) return 'overdue';
  if (deltaDays < 1) return 'today';
  if (deltaDays <= 7) return 'week';
  return 'future';
}

export function chipMetaFor(status: DueStatus, dueDate: string | null): { color: string; bg: string; label: string } {
  switch (status) {
    case 'overdue':
      return {
        color: 'var(--theme-danger)',
        bg: 'color-mix(in srgb, var(--theme-danger) 14%, var(--theme-bg-surface))',
        label: 'Overdue',
      };
    case 'today':
      return {
        color: 'var(--theme-warning)',
        bg: 'color-mix(in srgb, var(--theme-warning) 14%, var(--theme-bg-surface))',
        label: 'Due today',
      };
    case 'week':
      return {
        color: 'var(--theme-info)',
        bg: 'color-mix(in srgb, var(--theme-info) 14%, var(--theme-bg-surface))',
        label: dueDate ? `Due ${formatShortDate(dueDate)}` : 'Due this week',
      };
    case 'future':
      return {
        color: 'var(--theme-fg-secondary)',
        bg: 'var(--theme-bg-elevated)',
        label: dueDate ? `Due ${formatShortDate(dueDate)}` : 'Upcoming',
      };
    case 'no-due':
      return {
        color: 'var(--theme-fg-muted)',
        bg: 'var(--theme-bg-elevated)',
        label: 'No due date',
      };
  }
}

export function labelForColumn(col: AssignmentColumn): string {
  switch (col) {
    case 'title':  return 'Title';
    case 'class':  return 'Class';
    case 'due':    return 'Due date';
    case 'status': return 'Status';
  }
}

function groupByClass(list: Assignment[]): Map<string, Assignment[]> {
  const out = new Map<string, Assignment[]>();
  for (const a of list) {
    const key = a.module_title ?? 'Unassigned';
    const bucket = out.get(key) ?? [];
    bucket.push(a);
    out.set(key, bucket);
  }
  return out;
}

function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

function formatShortDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function windowToMs(w: Exclude<DueWithin, 'all'>): number {
  switch (w) {
    case 'today': return 24 * 3600 * 1000;
    case 'week':  return 7 * 24 * 3600 * 1000;
    case 'month': return 30 * 24 * 3600 * 1000;
  }
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hub-spc-2, 8px)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  padding: 'var(--hub-spc-2, 8px) var(--hub-spc-3, 12px)',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
  textDecoration: 'none',
  color: 'inherit',
};

const titleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
  color: 'var(--theme-fg-primary)',
};

const mutedStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 6,
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
  color: 'var(--theme-fg-secondary)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};

'use client';
// lib/hub/widgets/my-jobs/index.tsx
//
// My Jobs widget. Reads `/api/admin/jobs?my_jobs=true&limit=…` and
// surfaces the user's active jobs in a list or grid. Stage chips are
// theme-tinted via `--theme-success / warning / accent / info /
// danger`.
//
// Slice 108 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import { useHubData } from '@/lib/hub/use-hub-data';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetError from '@/lib/hub/components/WidgetError';

export type JobsFilter = 'all' | 'mine' | 'active' | 'by-stage';
export type JobColumn = 'jobNumber' | 'name' | 'stage' | 'client' | 'updated';
export type JobsSortBy = 'updated' | 'created' | 'stage' | 'name';

export const ALL_JOB_COLUMNS: ReadonlyArray<JobColumn> = [
  'jobNumber', 'name', 'stage', 'client', 'updated',
];

export interface MyJobsContent extends Record<string, unknown> {
  filter: JobsFilter;
  /** Required when filter='by-stage'. */
  stage: string;
  columns: JobColumn[];
  sortBy: JobsSortBy;
  rowLimit: number;
  showStageColors: boolean;
}

const DEFAULTS: MyJobsContent = {
  filter: 'mine',
  stage: 'fieldwork',
  columns: ['jobNumber', 'name', 'stage', 'updated'],
  sortBy: 'updated',
  rowLimit: 10,
  showStageColors: true,
};

interface JobRow {
  id: string;
  job_number: string;
  name: string;
  stage: string;
  client_name?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

const STAGE_TINTS: Record<string, 'success' | 'warning' | 'info' | 'accent' | 'danger'> = {
  quote:     'warning',
  research:  'info',
  fieldwork: 'success',
  drawing:   'accent',
  legal:     'info',
  delivery:  'success',
  completed: 'info',
  cancelled: 'danger',
  on_hold:   'warning',
};

const STAGE_LABELS: Record<string, string> = {
  quote: 'Quote',
  research: 'Research',
  fieldwork: 'Field Work',
  drawing: 'Drawing',
  legal: 'Legal',
  delivery: 'Delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
  on_hold: 'On Hold',
};

function MyJobsWidget({ size, content }: WidgetProps<MyJobsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);

  // Slice 198 — read the aggregator-fed cache. When the surveyor's
  // settings match the aggregator's default request
  // (`my_jobs=true&limit=10`) we render directly from the cached
  // payload + skip the per-widget fetch entirely. Custom settings
  // (different filter / sort / rowLimit) still fetch on their own.
  const hubData = useHubData('my-jobs');
  const canUseAggregator = matchesAggregatorDefaults(settings);

  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [jobs, setJobs] = useState<JobRow[]>([]);

  const fetchJobs = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams();
      if (settings.filter === 'mine') params.set('my_jobs', 'true');
      if (settings.filter === 'by-stage') params.set('stage', settings.stage);
      params.set('limit', String(Math.max(1, Math.min(50, settings.rowLimit))));
      const res = await fetch(`/api/admin/jobs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { jobs?: JobRow[] } = await res.json();
      const list = data.jobs ?? [];
      const sorted = sortJobs(list, settings.sortBy);
      setJobs(sorted);
      setStatus(sorted.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('error');
    }
  }, [settings.filter, settings.stage, settings.rowLimit, settings.sortBy]);

  useEffect(() => {
    // When the aggregator covered us AND it succeeded, render from
    // its payload. When it failed or skipped us, fall through to
    // the per-widget fetch.
    if (canUseAggregator && hubData.status === 'ok') {
      const data = hubData.data as { jobs?: JobRow[] } | null;
      const list = data?.jobs ?? [];
      const sorted = sortJobs(list, settings.sortBy);
      setJobs(sorted);
      setStatus(sorted.length === 0 ? 'empty' : 'ok');
      return;
    }
    if (canUseAggregator && hubData.status === 'loading') {
      // Wait for the aggregator before doing our own fetch.
      return;
    }
    fetchJobs();
  }, [canUseAggregator, hubData.status, hubData.data, settings.sortBy, fetchJobs]);

  if (status === 'loading') {
    return <WidgetSkeleton rows={Math.min(4, settings.rowLimit)} />;
  }
  if (status === 'error') {
    return <WidgetError message="Couldn't load jobs." onRetry={fetchJobs} />;
  }
  if (status === 'empty') {
    return (
      <WidgetEmpty
        icon="📋"
        title="No jobs yet"
        description="Try widening the filter or pinning yourself to a job."
      />
    );
  }

  const cap = capForBucket(bucket);
  const visible = jobs.slice(0, cap);
  const visibleCols = visibleColumnsForBucket(settings.columns, bucket);

  return (
    <ul role="list" style={listStyle}>
      {visible.map((job) => (
        <li key={job.id} style={rowStyle}>
          {visibleCols.includes('jobNumber') && (
            <span style={mutedStyle}>{job.job_number}</span>
          )}
          {visibleCols.includes('name') && (
            <span style={nameStyle}>{job.name}</span>
          )}
          {visibleCols.includes('stage') && (
            <StageChip stage={job.stage} showColor={settings.showStageColors} />
          )}
          {visibleCols.includes('client') && job.client_name && (
            <span style={mutedStyle}>{job.client_name}</span>
          )}
          {visibleCols.includes('updated') && job.updated_at && (
            <span style={mutedStyle}>{formatRelative(job.updated_at)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function StageChip({ stage, showColor }: { stage: string; showColor: boolean }) {
  const tint = STAGE_TINTS[stage] ?? 'info';
  const label = STAGE_LABELS[stage] ?? stage;
  const color = showColor ? `var(--theme-${tint})` : 'var(--theme-fg-secondary)';
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
        background: showColor
          ? `color-mix(in srgb, var(--theme-${tint}) 12%, var(--theme-bg-surface))`
          : 'var(--theme-bg-elevated)',
      }}
    >
      {label}
    </span>
  );
}

function MyJobsSettings({ value, onChange }: WidgetSettingsFormProps<MyJobsContent>) {
  const settings = { ...DEFAULTS, ...value };
  function toggleCol(col: JobColumn) {
    const next = settings.columns.includes(col)
      ? settings.columns.filter((c) => c !== col)
      : [...settings.columns, col];
    onChange({ ...settings, columns: next });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Filter</span>
        <select
          value={settings.filter}
          onChange={(e) => onChange({ ...settings, filter: e.target.value as JobsFilter })}
        >
          <option value="mine">My jobs</option>
          <option value="active">Active (not completed/cancelled)</option>
          <option value="by-stage">By stage</option>
          <option value="all">All jobs</option>
        </select>
      </label>
      {settings.filter === 'by-stage' && (
        <label>
          <span style={labelStyle}>Stage</span>
          <select
            value={settings.stage}
            onChange={(e) => onChange({ ...settings, stage: e.target.value })}
          >
            {Object.keys(STAGE_LABELS).map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span style={labelStyle}>Sort by</span>
        <select
          value={settings.sortBy}
          onChange={(e) => onChange({ ...settings, sortBy: e.target.value as JobsSortBy })}
        >
          <option value="updated">Most recently updated</option>
          <option value="created">Most recently created</option>
          <option value="stage">Stage</option>
          <option value="name">Name</option>
        </select>
      </label>
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
      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={labelStyle}>Columns</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ALL_JOB_COLUMNS.map((c) => (
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
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={settings.showStageColors}
          onChange={(e) => onChange({ ...settings, showStageColors: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>Show stage chip colors</span>
      </label>
    </div>
  );
}

defineWidget<MyJobsContent>({
  id: 'my-jobs',
  label: 'My Jobs',
  description: 'Your active jobs at a glance — stage, last update, drill-in.',
  category: 'work',
  iconName: 'FolderOpen',
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: MyJobsWidget,
  SettingsForm: MyJobsSettings,
});

// ─── Helpers (exported for tests) ────────────────────────────────────

/** Returns true when the widget's settings produce the same request
 *  the hub-data aggregator already made (`/admin/jobs?my_jobs=true&
 *  limit=10`). When this matches, the widget can render directly
 *  from the cached payload + skip its own fetch. */
export function matchesAggregatorDefaults(settings: MyJobsContent): boolean {
  return settings.filter === 'mine' && settings.rowLimit === 10;
}

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 2;
    case 'small':  return 4;
    case 'medium': return 6;
    case 'large':  return 10;
    case 'xlarge': return 25;
  }
}

/** Tiny/small surfaces drop the lower-priority columns to stay
 *  readable. Order of importance: name → stage → jobNumber →
 *  updated → client. */
export function visibleColumnsForBucket(cols: JobColumn[], bucket: SizeBucket): JobColumn[] {
  if (bucket === 'tiny') {
    // Just the name + stage chip if both are picked.
    return cols.filter((c) => c === 'name' || c === 'stage').slice(0, 2);
  }
  if (bucket === 'small') {
    return cols.filter((c) => c !== 'client');
  }
  return cols;
}

export function sortJobs(jobs: JobRow[], sortBy: JobsSortBy): JobRow[] {
  const copy = [...jobs];
  switch (sortBy) {
    case 'updated':
      return copy.sort((a, b) => Date.parse(b.updated_at ?? '0') - Date.parse(a.updated_at ?? '0'));
    case 'created':
      return copy.sort((a, b) => Date.parse(b.created_at ?? '0') - Date.parse(a.created_at ?? '0'));
    case 'stage':
      return copy.sort((a, b) => (a.stage ?? '').localeCompare(b.stage ?? ''));
    case 'name':
      return copy.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }
}

export function labelForColumn(col: JobColumn): string {
  switch (col) {
    case 'jobNumber': return 'Job number';
    case 'name':      return 'Name';
    case 'stage':     return 'Stage';
    case 'client':    return 'Client';
    case 'updated':   return 'Last updated';
  }
}

function formatRelative(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
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
};

const nameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
  color: 'var(--theme-fg-primary)',
};

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

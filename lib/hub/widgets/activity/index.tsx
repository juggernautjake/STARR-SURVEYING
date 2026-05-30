'use client';
// lib/hub/widgets/activity/index.tsx
//
// consolidation Slice 5 (2026-05-30) — the unified Activity widget.
// Folds the two legacy widgets (`job-activity-feed`, `recent-
// activity`) into one tile with a mode toggle. The two views serve
// different data slices (cross-job events from /api/admin/jobs/
// activity vs. the surveyor's recent admin pages from the nav-store),
// but they answer the same question — "what's been happening" — so
// one widget with a tab row gives the surveyor a single pane that
// flips between the two contexts without a hub re-arrange.
//
// The two legacy widgets stay registered so saved hub layouts don't
// lose their tiles; a follow-up slice migrates saved layouts +
// deletes the legacy ids.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import { jobHref } from '@/lib/hub/widgets/_shared/widget-links';
import { useAdminNavStore } from '@/lib/admin/nav-store';
import { ADMIN_ROUTES } from '@/lib/admin/route-registry';
import { resolveRouteHrefs } from '@/lib/hub/widgets/_shared/route-resolve';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';

export type ActivityMode = 'job-events' | 'recent-pages';

export interface ActivityContent extends Record<string, unknown> {
  defaultMode: ActivityMode;
  rowLimit: number;
}
const DEFAULTS: ActivityContent = { defaultMode: 'job-events', rowLimit: 10 };

interface JobEvent {
  id: string;
  type: string;
  label: string;
  actor?: string | null;
  at: string;
  job_id?: string | null;
  job_name?: string | null;
}

function ActivityWidget({ size, content }: WidgetProps<ActivityContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [mode, setMode] = useState<ActivityMode>(settings.defaultMode);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');

  const recentRoutes = useAdminNavStore((s) => s.recentRoutes);
  const resolvedRoutes = useMemo(
    () => resolveRouteHrefs(recentRoutes, ADMIN_ROUTES),
    [recentRoutes],
  );

  const fetchEvents = useCallback(async () => {
    if (mode !== 'job-events') return;
    setStatus('loading');
    try {
      const limit = clampInt(settings.rowLimit, 1, 100, 10);
      const res = await fetch(`/api/admin/jobs/activity?limit=${limit}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { activity?: JobEvent[] } = await res.json();
      setEvents(data.activity ?? []);
      setStatus((data.activity ?? []).length === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, [mode, settings.rowLimit]);
  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  // For the recent-pages mode, no fetch — the nav-store hook
  // already returns the rows in render time.
  const pageRowCount = resolvedRoutes.length;
  const cap = capForBucket(bucket);

  if (bucket === 'tiny') {
    const count = mode === 'job-events' ? events.length : pageRowCount;
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, count > 0 ? 'var(--theme-fg-primary)' : 'var(--theme-fg-secondary)')}>
          {count}
        </span>
        <span style={tinyStatLabelStyle()}>{mode === 'job-events' ? 'events' : 'recent'}</span>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div role="tablist" aria-label="Activity mode" style={tabRowStyle}>
        {(['job-events', 'recent-pages'] as ActivityMode[]).map((m) => {
          const isActive = m === mode;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setMode(m)}
              style={isActive ? activeTabStyle : tabStyle}
              data-mode={m}
            >
              {m === 'job-events' ? 'Job events' : 'Recent pages'}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" style={panelStyle}>
        {mode === 'job-events'
          ? renderJobEvents(events.slice(0, Math.min(settings.rowLimit, cap)), status)
          : renderRecentPages(resolvedRoutes.slice(0, Math.min(settings.rowLimit, cap)))}
      </div>
    </div>
  );
}

function renderJobEvents(rows: JobEvent[], status: 'loading' | 'ok' | 'empty'): React.ReactElement {
  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (rows.length === 0) return <WidgetEmpty icon="🕘" title="No recent job events" description="Stage changes, files, comments will appear here." />;
  return (
    <ul style={listStyle} role="list">
      {rows.map((e) => (
        <li key={e.id}>
          {e.job_id ? (
            <Link href={jobHref(e.job_id)} style={rowLinkStyle} aria-label={e.label}>
              <span style={titleStyle}>{e.label}</span>
              {(e.job_name || e.actor) && (
                <span style={subtitleStyle}>
                  {e.job_name ?? ''}
                  {e.job_name && e.actor ? ' · ' : ''}
                  {e.actor ?? ''}
                </span>
              )}
            </Link>
          ) : (
            <span style={rowLinkStyle}>
              <span style={titleStyle}>{e.label}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function renderRecentPages(
  rows: ReadonlyArray<{ href: string; label: string }>,
): React.ReactElement {
  if (rows.length === 0) return <WidgetEmpty icon="🕘" title="No recent pages" description="Pages you visit will appear here." />;
  return (
    <ul style={listStyle} role="list">
      {rows.map((r) => (
        <li key={r.href}>
          <Link href={r.href} style={rowLinkStyle} aria-label={`Open ${r.label}`}>
            <span style={titleStyle}>{r.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ActivitySettings({ value, onChange }: WidgetSettingsFormProps<ActivityContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Default tab:</span>
        <select
          value={settings.defaultMode}
          onChange={(e) => onChange({ ...settings, defaultMode: e.target.value as ActivityMode })}
        >
          <option value="job-events">Job events</option>
          <option value="recent-pages">Recent pages</option>
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>Max rows:</span>
        <input
          type="number"
          min={1}
          max={100}
          value={settings.rowLimit}
          onChange={(e) => onChange({ ...settings, rowLimit: clampInt(e.target.value, 1, 100, 10) })}
          style={{ width: 80 }}
        />
      </label>
    </div>
  );
}

defineWidget<ActivityContent>({
  id: 'activity',
  label: 'Activity',
  description: 'Recent job events and your most-visited admin pages — one tile, two views.',
  category: 'work',
  iconName: 'Activity',
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  // Roles inherited from the legacy `job-activity-feed` (the broader
  // of the two cohorts). `recent-pages` mode reads the nav store so
  // every authenticated user could see SOMETHING; staying with the
  // broader work-cohort keeps the existing visibility intact.
  allowedRoles: ['admin', 'developer', 'field_crew', 'researcher', 'tech_support'],
  Widget: ActivityWidget,
  SettingsForm: ActivitySettings,
});

// ─── Helpers (exported for tests) ───────────────────────────────────

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 0, small: 3, medium: 6, large: 12, xlarge: 24 });
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

// ─── Style fragments ────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minWidth: 0,
};
const tabRowStyle: React.CSSProperties = {
  display: 'flex', gap: 4, paddingBottom: 4,
  borderBottom: '1px solid var(--theme-border)',
};
const tabStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 999,
  border: '1px solid transparent', background: 'transparent',
  color: 'var(--theme-fg-secondary)', cursor: 'pointer', fontSize: '0.8rem',
};
const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'var(--theme-accent)', color: 'var(--theme-accent-fg, white)',
  borderColor: 'var(--theme-accent)',
};
const panelStyle: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto' };
const listStyle: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: 0,
  display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)',
};
const rowLinkStyle: React.CSSProperties = {
  display: 'block', padding: '6px 12px', borderRadius: 6,
  background: 'var(--theme-bg-elevated)', textDecoration: 'none', color: 'inherit',
};
const titleStyle: React.CSSProperties = {
  display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const subtitleStyle: React.CSSProperties = {
  display: 'block', fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)',
};

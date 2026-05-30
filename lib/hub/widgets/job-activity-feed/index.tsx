'use client';
// Slice 123 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import { jobHref } from '@/lib/hub/widgets/_shared/widget-links';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

export type ActivityKind = 'stage' | 'file' | 'team' | 'comment' | 'tag';

export interface JobActivityFeedContent extends Record<string, unknown> {
  jobFilter: string;
  activityTypes: ActivityKind[];
  rowLimit: number;
}

const DEFAULTS: JobActivityFeedContent = {
  jobFilter: '',
  activityTypes: ['stage', 'file', 'team', 'comment', 'tag'],
  rowLimit: 30,
};

// hub-widget-excellence-10 R1 — realigned to the real activity API:
// `{ activity }` (not `items`), `type` is the raw action string
// ('job_file_uploaded', 'job_stage_changed', …), and rows carry
// `job_id`/`job_name` from the cross-job feed.
interface ActivityItem {
  id: string;
  type: string;
  label: string;
  actor?: string | null;
  at: string;
  detail?: string | null;
  job_id?: string | null;
  job_name?: string | null;
  job_number?: string | null;
}

function JobActivityFeedWidget({ size, content }: WidgetProps<JobActivityFeedContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<ActivityItem[]>([]);

  const fetchActivity = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams();
      if (settings.jobFilter) params.set('job_id', settings.jobFilter);
      params.set('limit', String(Math.max(1, Math.min(100, settings.rowLimit))));
      const res = await fetch(`/api/admin/jobs/activity?${params}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { activity?: ActivityItem[] } = await res.json();
      const list = (data.activity ?? []).filter((it) => settings.activityTypes.includes(kindForAction(it.type)));
      setItems(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.jobFilter, settings.activityTypes, settings.rowLimit]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>events</span>
        </div>
      );
    }
    return <WidgetEmpty icon="📜" title="No recent activity" description="Job events appear here as they happen." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>{items.length}</span>
        <span style={tinyStatLabelStyle()}>{items.length === 1 ? 'event' : 'events'}</span>
      </div>
    );
  }

  const showActor = bucket !== 'small'; // medium+ (tiny returned above)
  const showTime = bucket === 'large' || bucket === 'xlarge';
  const visible = items.slice(0, capForBucket(bucket));

  return (
    <ul role="list" style={listStyle}>
      {visible.map((it) => {
        const kind = kindForAction(it.type);
        const job = it.job_name ?? it.job_number ?? it.job_id ?? 'job';
        const meta = [job, showActor ? (it.actor ?? 'system') : null, showTime && it.at ? formatAge(it.at) : null]
          .filter(Boolean).join(' · ');
        const href = it.job_id ? jobHref(it.job_id) : '/admin/jobs';
        return (
          <li key={it.id}>
            <Link href={href} style={rowStyle} aria-label={`${it.label} — open ${job}`}>
              <span style={{ color: colorForKind(kind) }} aria-hidden>{iconForKind(kind)}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                <span style={titleStyle}>{it.detail ? `${it.label}: ${it.detail}` : it.label}</span>
                <span style={mutedStyle}>{meta}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Classify a raw activity action string into a display kind. Exported
 *  for testing. */
export function kindForAction(action: string): ActivityKind {
  const a = (action || '').toLowerCase();
  if (a.includes('stage')) return 'stage';
  if (a.includes('file') || a.includes('photo') || a.includes('drawing') || a.includes('cad')) return 'file';
  if (a.includes('team') || a.includes('assign') || a.includes('crew')) return 'team';
  if (a.includes('tag')) return 'tag';
  return 'comment';
}

/** Short relative age ("5m", "3h", "2d"). Exported for testing. */
export function formatAge(iso: string, nowMs: number = Date.now()): string {
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function JobActivityFeedSettings({ value, onChange }: WidgetSettingsFormProps<JobActivityFeedContent>) {
  const settings = { ...DEFAULTS, ...value };
  function toggleType(t: ActivityKind) {
    const next = settings.activityTypes.includes(t)
      ? settings.activityTypes.filter((x) => x !== t)
      : [...settings.activityTypes, t];
    onChange({ ...settings, activityTypes: next });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Job filter (job id)</span>
        <input type="text" value={settings.jobFilter} placeholder="blank = recent across all jobs" onChange={(e) => onChange({ ...settings, jobFilter: e.target.value })} />
      </label>
      <label>
        <span style={labelStyle}>Max rows</span>
        <input
          type="number"
          min={1}
          max={100}
          value={settings.rowLimit}
          onChange={(e) => onChange({ ...settings, rowLimit: Math.max(1, Math.min(100, Number(e.target.value))) })}
        />
      </label>
      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={labelStyle}>Activity types</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['stage', 'file', 'team', 'comment', 'tag'] as const).map((t) => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={settings.activityTypes.includes(t)} onChange={() => toggleType(t)} />
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>{labelForKind(t)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// consolidation Slice 5 (2026-05-30) — SUPERSEDED by `activity`,
// the unified job-events + recent-pages widget. Stays registered so
// saved hub layouts keep their tile.
defineWidget<JobActivityFeedContent>({
  id: 'job-activity-feed',
  label: 'Job Activity Feed',
  description: 'Recent activity across your jobs.',
  category: 'work',
  iconName: 'Activity',
  defaultSize: { w: 4, h: 3 },
  // Slice 216 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'tech_support'],
  Widget: JobActivityFeedWidget,
  SettingsForm: JobActivityFeedSettings,
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

export function iconForKind(kind: ActivityKind): string {
  switch (kind) {
    case 'stage': return '🔄';
    case 'file': return '📎';
    case 'team': return '👥';
    case 'comment': return '💬';
    case 'tag': return '🏷';
  }
}

export function colorForKind(kind: ActivityKind): string {
  switch (kind) {
    case 'stage': return 'var(--theme-accent)';
    case 'file': return 'var(--theme-info)';
    case 'team': return 'var(--theme-success)';
    case 'comment': return 'var(--theme-fg-secondary)';
    case 'tag': return 'var(--theme-warning)';
  }
}

export function labelForKind(kind: ActivityKind): string {
  switch (kind) {
    case 'stage': return 'Stage changes';
    case 'file': return 'File uploads';
    case 'team': return 'Team changes';
    case 'comment': return 'Comments';
    case 'tag': return 'Tag changes';
  }
}

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)', textDecoration: 'none', color: 'inherit' };
const titleStyle: React.CSSProperties = { fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const mutedStyle: React.CSSProperties = { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 };

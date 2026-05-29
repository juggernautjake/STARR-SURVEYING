'use client';
// Slice 123 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export type ActivityKind = 'stage' | 'file' | 'team' | 'comment' | 'tag';

export interface JobActivityFeedContent extends Record<string, unknown> {
  jobFilter: string;
  activityTypes: ActivityKind[];
}

const DEFAULTS: JobActivityFeedContent = {
  jobFilter: '',
  activityTypes: ['stage', 'file', 'team', 'comment', 'tag'],
};

interface ActivityItem {
  id: string;
  type: ActivityKind;
  label: string;
  actor?: string | null;
  at: string;
  job_id?: string | null;
  job_name?: string | null;
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
      const res = await fetch(`/api/admin/jobs/activity?${params}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { items?: ActivityItem[] } = await res.json();
      const list = (data.items ?? []).filter((it) => settings.activityTypes.includes(it.type));
      setItems(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.jobFilter, settings.activityTypes]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') return <WidgetEmpty icon="📜" title="No recent activity" description="Job events appear here as they happen." />;

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={listStyle}>
      {visible.map((it) => (
        <li key={it.id} style={rowStyle}>
          <span style={{ color: colorForKind(it.type) }} aria-hidden>{iconForKind(it.type)}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <span style={titleStyle}>{it.label}</span>
            {bucket !== 'tiny' && (
              <span style={mutedStyle}>
                {it.job_name ?? it.job_id ?? 'job'} · {it.actor ?? 'system'}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
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
        <span style={labelStyle}>Job filter (job_id)</span>
        <input type="text" value={settings.jobFilter} placeholder="blank = all" onChange={(e) => onChange({ ...settings, jobFilter: e.target.value })} />
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

defineWidget<JobActivityFeedContent>({
  id: 'job-activity-feed',
  label: 'Job Activity Feed',
  description: 'Recent activity across your jobs.',
  category: 'work',
  iconName: 'Activity',
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 6 },
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
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' };
const titleStyle: React.CSSProperties = { fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)' };
const mutedStyle: React.CSSProperties = { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 };

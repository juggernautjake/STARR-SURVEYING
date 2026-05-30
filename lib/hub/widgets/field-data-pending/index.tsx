'use client';
// lib/hub/widgets/field-data-pending/index.tsx
// Slice 122 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

export interface FieldDataPendingContent extends Record<string, unknown> {
  /** Optional job id to scope to a single job (blank = recent across
   *  all jobs via the aggregate feed). */
  jobFilter: string;
  rowLimit: number;
}

const DEFAULTS: FieldDataPendingContent = {
  jobFilter: '',
  rowLimit: 25,
};

// hub-widget-excellence-10 R1 — realigned to the real `job_field_data`
// shape: the API returns `{ field_data }` (not `captures`) with
// `collected_at` / `collected_by` (not captured_*) and a free-form
// `data_type` ('point', 'photo', …). The widget now reads those + a
// joined job name from the cross-job aggregate feed.
interface FieldCapture {
  id: string;
  job_id: string;
  job_name?: string | null;
  job_number?: string | null;
  data_type: string;
  point_name?: string | null;
  description?: string | null;
  collected_by?: string | null;
  collected_at: string;
}

function FieldDataPendingWidget({ size, content }: WidgetProps<FieldDataPendingContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [captures, setCaptures] = useState<FieldCapture[]>([]);

  const fetchCaptures = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams();
      if (settings.jobFilter) params.set('job_id', settings.jobFilter);
      params.set('limit', String(Math.max(1, Math.min(100, settings.rowLimit))));
      const res = await fetch(`/api/admin/jobs/field-data?${params}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { field_data?: FieldCapture[] } = await res.json();
      const list = data.field_data ?? [];
      setCaptures(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.jobFilter, settings.rowLimit]);

  useEffect(() => { fetchCaptures(); }, [fetchCaptures]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>captures</span>
        </div>
      );
    }
    return <WidgetEmpty icon="📍" title="No field data pending" description="Field captures appear here as they upload." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>{captures.length}</span>
        <span style={tinyStatLabelStyle()}>{captures.length === 1 ? 'capture' : 'captures'}</span>
      </div>
    );
  }

  // Per-bucket fields: small = job + type; medium adds who; large+ adds
  // the captured-age.
  const showWho = bucket !== 'small'; // medium+ (tiny returned above)
  const showAge = bucket === 'large' || bucket === 'xlarge';
  const visible = captures.slice(0, capForBucket(bucket));

  return (
    <ul role="list" style={listStyle}>
      {visible.map((c) => (
        <li key={c.id}>
          {/* Build/Wire — deep-link to the field-data detail page. */}
          <Link href={`/admin/field-data/${c.id}`} style={rowStyle} aria-label={`Open field data: ${c.job_name ?? c.job_id}`}>
            <span style={typeIconStyle} aria-hidden>{iconForType(c.data_type)}</span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={titleStyle}>{c.job_name ?? c.job_number ?? c.job_id}</span>
              <span style={mutedStyle}>
                {labelForType(c.data_type)}
                {showWho ? ` · ${c.collected_by ?? 'crew'}` : ''}
                {showAge && c.collected_at ? ` · ${formatAge(c.collected_at)}` : ''}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function FieldDataPendingSettings({ value, onChange }: WidgetSettingsFormProps<FieldDataPendingContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Job filter (job id)</span>
        <input
          type="text"
          value={settings.jobFilter}
          placeholder="leave blank for recent across all jobs"
          onChange={(e) => onChange({ ...settings, jobFilter: e.target.value })}
        />
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
    </div>
  );
}

defineWidget<FieldDataPendingContent>({
  id: 'field-data-pending',
  label: 'Field Data Pending',
  description: 'Field captures awaiting review.',
  category: 'work',
  iconName: 'MapPin',
  defaultSize: { w: 3, h: 3 },
  // Slice 215 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'tech_support'],
  Widget: FieldDataPendingWidget,
  SettingsForm: FieldDataPendingSettings,
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

/** Icon for a (free-form) data_type, with a survey-point default. */
export function iconForType(type: string): string {
  switch ((type || '').toLowerCase()) {
    case 'photo':
    case 'photos': return '📷';
    case 'gps':
    case 'point':
    case 'points': return '📍';
    case 'note':
    case 'notes': return '📝';
    case 'measurement':
    case 'measurements': return '📏';
    default: return '📍';
  }
}

/** Human label for a (free-form) data_type — title-cased, plural-aware
 *  for the known survey kinds. */
export function labelForType(type: string): string {
  const t = (type || '').toLowerCase();
  switch (t) {
    case 'point':
    case 'points': return 'Survey points';
    case 'photo':
    case 'photos': return 'Photos';
    case 'gps': return 'GPS points';
    case 'note':
    case 'notes': return 'Notes';
    case 'measurement':
    case 'measurements': return 'Measurements';
    default: return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Field data';
  }
}

/** Short relative age, e.g. "5m", "3h", "2d". Exported for testing. */
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

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)', textDecoration: 'none', color: 'inherit' };
const typeIconStyle: React.CSSProperties = { fontSize: '1.1rem' };
const titleStyle: React.CSSProperties = { fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)' };
const mutedStyle: React.CSSProperties = { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 };

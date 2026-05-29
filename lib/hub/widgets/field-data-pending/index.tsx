'use client';
// lib/hub/widgets/field-data-pending/index.tsx
// Slice 122 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

export type FieldDataType = 'photos' | 'gps' | 'notes' | 'measurements';

export interface FieldDataPendingContent extends Record<string, unknown> {
  jobFilter: string;
  dataTypes: FieldDataType[];
}

const DEFAULTS: FieldDataPendingContent = {
  jobFilter: '',
  dataTypes: ['photos', 'gps', 'notes', 'measurements'],
};

interface FieldCapture {
  id: string;
  job_id: string;
  job_name?: string | null;
  data_type: FieldDataType;
  captured_by?: string | null;
  captured_at: string;
}

function FieldDataPendingWidget({ size, content }: WidgetProps<FieldDataPendingContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [captures, setCaptures] = useState<FieldCapture[]>([]);

  const fetchCaptures = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams({ status: 'pending' });
      if (settings.jobFilter) params.set('job_id', settings.jobFilter);
      const res = await fetch(`/api/admin/jobs/field-data?${params}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { captures?: FieldCapture[] } = await res.json();
      const list = (data.captures ?? []).filter((c) => settings.dataTypes.includes(c.data_type));
      setCaptures(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.jobFilter, settings.dataTypes]);

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

  const visible = captures.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={listStyle}>
      {visible.map((c) => (
        <li key={c.id} style={rowStyle}>
          <span style={typeIconStyle} aria-hidden>{iconForType(c.data_type)}</span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={titleStyle}>{c.job_name ?? c.job_id}</span>
            <span style={mutedStyle}>{labelForType(c.data_type)} · {c.captured_by ?? 'crew'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function FieldDataPendingSettings({ value, onChange }: WidgetSettingsFormProps<FieldDataPendingContent>) {
  const settings = { ...DEFAULTS, ...value };
  function toggleType(t: FieldDataType) {
    const next = settings.dataTypes.includes(t)
      ? settings.dataTypes.filter((x) => x !== t)
      : [...settings.dataTypes, t];
    onChange({ ...settings, dataTypes: next });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Job filter (job_id)</span>
        <input
          type="text"
          value={settings.jobFilter}
          placeholder="leave blank for all jobs"
          onChange={(e) => onChange({ ...settings, jobFilter: e.target.value })}
        />
      </label>
      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={labelStyle}>Data types</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['photos', 'gps', 'notes', 'measurements'] as const).map((t) => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={settings.dataTypes.includes(t)} onChange={() => toggleType(t)} />
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>{labelForType(t)}</span>
            </label>
          ))}
        </div>
      </fieldset>
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

export function iconForType(type: FieldDataType): string {
  switch (type) {
    case 'photos': return '📷';
    case 'gps': return '📍';
    case 'notes': return '📝';
    case 'measurements': return '📏';
  }
}

export function labelForType(type: FieldDataType): string {
  switch (type) {
    case 'photos': return 'Photos';
    case 'gps': return 'GPS points';
    case 'notes': return 'Notes';
    case 'measurements': return 'Measurements';
  }
}

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' };
const typeIconStyle: React.CSSProperties = { fontSize: '1.1rem' };
const titleStyle: React.CSSProperties = { fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)' };
const mutedStyle: React.CSSProperties = { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 };

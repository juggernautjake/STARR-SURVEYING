'use client';
// Slice 128 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import { cadJobHref } from '@/lib/hub/widgets/_shared/widget-links';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';

export interface RecentDrawingsContent extends Record<string, unknown> {
  scope: 'mine' | 'all';
}
const DEFAULTS: RecentDrawingsContent = { scope: 'mine' };

// hub-widget-excellence-12 R1 — the cad/drawings GET returns `job_id`
// (+ a joined `job_name`) + `created_by` + `updated_at`, NOT the
// `opened_by` this widget originally read.
interface Drawing {
  id: string;
  name: string;
  job_id?: string | null;
  job_name?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
}

/** Where a drawing row opens in the CAD editor (the user's headline
 *  ask: open the drawing's job in CAD). Prefers the job-scoped open
 *  (`/admin/cad?job={job_id}`) so the job loads; falls back to opening
 *  the drawing directly. Pure + exported. */
export function cadOpenHref(d: Pick<Drawing, 'id' | 'job_id'>): string {
  if (d.job_id) return cadJobHref(d.job_id);
  return `/admin/cad?drawing=${encodeURIComponent(d.id)}`;
}

function RecentDrawingsWidget({ size, content }: WidgetProps<RecentDrawingsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<Drawing[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams();
      if (settings.scope === 'mine') params.set('mine', 'true');
      const res = await fetch(`/api/admin/cad/drawings?${params}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { drawings?: Drawing[] } = await res.json();
      setItems(data.drawings ?? []);
      setStatus((data.drawings ?? []).length === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, [settings.scope]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>drawings</span>
        </div>
      );
    }
    return <WidgetEmpty icon="📐" title="No recent drawings" description="Drawings open here as you work in CAD." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>{items.length}</span>
        <span style={tinyStatLabelStyle()}>{items.length === 1 ? 'drawing' : 'drawings'}</span>
      </div>
    );
  }

  const showMeta = bucket === 'large' || bucket === 'xlarge';
  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {visible.map((d) => (
        <li key={d.id}>
          {/* Headline ask — each drawing opens in the CAD editor with
              its job loaded. */}
          <Link href={cadOpenHref(d)} style={rowLinkStyle} aria-label={`Open ${d.name} in CAD`}>
            <span style={{ display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
            {(d.job_name || (showMeta && d.updated_at)) && (
              <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
                {d.job_name ?? ''}
                {d.job_name && showMeta && d.updated_at ? ' · ' : ''}
                {showMeta && d.updated_at ? formatAge(d.updated_at) : ''}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Short relative age. Exported for testing. */
export function formatAge(iso: string, nowMs: number = Date.now()): string {
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const rowLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: '6px 12px',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
  textDecoration: 'none',
  color: 'inherit',
};

function RecentDrawingsSettings({ value, onChange }: WidgetSettingsFormProps<RecentDrawingsContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>Scope</span>
      <select value={settings.scope} onChange={(e) => onChange({ ...settings, scope: e.target.value as 'mine' | 'all' })}>
        <option value="mine">Mine</option>
        <option value="all">All</option>
      </select>
    </label>
  );
}

defineWidget<RecentDrawingsContent>({
  id: 'recent-drawings',
  label: 'Recent Drawings',
  description: 'Recently opened CAD drawings.',
  category: 'cad',
  iconName: 'PenTool',
  defaultSize: { w: 3, h: 3 },
  // Slice 216 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'drawer', 'researcher', 'field_crew', 'tech_support'],
  Widget: RecentDrawingsWidget,
  SettingsForm: RecentDrawingsSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}

'use client';
// Slice 129 of customizable-hub-and-work-mode-2026-05-28.md.

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
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';
import { cadOpenHref, formatAge } from '@/lib/hub/widgets/recent-drawings';

export interface DrawingsInProgressContent extends Record<string, unknown> {
  scope: 'mine' | 'team';
}
const DEFAULTS: DrawingsInProgressContent = { scope: 'mine' };

// hub-widget-excellence-12 R1 — `cad_drawings` has no workflow status,
// assignee, or progress columns, so the old `assigned_to` /
// `percent_complete` / `due_at` / `?status=in-progress` were all
// phantom (always blank). "In progress" = recently-updated drawings
// (scope 'mine' filters to the caller's). We show the real fields:
// name + joined job + last-updated age, each opening in CAD.
interface Drawing { id: string; name: string; job_id?: string | null; job_name?: string | null; updated_at?: string | null; }

function DrawingsInProgressWidget({ size, content }: WidgetProps<DrawingsInProgressContent>) {
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
          <span style={tinyStatLabelStyle()}>in progress</span>
        </div>
      );
    }
    return <WidgetEmpty icon="✏️" title="Nothing in progress" description="Active drawings appear here." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>{items.length}</span>
        <span style={tinyStatLabelStyle()}>{items.length === 1 ? 'in progress' : 'in progress'}</span>
      </div>
    );
  }

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {visible.map((d) => (
        <li key={d.id}>
          {/* Open in CAD with the drawing's job loaded (shared headline
              with recent-drawings). */}
          <Link href={cadOpenHref(d)} style={rowLinkStyle} aria-label={`Open ${d.name} in CAD`}>
            <span style={{ display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
            {(d.job_name || d.updated_at) && (
              <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
                {d.job_name ?? ''}
                {d.job_name && d.updated_at ? ' · ' : ''}
                {d.updated_at ? formatAge(d.updated_at) : ''}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

const rowLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: '6px 12px',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
  textDecoration: 'none',
  color: 'inherit',
};

function DrawingsInProgressSettings({ value, onChange }: WidgetSettingsFormProps<DrawingsInProgressContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>Scope</span>
      <select value={settings.scope} onChange={(e) => onChange({ ...settings, scope: e.target.value as 'mine' | 'team' })}>
        <option value="mine">Mine</option>
        <option value="team">Team</option>
      </select>
    </label>
  );
}

defineWidget<DrawingsInProgressContent>({
  id: 'drawings-in-progress',
  label: 'Drawings In Progress',
  description: 'CAD drawings currently being worked on.',
  category: 'cad',
  iconName: 'Layers',
  defaultSize: { w: 3, h: 3 },
  // Slice 215 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'drawer', 'tech_support'],
  Widget: DrawingsInProgressWidget,
  SettingsForm: DrawingsInProgressSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}

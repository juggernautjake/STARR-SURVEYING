'use client';
// lib/hub/widgets/drawings/index.tsx
//
// consolidation Slice 4 (2026-05-30) — the unified Drawings widget.
// Folds the two legacy widgets (`recent-drawings`, `drawings-in-
// progress`) into one tile with a `scope` setting. Both legacy
// widgets used the same `/api/admin/cad/drawings` endpoint with the
// same `?mine=true` filter; only their labels + categories differed.
//
// `team` scope (per the plan): the legacy `drawings-in-progress`
// labeled its 'all' mode as 'team', but the API has no per-team
// filter today — `team` and `all` were the same fetch. We ship two
// modes here (`mine` and `all`); a real team filter can land in a
// follow-up alongside the drawings-collaboration assigned_to work.
//
// The legacy widgets stay registered so saved hub layouts don't lose
// their tiles; a follow-up slice migrates saved layouts + deletes
// the legacy ids.

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

export type DrawingsScope = 'mine' | 'all';

export interface DrawingsContent extends Record<string, unknown> {
  scope: DrawingsScope;
}
const DEFAULTS: DrawingsContent = { scope: 'mine' };

interface Drawing {
  id: string;
  name: string;
  job_id?: string | null;
  job_name?: string | null;
  updated_at?: string | null;
}

function DrawingsWidget({ size, content }: WidgetProps<DrawingsContent>) {
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
  useEffect(() => { void fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, items.length > 0 ? 'var(--theme-accent)' : 'var(--theme-fg-secondary)')}>
          {items.length}
        </span>
        <span style={tinyStatLabelStyle()}>{settings.scope === 'mine' ? 'mine' : 'drawings'}</span>
      </div>
    );
  }

  if (status === 'empty') {
    return <WidgetEmpty
      icon="✏️"
      title={settings.scope === 'mine' ? 'No drawings yet' : 'No drawings'}
      description={settings.scope === 'mine' ? "Open the CAD editor to start your first." : 'Drawings appear here as the team adds them.'}
    />;
  }

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={listStyle}>
      {visible.map((d) => (
        <li key={d.id}>
          <Link href={cadOpenHref(d)} style={rowLinkStyle} aria-label={`Open ${d.name} in CAD`}>
            <span style={titleStyle}>{d.name}</span>
            {(d.job_name || d.updated_at) && (
              <span style={subtitleStyle}>
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

function DrawingsSettings({ value, onChange }: WidgetSettingsFormProps<DrawingsContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span>Scope:</span>
      <select
        value={settings.scope}
        onChange={(e) => onChange({ ...settings, scope: e.target.value as DrawingsScope })}
      >
        <option value="mine">Mine</option>
        <option value="all">All drawings</option>
      </select>
    </label>
  );
}

defineWidget<DrawingsContent>({
  id: 'drawings',
  label: 'Drawings',
  description: 'Recent CAD drawings — yours or every drawing on file.',
  category: 'cad',
  iconName: 'PenTool',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'drawer', 'researcher', 'field_crew', 'tech_support'],
  Widget: DrawingsWidget,
  SettingsForm: DrawingsSettings,
});

// ─── Helpers (exported for tests) ───────────────────────────────────

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}

// ─── Style fragments ────────────────────────────────────────────────

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
  fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)',
};

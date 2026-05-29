'use client';
// Slice 129 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';

export interface DrawingsInProgressContent extends Record<string, unknown> {
  scope: 'mine' | 'team';
}
const DEFAULTS: DrawingsInProgressContent = { scope: 'mine' };

interface Drawing { id: string; name: string; assigned_to?: string | null; percent_complete?: number | null; due_at?: string | null; }

function DrawingsInProgressWidget({ size, content }: WidgetProps<DrawingsInProgressContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<Drawing[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams({ status: 'in-progress' });
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
  if (status === 'empty') return <WidgetEmpty icon="✏️" title="Nothing in progress" description="Active drawings appear here." />;

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {visible.map((d) => (
        <li key={d.id} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{d.name}</span>
            {typeof d.percent_complete === 'number' && (
              <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{d.percent_complete}%</span>
            )}
          </span>
          {bucket !== 'tiny' && typeof d.percent_complete === 'number' && (
            <div aria-hidden style={{ height: 4, borderRadius: 2, background: 'var(--theme-bg-surface)', marginTop: 4, overflow: 'hidden' }}>
              <div style={{ width: `${d.percent_complete}%`, height: '100%', background: 'var(--theme-accent)' }} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

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
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'drawer', 'tech_support'],
  Widget: DrawingsInProgressWidget,
  SettingsForm: DrawingsInProgressSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}

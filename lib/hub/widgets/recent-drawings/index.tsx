'use client';
// Slice 128 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';

export interface RecentDrawingsContent extends Record<string, unknown> {
  scope: 'mine' | 'all';
}
const DEFAULTS: RecentDrawingsContent = { scope: 'mine' };

interface Drawing { id: string; name: string; job_name?: string | null; updated_at: string; opened_by?: string | null; }

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
  if (status === 'empty') return <WidgetEmpty icon="📐" title="No recent drawings" description="Drawings open here as you work in CAD." />;

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {visible.map((d) => (
        <li key={d.id} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
          <span style={{ display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{d.name}</span>
          {bucket !== 'tiny' && d.job_name && (
            <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{d.job_name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

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
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'drawer', 'researcher', 'field_crew', 'tech_support'],
  Widget: RecentDrawingsWidget,
  SettingsForm: RecentDrawingsSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}

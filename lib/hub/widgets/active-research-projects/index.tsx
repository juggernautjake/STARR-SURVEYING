'use client';
// Slice 130 of customizable-hub-and-work-mode-2026-05-28.md.

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
import { bucketCap } from '@/lib/hub/widgets/_shared/simple-list-widget';

export interface ActiveResearchProjectsContent extends Record<string, unknown> {
  countyFilter: string;
}
const DEFAULTS: ActiveResearchProjectsContent = { countyFilter: '' };

interface ResearchProject { id: string; name: string; county?: string | null; status: string; updated_at: string; }

function ActiveResearchProjectsWidget({ size, content }: WidgetProps<ActiveResearchProjectsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<ResearchProject[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams({ status: 'active' });
      if (settings.countyFilter) params.set('county', settings.countyFilter);
      const res = await fetch(`/api/admin/research?${params}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { projects?: ResearchProject[] } = await res.json();
      setItems(data.projects ?? []);
      setStatus((data.projects ?? []).length === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, [settings.countyFilter]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>projects</span>
        </div>
      );
    }
    return <WidgetEmpty icon="🔬" title="No active projects" description="Active research projects appear here." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-info)')}>{items.length}</span>
        <span style={tinyStatLabelStyle()}>{items.length === 1 ? 'project' : 'projects'}</span>
      </div>
    );
  }

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {visible.map((p) => (
        <li key={p.id} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
          <span style={{ display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{p.name}</span>
          {p.county && (
            <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{p.county}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ActiveResearchProjectsSettings({ value, onChange }: WidgetSettingsFormProps<ActiveResearchProjectsContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>County filter</span>
      <input type="text" value={settings.countyFilter} placeholder="blank = all counties" onChange={(e) => onChange({ ...settings, countyFilter: e.target.value })} />
    </label>
  );
}

defineWidget<ActiveResearchProjectsContent>({
  id: 'active-research-projects',
  label: 'Active Research Projects',
  description: 'Property research projects in flight.',
  category: 'research',
  iconName: 'Microscope',
  defaultSize: { w: 3, h: 3 },
  // Slice 216 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'researcher', 'tech_support'],
  Widget: ActiveResearchProjectsWidget,
  SettingsForm: ActiveResearchProjectsSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  return bucketCap(bucket, { tiny: 2, small: 4, medium: 6, large: 12, xlarge: 24 });
}

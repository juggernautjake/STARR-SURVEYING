'use client';
// Slice 130 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import { researchProjectHref } from '@/lib/hub/widgets/_shared/widget-links';
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

interface ResearchProject { id: string; name: string; county?: string | null; status: string; updated_at?: string | null; }

// hub-widget-excellence-12 R1 — research_projects `status` is one of
// upload/configure/analyzing/review/drawing/verifying/complete — there
// is NO 'active' status, so the old `?status=active` returned nothing.
// "Active" = any project that isn't complete; the `?county=` param was
// also ignored (the route only searches via `q`), so both filters run
// client-side now.
const COMPLETE_STATUS = 'complete';

/** A project is "active" while it's anywhere short of complete. Pure +
 *  exported. */
export function isActiveProject(status: string | null | undefined): boolean {
  return !!status && status !== COMPLETE_STATUS;
}

/** Title-case a research workflow status for display. Pure + exported. */
export function humanizeStatus(status: string | null | undefined): string {
  if (!status) return '';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ActiveResearchProjectsWidget({ size, content }: WidgetProps<ActiveResearchProjectsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<ResearchProject[]>([]);

  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/research?status=all');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { projects?: ResearchProject[] } = await res.json();
      const county = settings.countyFilter.trim().toLowerCase();
      const list = (data.projects ?? [])
        .filter((p) => isActiveProject(p.status))
        .filter((p) => !county || (p.county ?? '').toLowerCase().includes(county));
      setItems(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
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

  const showStatus = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';
  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {visible.map((p) => (
        <li key={p.id}>
          {/* Row deep link → the research project detail page. */}
          <Link href={researchProjectHref(p.id)} style={rowLinkStyle} aria-label={`Open ${p.name}`}>
            <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              {showStatus && p.status && (
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--theme-info)', flexShrink: 0, whiteSpace: 'nowrap' }}>{humanizeStatus(p.status)}</span>
              )}
            </span>
            {p.county && (
              <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>{p.county}</span>
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

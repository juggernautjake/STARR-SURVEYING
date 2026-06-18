'use client';
// Slice 132 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

// Slice 15b — wired to the Slice-12 schema fields (revised this slice
// to match what the widget can actually display: one roadmap rollup,
// not per-phase data):
//   - showName:    the roadmap title under the percent
//   - showCurrent: the "Now on: <module>" line
//   - showBar:     the inline progress bar
// All three default true so existing layouts render identically.
import { resolveBool } from '@/lib/hub/widgets/_shared/content-resolvers';

export interface RoadmapProgressContent extends Record<string, unknown> {
  showName?: boolean;
  showCurrent?: boolean;
  showBar?: boolean;
}
const DEFAULTS: RoadmapProgressContent = {
  showName: true,
  showCurrent: true,
  showBar: true,
};

export const resolveShowName    = (c: RoadmapProgressContent): boolean => resolveBool(c.showName,    true);
export const resolveShowCurrent = (c: RoadmapProgressContent): boolean => resolveBool(c.showCurrent, true);
export const resolveShowBar     = (c: RoadmapProgressContent): boolean => resolveBool(c.showBar,     true);

interface RoadmapModule { title: string; percent: number }
interface Roadmap {
  id: string;
  name: string;
  percent_complete: number;
  current_module?: string | null;
  // Slice S5 — keep the per-module list so large+ buckets can
  // render a mini module-progress strip.
  modules: RoadmapModule[];
}

// hub-widget-excellence-13 R1 — the roadmap GET returns
// `{ modules, milestones, overall_progress: { percentage } }`, NOT a
// `{ roadmap: {…} }` object — so the widget always read undefined +
// showed empty. We derive the rollup the widget renders.
interface RoadmapApiModule { title?: string | null; percentage?: number | null }
interface RoadmapApiResponse {
  modules?: RoadmapApiModule[];
  overall_progress?: { percentage?: number | null };
}

/** Build the single-roadmap rollup from the API's module list +
 *  overall progress. The "current module" is the first one that isn't
 *  100% complete. Returns null when there are no modules. Pure +
 *  exported. */
export function toRoadmap(data: RoadmapApiResponse): Roadmap | null {
  const modules = data.modules ?? [];
  if (modules.length === 0) return null;
  const pct = data.overall_progress?.percentage;
  const percent = typeof pct === 'number' && Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0;
  const current = modules.find((m) => (m.percentage ?? 0) < 100);
  return {
    id: 'overall',
    name: 'Learning Roadmap',
    percent_complete: percent,
    current_module: current?.title ?? null,
    modules: modules
      .filter((m): m is RoadmapApiModule & { title: string } => typeof m.title === 'string' && m.title.length > 0)
      .map((m) => ({
        title: m.title,
        percent: typeof m.percentage === 'number' && Number.isFinite(m.percentage)
          ? Math.max(0, Math.min(100, Math.round(m.percentage)))
          : 0,
      })),
  };
}

function RoadmapProgressWidget({ size, content }: WidgetProps<RoadmapProgressContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const showName    = resolveShowName(content);
  const showCurrent = resolveShowCurrent(content);
  const showBar     = resolveShowBar(content);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);

  const fetchRoadmap = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/learn/roadmap');
      if (!res.ok) { setStatus('empty'); return; }
      const data: RoadmapApiResponse = await res.json();
      const roadmap = toRoadmap(data);
      if (!roadmap) { setStatus('empty'); return; }
      setRoadmap(roadmap);
      setStatus('ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchRoadmap(); }, [fetchRoadmap]);

  if (status === 'loading') return <WidgetSkeleton rows={2} />;
  if (status === 'empty' || !roadmap) {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>—</span>
          <span style={tinyStatLabelStyle()}>roadmap</span>
        </div>
      );
    }
    return <WidgetEmpty icon="🗺" title="No roadmap yet" description="Once an admin assigns a roadmap, progress shows here." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()} data-testid="roadmap-progress-tiny">
        <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>{roadmap.percent_complete}%</span>
        <span style={tinyStatLabelStyle()}>roadmap</span>
      </div>
    );
  }

  // Slice S5 — surface a per-module mini-progress strip at large+
  // (xlarge keeps a longer list). Each row shows the module title +
  // a slim per-module bar so the surveyor sees which pieces remain.
  const showModuleList = bucket === 'large' || bucket === 'xlarge';
  const moduleCap = moduleCapForBucket(bucket);
  return (
    <div
      data-testid={`roadmap-progress-${bucket}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, height: '100%' }}
    >
      <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>{roadmap.percent_complete}%</span>
      {showName && (
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>{roadmap.name}</span>
      )}
      {showCurrent && roadmap.current_module && (
        <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>Now on: {roadmap.current_module}</span>
      )}
      {showBar && (
        <div aria-hidden style={{ height: 6, borderRadius: 3, background: 'var(--theme-bg-elevated)', overflow: 'hidden' }}>
          <div style={{ width: `${roadmap.percent_complete}%`, height: '100%', background: 'var(--theme-accent)' }} />
        </div>
      )}
      {showModuleList && roadmap.modules.length > 0 && (
        <ul
          data-testid="roadmap-progress-modules"
          aria-label="Modules"
          style={modulesListStyle}
        >
          {roadmap.modules.slice(0, moduleCap).map((m) => (
            <li key={m.title} style={moduleRowStyle}>
              <span style={moduleTitleStyle} title={m.title}>{m.title}</span>
              <span style={modulePctStyle}>{m.percent}%</span>
              <span aria-hidden style={moduleBarTrackStyle}>
                <span
                  style={{
                    display: 'block',
                    width: `${m.percent}%`,
                    height: '100%',
                    background: m.percent >= 100 ? 'var(--theme-success)' : 'var(--theme-accent)',
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** How many modules to surface at the large+ bucket. Pure + exported. */
export function moduleCapForBucket(bucket: ReturnType<typeof sizeBucket>): number {
  switch (bucket) {
    case 'tiny':
    case 'small':
    case 'medium':
      return 0;
    case 'large':
      return 4;
    case 'xlarge':
      return 8;
  }
}

const modulesListStyle: React.CSSProperties = {
  listStyle: 'none', margin: '4px 0 0', padding: 0,
  display: 'flex', flexDirection: 'column', gap: 6,
  borderTop: '1px solid var(--theme-border)',
  paddingTop: 6,
};
const moduleRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gridTemplateRows: 'auto auto',
  columnGap: 8,
  rowGap: 2,
  alignItems: 'center',
};
const moduleTitleStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-primary)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const modulePctStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.7rem)',
  color: 'var(--theme-fg-secondary)',
  fontVariantNumeric: 'tabular-nums',
};
const moduleBarTrackStyle: React.CSSProperties = {
  display: 'block',
  gridColumn: '1 / -1',
  height: 4,
  borderRadius: 2,
  background: 'var(--theme-bg-elevated)',
  overflow: 'hidden',
};

defineWidget<RoadmapProgressContent>({
  id: 'roadmap-progress',
  label: 'Roadmap Progress',
  description: 'Your roadmap completion at a glance.',
  category: 'learning',
  iconName: 'Map',
  defaultSize: { w: 4, h: 2 },
  // Slice 216 — minSize lowered to 1×1 with the tiny percent mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['student', 'teacher', 'admin', 'developer'],
  Widget: RoadmapProgressWidget,
});

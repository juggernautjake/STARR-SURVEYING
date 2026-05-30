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

interface Roadmap { id: string; name: string; percent_complete: number; current_module?: string | null; }

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
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>{roadmap.percent_complete}%</span>
        <span style={tinyStatLabelStyle()}>roadmap</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
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
    </div>
  );
}

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

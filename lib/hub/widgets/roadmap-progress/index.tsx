'use client';
// Slice 132 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export interface RoadmapProgressContent extends Record<string, unknown> { /* none for now */ }
const DEFAULTS: RoadmapProgressContent = {};

interface Roadmap { id: string; name: string; percent_complete: number; current_module?: string | null; }

function RoadmapProgressWidget({ size }: WidgetProps<RoadmapProgressContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);

  const fetchRoadmap = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/learn/roadmap');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { roadmap?: Roadmap } = await res.json();
      if (!data.roadmap) { setStatus('empty'); return; }
      setRoadmap(data.roadmap);
      setStatus('ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchRoadmap(); }, [fetchRoadmap]);

  if (status === 'loading') return <WidgetSkeleton rows={2} />;
  if (status === 'empty' || !roadmap) return <WidgetEmpty icon="🗺" title="No roadmap yet" description="Once an admin assigns a roadmap, progress shows here." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 'var(--hub-font-2xl, 1.5rem)', fontWeight: 700, color: 'var(--theme-accent)' }}>{roadmap.percent_complete}%</span>
      <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>{roadmap.name}</span>
      {bucket !== 'tiny' && roadmap.current_module && (
        <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>Now on: {roadmap.current_module}</span>
      )}
      <div aria-hidden style={{ height: 6, borderRadius: 3, background: 'var(--theme-bg-elevated)', overflow: 'hidden' }}>
        <div style={{ width: `${roadmap.percent_complete}%`, height: '100%', background: 'var(--theme-accent)' }} />
      </div>
    </div>
  );
}

defineWidget<RoadmapProgressContent>({
  id: 'roadmap-progress',
  label: 'Roadmap Progress',
  description: 'Your roadmap completion at a glance.',
  category: 'learning',
  iconName: 'Map',
  defaultSize: { w: 6, h: 2 },
  minSize: { w: 3, h: 1 },
  maxSize: { w: 12, h: 4 },
  defaultContent: DEFAULTS,
  allowedRoles: ['student', 'teacher', 'admin', 'developer'],
  Widget: RoadmapProgressWidget,
});

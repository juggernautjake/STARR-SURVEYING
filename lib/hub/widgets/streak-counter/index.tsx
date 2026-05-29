'use client';
// Slice 144 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 212 of hub-grid-8x8-square-cells-2026-05-29.md — adopt the
// shared stat-bucket helpers so the streak reads cleanly at every
// size from 1×1 through 4×4.

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

export interface StreakCounterContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: StreakCounterContent = {};

interface StreakInfo { current_days: number; longest_days: number; }

function StreakCounterWidget({ size }: WidgetProps<StreakCounterContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [info, setInfo] = useState<StreakInfo | null>(null);

  const fetchInfo = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/learn/streak');
      if (!res.ok) { setStatus('empty'); return; }
      const data = await res.json();
      setInfo(data);
      setStatus('ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  if (status === 'loading') return <WidgetSkeleton rows={2} />;
  if (status === 'empty' || !info) {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0🔥</span>
          <span style={tinyStatLabelStyle()}>days</span>
        </div>
      );
    }
    return <WidgetEmpty icon="🔥" title="Start your streak" description="Complete a lesson today to begin a learning streak." />;
  }

  // Tiny — just the streak number + 🔥 + day label.
  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>{info.current_days}🔥</span>
        <span style={tinyStatLabelStyle()}>{info.current_days === 1 ? 'day' : 'days'}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>
        🔥 {info.current_days} day{info.current_days === 1 ? '' : 's'}
      </span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
        Longest: {info.longest_days} days
      </span>
    </div>
  );
}

defineWidget<StreakCounterContent>({
  id: 'streak-counter',
  label: 'Streak Counter',
  description: 'Your current learning streak.',
  category: 'learning',
  iconName: 'Flame',
  defaultSize: { w: 2, h: 1 },
  // Slice 212 — minSize lowered to 1×1 now that the widget renders a
  // proper tiny stat card.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 4, h: 4 },
  defaultContent: DEFAULTS,
  allowedRoles: ['student', 'teacher', 'admin', 'developer'],
  Widget: StreakCounterWidget,
});

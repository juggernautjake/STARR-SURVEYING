'use client';
// Slice 144 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export interface StreakCounterContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: StreakCounterContent = {};

interface StreakInfo { current_days: number; longest_days: number; }

function StreakCounterWidget() {
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
  if (status === 'empty' || !info) return <WidgetEmpty icon="🔥" title="Start your streak" description="Complete a lesson today to begin a learning streak." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 'var(--hub-font-2xl, 1.5rem)', fontWeight: 700, color: 'var(--theme-warning)' }}>🔥 {info.current_days} day{info.current_days === 1 ? '' : 's'}</span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>Longest: {info.longest_days} days</span>
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
  minSize: { w: 2, h: 1 },
  maxSize: { w: 4, h: 4 },
  defaultContent: DEFAULTS,
  allowedRoles: ['student', 'teacher', 'admin', 'developer'],
  Widget: StreakCounterWidget,
});

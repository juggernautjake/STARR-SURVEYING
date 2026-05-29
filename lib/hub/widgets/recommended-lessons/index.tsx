'use client';
// Slice 135 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export interface RecommendedLessonsContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: RecommendedLessonsContent = {};

interface Lesson { id: string; title: string; module_title?: string | null; estimated_minutes?: number | null; }

function RecommendedLessonsWidget({ size }: WidgetProps<RecommendedLessonsContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [lessons, setLessons] = useState<Lesson[]>([]);

  const fetchLessons = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/learn/recommended?limit=10');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { lessons?: Lesson[] } = await res.json();
      setLessons(data.lessons ?? []);
      setStatus((data.lessons ?? []).length === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchLessons(); }, [fetchLessons]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') return <WidgetEmpty icon="✨" title="No recommendations" description="Personalised lessons appear here as you progress." />;

  const cap = bucket === 'tiny' ? 2 : bucket === 'small' ? 3 : bucket === 'medium' ? 5 : bucket === 'large' ? 8 : 12;
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {lessons.slice(0, cap).map((l) => (
        <li key={l.id}>
          <Link href={`/admin/learn/lessons/${l.id}`} style={{ display: 'block', padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)', textDecoration: 'none', color: 'var(--theme-fg-primary)' }}>
            <span style={{ display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{l.title}</span>
            {bucket !== 'tiny' && (l.module_title || l.estimated_minutes) && (
              <span style={{ display: 'block', fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
                {[l.module_title, l.estimated_minutes ? `${l.estimated_minutes} min` : null].filter(Boolean).join(' · ')}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

defineWidget<RecommendedLessonsContent>({
  id: 'recommended-lessons',
  label: 'Recommended Lessons',
  description: 'Suggested next lessons based on your progress.',
  category: 'learning',
  iconName: 'Sparkles',
  defaultSize: { w: 6, h: 1 },
  minSize: { w: 3, h: 1 },
  maxSize: { w: 12, h: 4 },
  defaultContent: DEFAULTS,
  allowedRoles: ['student', 'teacher', 'admin', 'developer'],
  Widget: RecommendedLessonsWidget,
});

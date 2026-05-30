'use client';
// Slice 135 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import { lessonHref } from '@/lib/hub/widgets/_shared/widget-links';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

// Slice 15b — wired to the Slice-12 schema fields:
//   - maxItems: clamp the rendered list to 1–10; null → size cap
//   - category: 'all' | 'survey' | 'tech' | 'safety'. Filters the
//               lessons client-side by inspecting module_title /
//               title for the category token. A future API ?category=
//               query can replace this without re-touching the
//               render.
import { resolveBoundedInt, resolveEnum } from '@/lib/hub/widgets/_shared/content-resolvers';

export type RecommendedLessonsCategory = 'all' | 'survey' | 'tech' | 'safety';
const CATEGORIES: ReadonlyArray<RecommendedLessonsCategory> = ['all', 'survey', 'tech', 'safety'];

export interface RecommendedLessonsContent extends Record<string, unknown> {
  maxItems?: number;
  category?: RecommendedLessonsCategory;
}
const DEFAULTS: RecommendedLessonsContent = { maxItems: 4, category: 'all' };

export const resolveMaxItems = (c: RecommendedLessonsContent): number | null =>
  resolveBoundedInt(c.maxItems, 1, 10, null);
export const resolveCategory = (c: RecommendedLessonsContent): RecommendedLessonsCategory =>
  resolveEnum(c.category, CATEGORIES, 'all');

const CATEGORY_TOKENS: Record<RecommendedLessonsCategory, ReadonlyArray<string>> = {
  all:    [],
  survey: ['survey', 'surveying', 'land', 'cad', 'parcel'],
  tech:   ['tech', 'technical', 'gis', 'gps', 'rtk'],
  safety: ['safety', 'osha', 'ppe', 'hazard'],
};

export function lessonMatchesCategory(
  lesson: { title: string; module_title?: string | null },
  category: RecommendedLessonsCategory,
): boolean {
  if (category === 'all') return true;
  const tokens = CATEGORY_TOKENS[category];
  const haystack = `${lesson.title} ${lesson.module_title ?? ''}`.toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}

// hub-widget-excellence-13 R2 — the recommended payload now includes
// `module_id` so rows deep-link to the canonical lesson route
// (`/admin/learn/modules/{module}/{lesson}`); the old
// `/admin/learn/lessons/{id}` route doesn't exist.
interface Lesson { id: string; title: string; module_id?: string | null; module_title?: string | null; estimated_minutes?: number | null; }

/** Canonical open-lesson link; falls back to the modules list when the
 *  module is unknown. Pure + exported. */
export function recommendedLessonHref(l: Pick<Lesson, 'id' | 'module_id'>): string {
  return l.module_id ? lessonHref(l.module_id, l.id) : '/admin/learn/modules';
}

function RecommendedLessonsWidget({ size, content }: WidgetProps<RecommendedLessonsContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const explicitCap = resolveMaxItems(content);
  const category = resolveCategory(content);
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
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>lessons</span>
        </div>
      );
    }
    return <WidgetEmpty icon="✨" title="No recommendations" description="Personalised lessons appear here as you progress." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-info)')}>{lessons.length}</span>
        <span style={tinyStatLabelStyle()}>{lessons.length === 1 ? 'lesson' : 'lessons'}</span>
      </div>
    );
  }

  const sizeCap = bucket === 'small' ? 3 : bucket === 'medium' ? 5 : bucket === 'large' ? 8 : 12;
  const cap = explicitCap ?? sizeCap;
  const filtered = category === 'all'
    ? lessons
    : lessons.filter((l) => lessonMatchesCategory(l, category));
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {filtered.slice(0, cap).map((l) => (
        <li key={l.id}>
          <Link href={recommendedLessonHref(l)} style={{ display: 'block', padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)', textDecoration: 'none', color: 'var(--theme-fg-primary)' }}>
            <span style={{ display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{l.title}</span>
            {(l.module_title || l.estimated_minutes) && (
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
  defaultSize: { w: 4, h: 1 },
  // Slice 217 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['student', 'teacher', 'admin', 'developer'],
  Widget: RecommendedLessonsWidget,
});

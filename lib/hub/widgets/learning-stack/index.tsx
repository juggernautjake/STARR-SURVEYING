'use client';
// lib/hub/widgets/learning-stack/index.tsx
//
// Slice W9d (hub-cad-roles-polish-2026-06-18) — consolidated
// learning-stack widget. Absorbs:
//   - class-assignments   — outstanding assignment rows
//   - flashcards-due      — flashcard review backlog (count)
//   - recommended-lessons — discovery list
//
// Each legacy widget reads its own endpoint:
//   - /api/admin/learn/assignments?status=assigned → { assignments }
//   - /api/admin/learn/flashcards?due_count=true   → { due_count }
//   - /api/admin/learn/recommended?limit=10        → { lessons }
//
// The consolidated tile fans out three parallel reads, treats
// 401/403 as quiet "no data" per the W5 / W8 / W9a / W9b / W9c
// pattern, and renders size-relative content:
//   tiny    — total learning-stack count (assignments + cards due)
//   small   — assignments list
//   medium  — assignments + flashcards (2-col)
//   large   — 3-col (assignments / flashcards / recommended)
//   xlarge  — 3-col + longer lists
//
// Legacy widgets stay registered so saved hub layouts keep
// rendering their class-assignments / flashcards-due /
// recommended-lessons tiles until users replace them.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetError from '@/lib/hub/components/WidgetError';

interface Assignment {
  id: string;
  module_id?: string | null;
  lesson_id?: string | null;
  module_title?: string | null;
  lesson_title?: string | null;
  due_date?: string | null;
}
interface Lesson {
  id: string;
  title: string;
  module_id?: string | null;
  module_title?: string | null;
  estimated_minutes?: number | null;
}

interface LearningStackContent extends Record<string, unknown> {
  showOpenLink: boolean;
}
const DEFAULTS: LearningStackContent = { showOpenLink: true };

interface FetchState {
  status: 'loading' | 'ok' | 'empty' | 'error';
  errorMessage: string;
  assignments: Assignment[];
  flashcardsDue: number;
  lessons: Lesson[];
}

function LearningStackWidget({ size, content }: WidgetProps<LearningStackContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [state, setState] = useState<FetchState>({
    status: 'loading',
    errorMessage: '',
    assignments: [],
    flashcardsDue: 0,
    lessons: [],
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const [assignmentsRes, flashcardsRes, recommendedRes] = await Promise.all([
        fetch('/api/admin/learn/assignments?status=assigned').catch(() => null),
        fetch('/api/admin/learn/flashcards?due_count=true').catch(() => null),
        fetch('/api/admin/learn/recommended?limit=10').catch(() => null),
      ]);

      function readOrSkip(res: Response | null): Promise<unknown | null> | null {
        if (!res) return Promise.resolve(null);
        if (res.status === 401 || res.status === 403) return Promise.resolve(null);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }

      const assignmentsData = await readOrSkip(assignmentsRes) as { assignments?: Assignment[] } | null;
      const flashcardsData = await readOrSkip(flashcardsRes) as { due_count?: number } | null;
      const recommendedData = await readOrSkip(recommendedRes) as { lessons?: Lesson[] } | null;

      const assignments = assignmentsData?.assignments ?? [];
      const flashcardsDue = typeof flashcardsData?.due_count === 'number' ? flashcardsData.due_count : 0;
      const lessons = recommendedData?.lessons ?? [];

      const hasAny = assignments.length > 0 || flashcardsDue > 0 || lessons.length > 0;

      setState({
        status: hasAny ? 'ok' : 'empty',
        errorMessage: '',
        assignments,
        flashcardsDue,
        lessons,
      });
    } catch (err) {
      setState({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        assignments: [],
        flashcardsDue: 0,
        lessons: [],
      });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (state.status === 'loading') return <WidgetSkeleton rows={3} />;
  if (state.status === 'error') {
    return <WidgetError message={`Couldn't load learning data (${state.errorMessage}).`} onRetry={refresh} />;
  }
  if (state.status === 'empty') {
    return <WidgetEmpty icon="🎓" title="All caught up" description="No assignments, flashcards, or recommendations to surface right now." />;
  }

  const stackTotal = totalLearningCount(state.assignments.length, state.flashcardsDue);

  // tiny — total learning items waiting.
  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle} data-testid="learning-stack-tiny">
        <span style={tinyCountStyle}>{stackTotal}</span>
        <span style={tinyLabelStyle}>{stackTotal === 1 ? 'item' : 'items'}</span>
      </div>
    );
  }

  if (bucket === 'small') {
    return (
      <div style={columnStyle} data-testid="learning-stack-small">
        <AssignmentsSection assignments={state.assignments} limit={4} showOpenLink={settings.showOpenLink} />
      </div>
    );
  }

  if (bucket === 'medium') {
    return (
      <div style={twoColStyle} data-testid="learning-stack-medium">
        <AssignmentsSection assignments={state.assignments} limit={4} showOpenLink={settings.showOpenLink} />
        <FlashcardsSection count={state.flashcardsDue} showOpenLink={settings.showOpenLink} />
      </div>
    );
  }

  // large + xlarge — three columns.
  const listLimit = bucket === 'xlarge' ? 10 : 6;
  return (
    <div style={threeColStyle} data-testid={`learning-stack-${bucket}`}>
      <AssignmentsSection assignments={state.assignments} limit={listLimit} showOpenLink={settings.showOpenLink} />
      <FlashcardsSection count={state.flashcardsDue} showOpenLink={settings.showOpenLink} />
      <RecommendedSection lessons={state.lessons} limit={listLimit} showOpenLink={settings.showOpenLink} />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function AssignmentsSection({ assignments, limit, showOpenLink }: {
  assignments: Assignment[]; limit: number; showOpenLink: boolean;
}) {
  return (
    <section style={columnStyle}>
      <Header label="Assignments" href="/admin/learn" showOpenLink={showOpenLink} />
      {assignments.length === 0 ? (
        <span style={emptyLineStyle}>None due</span>
      ) : (
        <ul style={listStyle}>
          {assignments.slice(0, limit).map((a) => (
            <li key={a.id} style={rowStyle}>
              <a href={assignmentHref(a)} style={rowLinkStyle}>
                <span style={rowTitleStyle}>{a.lesson_title ?? a.module_title ?? 'Assignment'}</span>
                {a.due_date && <span style={rowMetaStyle}>Due {formatShortDate(a.due_date)}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FlashcardsSection({ count, showOpenLink }: {
  count: number; showOpenLink: boolean;
}) {
  return (
    <section style={columnStyle}>
      <Header label="Flashcards" href="/admin/learn/flashcards" showOpenLink={showOpenLink} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={metricStyle}>{count}</span>
        <span style={metricLabelStyle}>{count === 1 ? 'card due' : 'cards due'}</span>
      </div>
      {count > 0 && (
        <a href="/admin/learn/flashcards" style={primaryCtaStyle}>Review now</a>
      )}
    </section>
  );
}

function RecommendedSection({ lessons, limit, showOpenLink }: {
  lessons: Lesson[]; limit: number; showOpenLink: boolean;
}) {
  return (
    <section style={columnStyle}>
      <Header label="Recommended" href="/admin/learn/modules" showOpenLink={showOpenLink} />
      {lessons.length === 0 ? (
        <span style={emptyLineStyle}>No suggestions</span>
      ) : (
        <ul style={listStyle}>
          {lessons.slice(0, limit).map((l) => (
            <li key={l.id} style={rowStyle}>
              <a href={recommendedLessonHref(l)} style={rowLinkStyle}>
                <span style={rowTitleStyle}>{l.title}</span>
                {l.module_title && <span style={rowMetaStyle}>{l.module_title}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Header({ label, href, showOpenLink }: {
  label: string; href: string; showOpenLink: boolean;
}) {
  return (
    <header style={sectionHeaderStyle}>
      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{label}</span>
      {showOpenLink && (
        <a href={href} style={openLinkStyle}>Open →</a>
      )}
    </header>
  );
}

// ─── Pure helpers (exported for tests) ─────────────────────────────────

/** Total items in the learning stack (assignments + flashcards due).
 *  Pure + exported. */
export function totalLearningCount(assignmentCount: number, flashcardsDue: number): number {
  return Math.max(0, assignmentCount) + Math.max(0, flashcardsDue);
}

/** Pick a layout variant from a SizeBucket. Pure + exported. */
export function learningLayoutForBucket(bucket: SizeBucket): 'tiny' | 'small' | 'medium' | 'three' {
  if (bucket === 'tiny') return 'tiny';
  if (bucket === 'small') return 'small';
  if (bucket === 'medium') return 'medium';
  return 'three';
}

/** Canonical assignment deep-link. Mirrors `class-assignments`
 *  exactly so saved layouts that still render the legacy widget
 *  keep clicking the same href. Pure + exported. */
export function assignmentHref(a: Pick<Assignment, 'module_id' | 'lesson_id'>): string {
  if (a.module_id && a.lesson_id) return `/admin/learn/modules/${a.module_id}/${a.lesson_id}`;
  if (a.module_id) return `/admin/learn/modules/${a.module_id}`;
  return '/admin/learn';
}

/** Canonical recommended-lesson deep-link. Pure + exported. */
export function recommendedLessonHref(l: Pick<Lesson, 'id' | 'module_id'>): string {
  return l.module_id ? `/admin/learn/modules/${l.module_id}/${l.id}` : '/admin/learn/modules';
}

function formatShortDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Style fragments ───────────────────────────────────────────────────

const tinyWrapStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  height: '100%', gap: 2,
};
const tinyCountStyle: React.CSSProperties = {
  fontSize: 'clamp(1.4rem, 3vw, 2.2rem)', fontWeight: 700, lineHeight: 1,
  color: 'var(--theme-fg-primary)',
};
const tinyLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase', letterSpacing: 0.5,
};
const columnStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0,
};
const twoColStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--hub-spc-3, 12px)', height: '100%', minHeight: 0,
};
const threeColStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--hub-spc-3, 12px)', height: '100%', minHeight: 0,
};
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderBottom: '1px solid var(--theme-border)', paddingBottom: 4,
};
const openLinkStyle: React.CSSProperties = {
  fontSize: '0.7rem', color: 'var(--theme-accent, #3b82f6)', textDecoration: 'none',
};
const primaryCtaStyle: React.CSSProperties = {
  marginTop: 6, alignSelf: 'flex-start',
  padding: '4px 10px', borderRadius: 6,
  background: 'var(--theme-accent, #3b82f6)', color: 'white',
  fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none',
};
const metricStyle: React.CSSProperties = {
  fontSize: '1.4rem', fontWeight: 700, color: 'var(--theme-fg-primary)',
};
const metricLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase', letterSpacing: 0.4,
};
const listStyle: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0,
  display: 'flex', flexDirection: 'column', gap: 4,
  overflow: 'auto', minHeight: 0,
};
const rowStyle: React.CSSProperties = {
  display: 'flex', padding: '2px 0',
};
const rowLinkStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 1, textDecoration: 'none', color: 'inherit',
  width: '100%',
};
const rowTitleStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.82rem)', color: 'var(--theme-fg-primary)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const rowMetaStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)',
};
const emptyLineStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.82rem)', color: 'var(--theme-fg-secondary)',
  fontStyle: 'italic',
};

defineWidget<LearningStackContent>({
  id: 'learning-stack',
  label: 'Learning Stack',
  description: 'Assignments, flashcards, and recommended lessons — one shelf.',
  category: 'learning',
  iconName: 'BookOpen',
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: LearningStackWidget,
});

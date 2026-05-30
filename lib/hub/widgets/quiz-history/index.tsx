'use client';
// Slice 134 of customizable-hub-and-work-mode-2026-05-28.md.

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

// Slice 15 — wired to the Slice-12 schema fields:
//   - maxItems:   clamp the rendered list to 1–25; null → size cap
//   - showScore:  when false, hide the right-aligned percentage so the
//                 list reads as a focused quiz list (quiz name only)
//   - onlyFailed: when true, filter attempts to those where pct < 60%
//                 (the same threshold the per-row color treatment uses)
import { resolveBoundedInt, resolveBool } from '@/lib/hub/widgets/_shared/content-resolvers';

export interface QuizHistoryContent extends Record<string, unknown> {
  maxItems?: number;
  showScore?: boolean;
  onlyFailed?: boolean;
}
const DEFAULTS: QuizHistoryContent = { maxItems: 5, showScore: true, onlyFailed: false };

export const resolveMaxItems = (c: QuizHistoryContent): number | null =>
  resolveBoundedInt(c.maxItems, 1, 25, null);
export const resolveShowScore = (c: QuizHistoryContent): boolean =>
  resolveBool(c.showScore, true);
export const resolveOnlyFailed = (c: QuizHistoryContent): boolean =>
  resolveBool(c.onlyFailed, false);

export const FAILED_PCT_THRESHOLD = 60;
export function attemptPercent(a: { score: number; max_score: number }): number {
  if (!a.max_score || !Number.isFinite(a.max_score)) return 0;
  return Math.round((a.score / a.max_score) * 100);
}
export function filterFailed<T extends { score: number; max_score: number }>(
  attempts: T[],
): T[] {
  return attempts.filter((a) => attemptPercent(a) < FAILED_PCT_THRESHOLD);
}

interface QuizAttempt { id: string; quiz_name: string; score: number; max_score: number; completed_at: string; }

function QuizHistoryWidget({ size, content }: WidgetProps<QuizHistoryContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const explicitCap = resolveMaxItems(content);
  const showScore = resolveShowScore(content);
  const onlyFailed = resolveOnlyFailed(content);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);

  const fetchAttempts = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/learn/quiz-attempts?limit=20');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { attempts?: QuizAttempt[] } = await res.json();
      setAttempts(data.attempts ?? []);
      setStatus((data.attempts ?? []).length === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchAttempts(); }, [fetchAttempts]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>attempts</span>
        </div>
      );
    }
    return <WidgetEmpty icon="📝" title="No quiz history" description="Quiz attempts will land here." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>{attempts.length}</span>
        <span style={tinyStatLabelStyle()}>{attempts.length === 1 ? 'attempt' : 'attempts'}</span>
      </div>
    );
  }

  const sizeCap = bucket === 'small' ? 4 : bucket === 'medium' ? 6 : bucket === 'large' ? 12 : 24;
  const cap = explicitCap ?? sizeCap;
  const filtered = onlyFailed ? filterFailed(attempts) : attempts;
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {filtered.slice(0, cap).map((a) => {
        const pct = attemptPercent(a);
        const color = pct >= 80 ? 'var(--theme-success)' : pct >= 60 ? 'var(--theme-warning)' : 'var(--theme-danger)';
        return (
          <li key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
            <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{a.quiz_name}</span>
            {showScore && (
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color, fontWeight: 600 }}>{pct}%</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

defineWidget<QuizHistoryContent>({
  id: 'quiz-history',
  label: 'Quiz History',
  description: 'Your recent quiz attempts + scores.',
  category: 'learning',
  iconName: 'ClipboardCheck',
  defaultSize: { w: 2, h: 1 },
  // Slice 217 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['student', 'teacher', 'admin', 'developer'],
  Widget: QuizHistoryWidget,
});

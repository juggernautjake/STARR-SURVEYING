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

// hub-widget-excellence-13 R1 — `/api/admin/learn/quiz-attempts` doesn't
// exist; the real history is `/api/admin/learn/quizzes?history=1`, whose
// `quiz_attempts` rows carry `score_percent` / `attempt_type` /
// `exam_category` / `completed_at` — NOT the `quiz_name` / `score` /
// `max_score` this widget read.
interface RawQuizAttempt {
  id: string;
  attempt_type?: string | null;
  exam_category?: string | null;
  score_percent?: number | null;
  completed_at?: string | null;
}

/** Human label for a quiz attempt from its type/category. Pure +
 *  exported. */
export function quizLabel(attemptType?: string | null, examCategory?: string | null): string {
  const cat = examCategory?.trim();
  if (cat) return `${cat} exam`;
  if (attemptType === 'exam_prep') return 'Exam-prep quiz';
  return 'Lesson quiz';
}

/** Map a raw quiz_attempts row to the widget's shape. `score_percent`
 *  is modeled as score/100 so the existing `attemptPercent` helper
 *  returns the percentage unchanged. Pure + exported. */
export function toQuizAttempt(r: RawQuizAttempt): QuizAttempt {
  const pct = typeof r.score_percent === 'number' && Number.isFinite(r.score_percent)
    ? Math.max(0, Math.min(100, Math.round(r.score_percent)))
    : 0;
  return {
    id: r.id,
    quiz_name: quizLabel(r.attempt_type, r.exam_category),
    score: pct,
    max_score: 100,
    completed_at: r.completed_at ?? '',
  };
}

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
      const res = await fetch('/api/admin/learn/quizzes?history=1&limit=20');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { attempts?: RawQuizAttempt[] } = await res.json();
      const mapped = (data.attempts ?? []).map(toQuizAttempt);
      setAttempts(mapped);
      setStatus(mapped.length === 0 ? 'empty' : 'ok');
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
      <div style={tinyStatWrapStyle()} data-testid="quiz-history-tiny">
        <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>{attempts.length}</span>
        <span style={tinyStatLabelStyle()}>{attempts.length === 1 ? 'attempt' : 'attempts'}</span>
      </div>
    );
  }

  const sizeCap = bucket === 'small' ? 4 : bucket === 'medium' ? 6 : bucket === 'large' ? 12 : 24;
  const cap = explicitCap ?? sizeCap;
  const filtered = onlyFailed ? filterFailed(attempts) : attempts;
  // Slice S5 — at medium+ surface an aggregate average + pass/fail
  // chip strip computed from ALL attempts (not the bucket cap).
  // At large+ render a small score trend sparkline above the list.
  const showStats = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';
  const showSparkline = bucket === 'large' || bucket === 'xlarge';
  const stats = summarizeAttempts(attempts);
  return (
    <div
      data-testid={`quiz-history-${bucket}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, height: '100%' }}
    >
      {showStats && (
        <ul
          data-testid="quiz-history-stats-chips"
          aria-label="Quiz stats"
          style={chipStripStyle}
        >
          <li style={{ ...chipStyle, color: tintForPct(stats.avgPct) }}>
            <strong>{stats.avgPct}%</strong>&nbsp;avg
          </li>
          <li style={{ ...chipStyle, color: 'var(--theme-success)' }}>
            <strong>{stats.passed}</strong>&nbsp;passed
          </li>
          <li style={{ ...chipStyle, color: 'var(--theme-danger)' }}>
            <strong>{stats.failed}</strong>&nbsp;failed
          </li>
        </ul>
      )}
      {showSparkline && stats.sparkline.length >= 2 && (
        <ScoreSparkline points={stats.sparkline} />
      )}

      <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
        {filtered.slice(0, cap).map((a) => {
          const pct = attemptPercent(a);
          const color = tintForPct(pct);
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
    </div>
  );
}

function ScoreSparkline({ points }: { points: number[] }) {
  // Reverse so the oldest attempt is on the left, newest on the right.
  const series = [...points].reverse();
  const w = 100; // viewBox units
  const h = 28;
  const max = 100;
  const stepX = series.length > 1 ? w / (series.length - 1) : 0;
  const path = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(1)} ${(h - (p / max) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      data-testid="quiz-history-sparkline"
      aria-label="Score trend"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: 28 }}
    >
      <line x1="0" y1={h - (FAILED_PCT_THRESHOLD / max) * h} x2={w} y2={h - (FAILED_PCT_THRESHOLD / max) * h}
            stroke="var(--theme-border)" strokeDasharray="2,2" strokeWidth="0.5" />
      <path d={path} fill="none" stroke="var(--theme-accent)" strokeWidth="1.5" />
    </svg>
  );
}

/** Pure helper — aggregate stats over an attempt list. The sparkline
 *  is the score series from oldest → newest. Pure + exported. */
export function summarizeAttempts(
  attempts: QuizAttempt[],
): { avgPct: number; passed: number; failed: number; sparkline: number[] } {
  if (attempts.length === 0) return { avgPct: 0, passed: 0, failed: 0, sparkline: [] };
  let sum = 0;
  let passed = 0;
  let failed = 0;
  const series: number[] = [];
  for (const a of attempts) {
    const pct = attemptPercent(a);
    sum += pct;
    if (pct >= FAILED_PCT_THRESHOLD) passed += 1; else failed += 1;
    series.push(pct);
  }
  return {
    avgPct: Math.round(sum / attempts.length),
    passed,
    failed,
    // Cap at 12 points so the sparkline stays legible at the widget's
    // available width.
    sparkline: series.slice(0, 12),
  };
}

/** Tint for a quiz score percentage. Pure + exported. */
export function tintForPct(pct: number): string {
  if (pct >= 80) return 'var(--theme-success)';
  if (pct >= FAILED_PCT_THRESHOLD) return 'var(--theme-warning)';
  return 'var(--theme-danger)';
}

const chipStripStyle: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0,
  display: 'flex', flexWrap: 'wrap', gap: 6,
};
const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--theme-bg-elevated)',
  fontSize: '0.72rem',
  whiteSpace: 'nowrap',
};

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

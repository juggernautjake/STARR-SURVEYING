'use client';
// Slice 144 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 212 of hub-grid-8x8-square-cells-2026-05-29.md — adopt the
// shared stat-bucket helpers so the streak reads cleanly at every
// size from 1×1 through 4×4.
// Slice S1 of widget-size-responsive-content-2026-06-18.md — add
// per-bucket growth:
//   tiny    — current streak + emoji
//   small   — + label + "current of goal" line
//   medium  — + goal-progress bar
//   large   — + milestone strip (pip per day toward the goal)
//   xlarge  — same as large
//   Longest carries through at medium+ (was previously gated on
//   `bucket !== 'small'` only).

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

// Slice 14 of employee-hub-overhaul-2026-05-30.md — content honors the
// Slice-12 schema fields:
//   - kind: which streak the widget counts (clockin / study / quiz).
//     Surfaces as the emoji + label.
//   - goal: target day count. Shown as "N of GOAL days" progress and
//     swaps the emoji to 🏆 once the surveyor hits or exceeds it.
export type StreakKind = 'clockin' | 'study' | 'quiz';
export interface StreakCounterContent extends Record<string, unknown> {
  kind?: StreakKind;
  goal?: number;
}
const DEFAULTS: StreakCounterContent = { kind: 'study', goal: 7 };

interface StreakInfo { current_days: number; longest_days: number; }

interface KindMeta { emoji: string; label: string; }
const KIND_META: Record<StreakKind, KindMeta> = {
  clockin: { emoji: '⏰', label: 'Clock-in streak' },
  study:   { emoji: '🔥', label: 'Study streak'    },
  quiz:    { emoji: '🎯', label: 'Quiz streak'     },
};

function resolveKind(content: StreakCounterContent): StreakKind {
  const k = content.kind;
  return k === 'clockin' || k === 'study' || k === 'quiz' ? k : 'study';
}

function resolveGoal(content: StreakCounterContent): number {
  const g = content.goal;
  return typeof g === 'number' && Number.isFinite(g) && g > 0 ? Math.floor(g) : 7;
}

function StreakCounterWidget({ size, content }: WidgetProps<StreakCounterContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const kind = resolveKind(content);
  const goal = resolveGoal(content);
  const meta = KIND_META[kind];
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [info, setInfo] = useState<StreakInfo | null>(null);

  const fetchInfo = useCallback(async () => {
    setStatus('loading');
    try {
      // hub-widget-excellence-13 R1 — pass the chosen kind so the
      // (newly-built) streak endpoint counts the right activity.
      const res = await fetch(`/api/admin/learn/streak?kind=${kind}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: StreakInfo = await res.json();
      setInfo(data);
      setStatus('ok');
    } catch { setStatus('empty'); }
  }, [kind]);
  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  if (status === 'loading') return <WidgetSkeleton rows={2} />;
  if (status === 'empty' || !info) {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0{meta.emoji}</span>
          <span style={tinyStatLabelStyle()}>days</span>
        </div>
      );
    }
    return <WidgetEmpty icon={meta.emoji} title="Start your streak" description={`Complete a ${kind === 'quiz' ? 'quiz' : kind === 'clockin' ? 'shift' : 'lesson'} today to begin your streak.`} />;
  }

  const reachedGoal = info.current_days >= goal;
  const liveEmoji = reachedGoal ? '🏆' : meta.emoji;

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()} data-testid="streak-counter-tiny">
        <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>{info.current_days}{liveEmoji}</span>
        <span style={tinyStatLabelStyle()}>{info.current_days === 1 ? 'day' : 'days'}</span>
      </div>
    );
  }

  // Slice 16 — at 'small' bucket (typically 2×1 / 1×2) the Slice-14
  // additions (kind label + progress + Longest line) compete for two
  // text rows that the size genuinely doesn't have. Skip the
  // "Longest:" line; medium+ keeps it for the full breakdown.
  // Slice S1 — also gate the goal-progress bar (medium+) + the
  // milestone-pips strip (large+) here.
  const showLongest = bucket !== 'small';
  const showGoalBar = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';
  const showMilestoneStrip = bucket === 'large' || bucket === 'xlarge';
  const goalPctValue = streakGoalPct(info.current_days, goal);
  const pipCount = Math.max(1, Math.min(14, goal));
  return (
    <div
      data-testid={`streak-counter-${bucket}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, height: '100%' }}
    >
      <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>
        {liveEmoji} {info.current_days} day{info.current_days === 1 ? '' : 's'}
      </span>
      <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
        {meta.label} · {info.current_days} of {goal} day{goal === 1 ? '' : 's'}
      </span>
      {showGoalBar && (
        <div
          role="progressbar"
          aria-valuenow={Math.round(goalPctValue)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${Math.round(goalPctValue)}% of streak goal`}
          data-testid="streak-counter-goal-bar"
          style={goalTrackStyle}
        >
          <div
            style={{
              width: `${goalPctValue}%`,
              height: '100%',
              borderRadius: 999,
              background: reachedGoal ? 'var(--theme-success)' : 'var(--theme-warning)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}
      {showLongest && (
        <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
          Longest: {info.longest_days} days
        </span>
      )}
      {showMilestoneStrip && (
        <ul
          data-testid="streak-counter-milestones"
          aria-label="Milestones"
          style={milestoneStripStyle}
        >
          {Array.from({ length: pipCount }).map((_, i) => {
            const filled = i < info.current_days;
            return (
              <li
                key={i}
                aria-label={`Day ${i + 1}${filled ? ' completed' : ''}`}
                style={{
                  width: 10, height: 10,
                  borderRadius: '50%',
                  background: filled
                    ? (reachedGoal ? 'var(--theme-success)' : 'var(--theme-warning)')
                    : 'var(--theme-bg-elevated)',
                  border: '1px solid var(--theme-border)',
                  flex: '0 0 auto',
                }}
              />
            );
          })}
          {info.current_days > pipCount && (
            <li
              aria-hidden
              style={{ fontSize: '0.7rem', color: 'var(--theme-fg-secondary)', alignSelf: 'center', marginLeft: 4 }}
            >
              +{info.current_days - pipCount}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

const goalTrackStyle: React.CSSProperties = {
  width: '100%',
  height: 6,
  borderRadius: 999,
  background: 'var(--theme-bg-elevated)',
  overflow: 'hidden',
  flexShrink: 0,
};

const milestoneStripStyle: React.CSSProperties = {
  listStyle: 'none', margin: '4px 0 0', padding: 0,
  display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap',
};

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

// Slice 14 — test-only export so the per-widget content render spec
// can verify the resolver functions without rendering the React tree
// (the SSR snapshot-caching limitation blocks store-mutation specs).
export { resolveKind, resolveGoal, KIND_META };

// Slice S1 — pure helpers for the goal-progress + milestone strip.

/** Percent of the streak goal reached, clamped 0–100. Pure + exported. */
export function streakGoalPct(currentDays: number, goal: number): number {
  if (!Number.isFinite(goal) || goal <= 0) return 0;
  return Math.max(0, Math.min(100, (currentDays / goal) * 100));
}

/** Pick a layout variant per bucket. Pure + exported. */
export function streakLayoutForBucket(bucket: SizeBucket): 'tiny' | 'compact' | 'progress' | 'milestones' {
  if (bucket === 'tiny') return 'tiny';
  if (bucket === 'small') return 'compact';
  if (bucket === 'medium') return 'progress';
  return 'milestones';
}

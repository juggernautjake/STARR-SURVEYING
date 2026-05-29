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

export interface QuizHistoryContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: QuizHistoryContent = {};

interface QuizAttempt { id: string; quiz_name: string; score: number; max_score: number; completed_at: string; }

function QuizHistoryWidget({ size }: WidgetProps<QuizHistoryContent>) {
  const bucket = sizeBucket(size.w, size.h);
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

  const cap = bucket === 'small' ? 4 : bucket === 'medium' ? 6 : bucket === 'large' ? 12 : 24;
  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
      {attempts.slice(0, cap).map((a) => {
        const pct = Math.round((a.score / a.max_score) * 100);
        const color = pct >= 80 ? 'var(--theme-success)' : pct >= 60 ? 'var(--theme-warning)' : 'var(--theme-danger)';
        return (
          <li key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' }}>
            <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{a.quiz_name}</span>
            <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color, fontWeight: 600 }}>{pct}%</span>
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

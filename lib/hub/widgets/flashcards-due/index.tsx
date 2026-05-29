'use client';
// Slice 133 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export interface FlashcardsDueContent extends Record<string, unknown> { /* none */ }
const DEFAULTS: FlashcardsDueContent = {};

interface FlashcardsSummary { count: number; next_review_at?: string | null; }

function FlashcardsDueWidget({ size }: WidgetProps<FlashcardsDueContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [data, setData] = useState<FlashcardsSummary | null>(null);

  const fetchSummary = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/learn/flashcards?due=true&summary=1');
      if (!res.ok) { setStatus('empty'); return; }
      const j: FlashcardsSummary = await res.json();
      setData(j);
      setStatus(j.count === 0 ? 'empty' : 'ok');
    } catch { setStatus('empty'); }
  }, []);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  if (status === 'loading') return <WidgetSkeleton rows={2} />;
  if (status === 'empty') return <WidgetEmpty icon="🃏" title="No flashcards due" description="Cards return when their review timer fires." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 'var(--hub-font-2xl, 1.5rem)', fontWeight: 700, color: 'var(--theme-warning)' }}>{data?.count}</span>
      <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>cards ready for review</span>
      {bucket !== 'tiny' && (
        <Link href="/admin/learn/flashcards" style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-accent)', fontWeight: 600 }}>
          Start review →
        </Link>
      )}
    </div>
  );
}

defineWidget<FlashcardsDueContent>({
  id: 'flashcards-due',
  label: 'Flashcards Due',
  description: 'Spaced-repetition cards ready for review.',
  category: 'learning',
  iconName: 'BookOpen',
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 1 },
  maxSize: { w: 6, h: 3 },
  defaultContent: DEFAULTS,
  allowedRoles: ['student', 'admin', 'developer'],
  Widget: FlashcardsDueWidget,
});

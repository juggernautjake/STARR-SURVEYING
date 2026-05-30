'use client';
// Slice 133 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

// Slice 15b — wired to the Slice-12 schema fields:
//   - maxCards:   surfaced as the upper limit on the "X cards ready"
//                 count display (1–25). Pre-overhaul the widget showed
//                 the raw count from the backend; the cap stops a huge
//                 backlog from blowing up the layout.
//   - hideEmpty:  when true + the queue is empty, collapse the body to
//                 a quiet 0 instead of the full empty-state card so a
//                 stretch of empty days doesn't dominate the hub.
import { resolveBool, resolveBoundedInt } from '@/lib/hub/widgets/_shared/content-resolvers';

export interface FlashcardsDueContent extends Record<string, unknown> {
  maxCards?: number;
  hideEmpty?: boolean;
}
const DEFAULTS: FlashcardsDueContent = { maxCards: 5, hideEmpty: false };

export const resolveMaxCards = (c: FlashcardsDueContent): number | null =>
  resolveBoundedInt(c.maxCards, 1, 25, null);
export const resolveHideEmpty = (c: FlashcardsDueContent): boolean =>
  resolveBool(c.hideEmpty, false);

/** Visible count given the raw backend count + the surveyor's cap.
 *  When `cap` is null (no override / out of range) we surface the raw
 *  count unchanged so existing dashboards stay identical. */
export function visibleCount(raw: number, cap: number | null): number {
  if (cap === null) return raw;
  return Math.min(raw, cap);
}

interface FlashcardsSummary { count: number; next_review_at?: string | null; }

function FlashcardsDueWidget({ size, content }: WidgetProps<FlashcardsDueContent>) {
  const bucket = sizeBucket(size.w, size.h);
  const cap = resolveMaxCards(content);
  const hideEmpty = resolveHideEmpty(content);
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
  if (status === 'empty') {
    if (hideEmpty) {
      // Quiet "0 cards" stat in place of the full empty-state card so
      // a stretch of empty days doesn't dominate the hub.
      return (
        <div style={tinyStatWrapStyle()} data-testid="flashcards-due-empty-quiet">
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>cards</span>
        </div>
      );
    }
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>cards</span>
        </div>
      );
    }
    return <WidgetEmpty icon="🃏" title="No flashcards due" description="Cards return when their review timer fires." />;
  }

  const rawCount = data?.count ?? 0;
  const shown = visibleCount(rawCount, cap);
  const overflow = cap !== null && rawCount > cap;

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>{overflow ? `${shown}+` : shown}</span>
        <span style={tinyStatLabelStyle()}>{shown === 1 ? 'card' : 'cards'}</span>
      </div>
    );
  }

  // Slice 16 — at 'small' bucket compact the description to one short
  // phrase so the Slice-15b "(capped at N)" suffix doesn't push the
  // "Start review →" link off-frame; the cap is already visible via
  // the "N+" stat above.
  const description = overflow
    ? (bucket === 'small' ? 'cards ready' : `cards ready (capped at ${cap})`)
    : (bucket === 'small' ? 'cards ready' : 'cards ready for review');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={statNumberStyle(bucket, 'var(--theme-warning)')}>{overflow ? `${shown}+` : shown}</span>
      <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>
        {description}
      </span>
      <Link href="/admin/learn/flashcards" style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-accent)', fontWeight: 600 }}>
        Start review →
      </Link>
    </div>
  );
}

defineWidget<FlashcardsDueContent>({
  id: 'flashcards-due',
  label: 'Flashcards Due',
  description: 'Spaced-repetition cards ready for review.',
  category: 'learning',
  iconName: 'BookOpen',
  defaultSize: { w: 2, h: 2 },
  // Slice 216 — minSize lowered to 1×1 with the tiny card-count mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 4, h: 4 },
  defaultContent: DEFAULTS,
  allowedRoles: ['student', 'admin', 'developer'],
  Widget: FlashcardsDueWidget,
});

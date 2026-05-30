// __tests__/hub/widget-config-render-pending-family.test.ts
//
// Slice 15 of employee-hub-overhaul-2026-05-30.md. Locks the per-
// widget resolver behavior + the schema↔resolver agreement for the
// four widgets wired in this slice:
//   - pending-hours      (maxItems, groupByPerson)
//   - pending-receipts   (maxItems, showAmount)
//   - pending-time-off   (maxItems, showStartDate)
//   - quiz-history       (maxItems, showScore, onlyFailed)
//
// Pure-unit assertions against each widget's exported resolvers — no
// React render (SSR snapshot-caching limitation).

import { describe, it, expect } from 'vitest';
import { getWidgetOptionsEntry } from '@/lib/hub/widget-options';

import * as PendingHours       from '@/lib/hub/widgets/pending-hours';
import * as PendingReceipts    from '@/lib/hub/widgets/pending-receipts';
import * as PendingTimeOff     from '@/lib/hub/widgets/pending-time-off';
import * as QuizHistory        from '@/lib/hub/widgets/quiz-history';

// Helper: pull the schema fields keyed by their `key` for a widget.
function schemaFieldsByKey(widgetId: string): Map<string, { type: string }> {
  const entry = getWidgetOptionsEntry(widgetId);
  if (entry.source !== 'schema') return new Map();
  return new Map(entry.fields.map((f) => [f.key, { type: f.type }]));
}

describe('Slice 15 — pending-hours', () => {
  it('schema declares maxItems + groupByPerson', () => {
    const fields = schemaFieldsByKey('pending-hours');
    expect(fields.get('maxItems')?.type).toBe('number');
    expect(fields.get('groupByPerson')?.type).toBe('toggle');
  });

  it('resolveMaxItems clamps to [1, 20] then falls back to null when out of range', () => {
    expect(PendingHours.resolveMaxItems({ maxItems: 12 })).toBe(12);
    expect(PendingHours.resolveMaxItems({ maxItems: 100 })).toBe(null);
    expect(PendingHours.resolveMaxItems({})).toBe(null);
  });

  it('resolveGroupByPerson defaults to false', () => {
    expect(PendingHours.resolveGroupByPerson({ groupByPerson: true })).toBe(true);
    expect(PendingHours.resolveGroupByPerson({})).toBe(false);
  });
});

describe('Slice 15 — pending-receipts', () => {
  it('schema declares maxItems + showAmount', () => {
    const fields = schemaFieldsByKey('pending-receipts');
    expect(fields.get('maxItems')?.type).toBe('number');
    expect(fields.get('showAmount')?.type).toBe('toggle');
  });

  it('resolveShowAmount defaults to true', () => {
    expect(PendingReceipts.resolveShowAmount({ showAmount: false })).toBe(false);
    expect(PendingReceipts.resolveShowAmount({})).toBe(true);
  });
});

describe('Slice 15 — pending-time-off', () => {
  it('schema declares maxItems + showStartDate', () => {
    const fields = schemaFieldsByKey('pending-time-off');
    expect(fields.get('maxItems')?.type).toBe('number');
    expect(fields.get('showStartDate')?.type).toBe('toggle');
  });

  it('resolveShowStartDate defaults to true', () => {
    expect(PendingTimeOff.resolveShowStartDate({ showStartDate: false })).toBe(false);
    expect(PendingTimeOff.resolveShowStartDate({})).toBe(true);
  });
});

describe('Slice 15 — quiz-history', () => {
  it('schema declares maxItems + showScore + onlyFailed', () => {
    const fields = schemaFieldsByKey('quiz-history');
    expect(fields.get('maxItems')?.type).toBe('number');
    expect(fields.get('showScore')?.type).toBe('toggle');
    expect(fields.get('onlyFailed')?.type).toBe('toggle');
  });

  it('resolveMaxItems clamps to [1, 25] (matching the schema max)', () => {
    expect(QuizHistory.resolveMaxItems({ maxItems: 25 })).toBe(25);
    expect(QuizHistory.resolveMaxItems({ maxItems: 26 })).toBe(null);
  });

  it('attemptPercent rounds score / max_score', () => {
    expect(QuizHistory.attemptPercent({ score: 8, max_score: 10 })).toBe(80);
    expect(QuizHistory.attemptPercent({ score: 7, max_score: 10 })).toBe(70);
    // Divide-by-zero guard
    expect(QuizHistory.attemptPercent({ score: 5, max_score: 0 })).toBe(0);
  });

  it('filterFailed keeps only attempts below the 60% threshold', () => {
    const attempts = [
      { id: 'a', score: 9,  max_score: 10 }, // 90%
      { id: 'b', score: 6,  max_score: 10 }, // 60% — kept ONLY if strict
      { id: 'c', score: 5,  max_score: 10 }, // 50%
      { id: 'd', score: 5,  max_score: 25 }, // 20%
    ];
    const out = QuizHistory.filterFailed(attempts);
    // Threshold is `< 60` (strict), so 'b' is excluded.
    expect(out.map((a) => a.id).sort()).toEqual(['c', 'd']);
  });

  it('resolveOnlyFailed + resolveShowScore default to false / true', () => {
    expect(QuizHistory.resolveOnlyFailed({})).toBe(false);
    expect(QuizHistory.resolveOnlyFailed({ onlyFailed: true })).toBe(true);
    expect(QuizHistory.resolveShowScore({})).toBe(true);
    expect(QuizHistory.resolveShowScore({ showScore: false })).toBe(false);
  });
});

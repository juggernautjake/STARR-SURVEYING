// __tests__/hub/widget-config-render-streak-counter.test.ts
//
// Slice 14 of employee-hub-overhaul-2026-05-30.md. Locks the
// streak-counter widget's content → render wiring. The widget now
// honors `customization.content.kind` (clockin / study / quiz) +
// `goal` (target days) from the Slice-12 schema. Pure-unit tests
// against the test-only resolveKind / resolveGoal + KIND_META exports
// because the React render path hits the SSR snapshot-caching
// limitation other hub specs work around.

import { describe, it, expect } from 'vitest';
import {
  KIND_META,
  resolveGoal,
  resolveKind,
  type StreakCounterContent,
  type StreakKind,
} from '@/lib/hub/widgets/streak-counter';
import { getWidgetOptionsEntry } from '@/lib/hub/widget-options';

describe('Slice 14 — streak-counter: schema ↔ resolvers agree', () => {
  it('the schema declares the same kind options the resolver accepts', () => {
    const entry = getWidgetOptionsEntry('streak-counter');
    expect(entry.source).toBe('schema');
    if (entry.source !== 'schema') return;
    const kindField = entry.fields.find((f) => f.key === 'kind');
    expect(kindField).toBeDefined();
    if (!kindField || kindField.type !== 'select') return;
    const optionValues = kindField.options.map((o) => o.value);
    expect(optionValues).toEqual(expect.arrayContaining(['clockin', 'study', 'quiz']));
    // Every option must map to a non-empty meta entry.
    for (const v of optionValues) {
      const meta = KIND_META[v as StreakKind];
      expect(meta.emoji.length).toBeGreaterThan(0);
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });
});

describe('Slice 14 — resolveKind: known values pass through, others fall back to study', () => {
  it.each<[StreakCounterContent, StreakKind]>([
    [{ kind: 'clockin' }, 'clockin'],
    [{ kind: 'study'   }, 'study'  ],
    [{ kind: 'quiz'    }, 'quiz'   ],
    [{ kind: 'invalid' as unknown as StreakKind }, 'study'],
    [{}, 'study'],
    [{ kind: undefined }, 'study'],
  ])('content %j -> %s', (content, expected) => {
    expect(resolveKind(content)).toBe(expected);
  });
});

describe('Slice 14 — resolveGoal: positive integers pass through, else 7', () => {
  it.each<[StreakCounterContent, number]>([
    [{ goal: 14 }, 14],
    [{ goal: 1 }, 1],
    [{ goal: 365 }, 365],
    [{ goal: 0 }, 7],
    [{ goal: -3 }, 7],
    [{ goal: NaN }, 7],
    [{ goal: undefined }, 7],
    [{}, 7],
    [{ goal: 5.6 }, 5],
  ])('content %j -> %s', (content, expected) => {
    expect(resolveGoal(content)).toBe(expected);
  });
});

describe('Slice 14 — KIND_META covers every StreakKind', () => {
  it('emoji + label set for clockin / study / quiz', () => {
    const meta = KIND_META;
    expect(meta.clockin).toEqual({ emoji: '⏰', label: 'Clock-in streak' });
    expect(meta.study).toEqual({ emoji: '🔥', label: 'Study streak' });
    expect(meta.quiz).toEqual({ emoji: '🎯', label: 'Quiz streak' });
  });
});

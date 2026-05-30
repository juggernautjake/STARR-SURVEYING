// __tests__/hub/widgets/flashcards-due.test.ts
//
// hub-widget-excellence-13 — flashcards-due R1: the widget called the
// wrong endpoint param/field. Lock the corrected fetch + the
// visibleCount helper.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getWidget } from '@/lib/hub/widget-registry';
import { visibleCount } from '@/lib/hub/widgets/flashcards-due';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'lib', 'hub', 'widgets', 'flashcards-due', 'index.tsx'),
  'utf8',
);

describe('flashcards-due — registry', () => {
  it('registers in the learning category', () => {
    expect(getWidget('flashcards-due')?.category).toBe('learning');
  });
});

describe('flashcards-due R1 — uses the real ?due_count endpoint', () => {
  it('fetches ?due_count=true (not the phantom ?due=true&summary=1)', () => {
    expect(SRC).toMatch(/fetch\('\/api\/admin\/learn\/flashcards\?due_count=true'\)/);
    // No fetch still uses the old summary param (comments may mention it).
    expect(SRC).not.toMatch(/fetch\([^)]*summary=1/);
  });
  it('reads the due_count field', () => {
    expect(SRC).toMatch(/j\.due_count/);
  });
});

describe('visibleCount', () => {
  it('returns the raw count when there is no cap', () => {
    expect(visibleCount(12, null)).toBe(12);
  });
  it('caps the count when a cap is set', () => {
    expect(visibleCount(12, 5)).toBe(5);
    expect(visibleCount(3, 5)).toBe(3);
  });
});

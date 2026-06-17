// __tests__/admin/p7-hub-widget-dedupe.test.ts
//
// Slice P7 — user feedback: "whenever I am editing the hub widgets
// and attempt to resize or grab a widget for the first time, it
// duplicates the widget in the editing grid viewer."
//
// We could not pinpoint a single offending code path during review,
// but the render uses `key={inst.id}` so the ONLY way React can
// paint two divs is a duplicate id in the layout. This test locks
// down the defensive dedupe added to:
//   - dedupeWidgetsById (the new exported helper)
//   - hydrate (loads from server)
//   - enterEditMode (initializes the draft)
//   - setDraftWidgets (every drag/resize/auto-format result)
//   - addWidget (palette → grid)
//
// Behavioral coverage for `dedupeWidgetsById` + source-lock for the
// store call sites. The store itself is exercised separately by the
// existing hub-store specs; we only need to prove the helper is
// wired into every ingress.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { dedupeWidgetsById } from '../../lib/hub/hub-store';
import type { WidgetInstance } from '../../lib/hub/types';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

function widget(id: string, x = 0, y = 0): WidgetInstance {
  return { id, type: 'today-schedule', x, y, w: 2, h: 2 };
}

describe('dedupeWidgetsById (pure helper)', () => {
  it('returns the input unchanged when every id is unique', () => {
    const input = [widget('a'), widget('b'), widget('c', 4, 0)];
    const out = dedupeWidgetsById(input);
    expect(out).toEqual(input);
  });

  it('drops duplicate ids, keeping the FIRST occurrence (stale-copy wins eviction)', () => {
    const a1 = widget('a', 0, 0);
    const a2 = widget('a', 4, 4);   // same id, different position
    const b = widget('b', 6, 0);
    const out = dedupeWidgetsById([a1, b, a2]);
    expect(out.map((w) => w.id)).toEqual(['a', 'b']);
    // Keeps the first one's position — predictable for the user.
    expect(out[0]).toEqual(a1);
  });

  it('is a pure function — does not mutate the input array', () => {
    const input = [widget('a'), widget('a')];
    const lenBefore = input.length;
    dedupeWidgetsById(input);
    expect(input.length).toBe(lenBefore);
  });

  it('returns an empty array for an empty input', () => {
    expect(dedupeWidgetsById([])).toEqual([]);
  });
});

describe('hub-store — dedupe is wired into every layout-ingress path', () => {
  const SRC = read('lib/hub/hub-store.ts');

  it('exports dedupeWidgetsById from hub-store.ts', () => {
    expect(SRC).toMatch(/export function dedupeWidgetsById/);
  });

  it('hydrate wraps the normalized widgets with dedupeWidgetsById', () => {
    expect(SRC).toMatch(/widgets:\s*dedupeWidgetsById\(normalizeWidgets\(widgets\)\)/);
  });

  it('enterEditMode dedupes the cloned widgets before populating draftWidgets', () => {
    expect(SRC).toMatch(/draftWidgets:\s*dedupeWidgetsById\(cloneWidgets\(widgets\)\)/);
  });

  it('setDraftWidgets dedupes its argument before writing the draft', () => {
    expect(SRC).toMatch(/setDraftWidgets:[\s\S]*?dedupeWidgetsById\(widgets\)/);
  });

  it('addWidget guards against re-adding an existing id', () => {
    expect(SRC).toMatch(/addWidget:[\s\S]*?draftWidgets\.some\(\(w\)\s*=>\s*w\.id\s*===\s*widget\.id\)/);
  });
});

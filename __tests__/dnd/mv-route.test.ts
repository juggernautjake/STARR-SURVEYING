// __tests__/dnd/mv-route.test.ts — Area MV2b. The character system route now supports the multi-sheet
// operations: switch to a specific slot, and add a new sheet slot for a playable system. Source-anchors the
// wiring (the pure model + persistence helpers are unit-tested in system-variants.test.ts).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/system/route.ts'), 'utf8');

describe('system route — multi-sheet slot operations (MV2b)', () => {
  it('folds the persisted active-slot meta onto the live active sheet', () => {
    expect(route).toContain('readActiveSlotMeta(row.system_variants)');
    expect(route).toMatch(/kind: activeMeta\.kind/);
  });

  it('switches to a specific slot (switchToSlot) and persists the active-slot meta', () => {
    expect(route).toContain('switchToSlot(active, variants, body.slotId)');
    expect(route).toContain("kind: 'switch-slot'");
    expect(route).toContain('withActiveSlotMeta(next.variants, next.active)');
  });

  it('adds a new sheet slot for a PLAYABLE system without switching', () => {
    expect(route).toContain("body?.action === 'add'");
    expect(route).toContain('isSystemAvailable(target)'); // only playable systems buildable
    expect(route).toContain('addSheetSlot(variants,');
    expect(route).toContain("kind: 'add-sheet'");
  });

  it('every persist path carries the active-slot meta (switch/transpose too)', () => {
    // no bare `system_variants: next.variants` left — all go through withActiveSlotMeta
    expect(route).not.toMatch(/system_variants: next\.variants\b/);
    expect((route.match(/withActiveSlotMeta\(/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});

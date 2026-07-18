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

describe('SystemSwitcher UI shows every sheet + a "+" add (MV2c)', () => {
  const switcher = readFileSync(join(process.cwd(), 'app/dnd/_ui/SystemSwitcher.tsx'), 'utf8');
  const page = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');

  it('the page passes the full sheet list (listSheets) to the switcher', () => {
    expect(page).toContain('listSheets(active, variants, systemLabel)');
    expect(page).toContain('readActiveSlotMeta(rawVariants)');
    expect(page).toContain('sheets={sheets}');
  });

  it('renders each sheet as a switchable chip (by slotId) with a vanilla/custom badge', () => {
    expect(switcher).toContain('sheets.map((sh)');
    expect(switcher).toContain('switchSlot(sh.slotId)');
    expect(switcher).toMatch(/sh\.kind === 'custom' \? 'CUSTOM' : 'VANILLA'/);
    expect(switcher).toContain('● ACTIVE');
  });

  it('has a "+ Add sheet" form (system + vanilla/custom + optional name) posting action:add', () => {
    expect(switcher).toContain('＋ Add sheet');
    expect(switcher).toContain("JSON.stringify({ action: 'add', system: addSystem, kind: addKind, name: addName.trim() || undefined })");
    expect(switcher).toContain('GAME_SYSTEMS.filter((s) => isSystemAvailable(s.key))'); // only playable systems addable
  });

  it('switching a slot posts { slotId } to the system route', () => {
    expect(switcher).toContain('JSON.stringify({ slotId })');
  });
});

describe('active sheet label on the switcher (MV3)', () => {
  const switcher = readFileSync(join(process.cwd(), 'app/dnd/_ui/SystemSwitcher.tsx'), 'utf8');
  it('surfaces the active sheet kind badge + name', () => {
    expect(switcher).toContain('const activeSheet = sheets.find((s) => s.active)');
    expect(switcher).toMatch(/activeSheet\.kind === 'custom' \? 'CUSTOM' : 'VANILLA'/);
    expect(switcher).toContain('Active sheet: <strong');
  });
});

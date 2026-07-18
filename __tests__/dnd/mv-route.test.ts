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

  it('the bare-slotId SWITCH only fires without an action, so rename/delete/transpose reach their handlers', () => {
    // Regression: rename/delete/transpose also carry a slotId; without the `!body?.action` guard the switch
    // branch swallowed them (a delete just switched to the slot instead of deleting it).
    expect(route).toContain("typeof body?.slotId === 'string' && body.slotId && !body?.action");
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
    expect(switcher).toContain('sheetChipActive'); // the active chip is visually distinguished
  });

  it('has a "+ Add sheet" form (system + vanilla/custom + optional name) posting action:add', () => {
    expect(switcher).toContain('＋ Add sheet');
    expect(switcher).toContain("JSON.stringify({ action: 'add', system: addSystem, kind: addKind, name })");
    expect(switcher).toContain('const name = addName.trim() || undefined;');
    expect(switcher).toContain('GAME_SYSTEMS.filter((s) => isSystemAvailable(s.key))'); // only playable systems addable
  });

  it('the add-sheet form is a polished card with labelled fields + a segmented vanilla/custom control', () => {
    expect(switcher).toContain('styles.sheetAddCard'); // framed card, not a raw flex row
    expect(switcher).toContain('styles.sheetFieldLabel'); // fields are labelled
    expect(switcher).toContain('styles.segmented'); // segmented control, not a 2-item <select>
    expect(switcher).toContain("aria-pressed={addKind === 'vanilla'}");
    expect(switcher).toContain("aria-pressed={addKind === 'custom'}");
    expect(switcher).toContain("setAddKind('custom')");
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

describe('rename + delete sheet route/UI (Area MV)', () => {
  const route2 = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/system/route.ts'), 'utf8');
  const switcher2 = readFileSync(join(process.cwd(), 'app/dnd/_ui/SystemSwitcher.tsx'), 'utf8');
  it('the route renames (active via meta or a stored slot) and deletes a NON-active slot', () => {
    expect(route2).toContain("body?.action === 'rename'");
    expect(route2).toContain('renameVariant(variants, body.slotId, name)');
    expect(route2).toContain("body?.action === 'delete'");
    expect(route2).toContain('Switch to another sheet before deleting this one'); // can't delete the active
    expect(route2).toContain('deleteVariant(variants, body.slotId)');
  });
  it('the switcher has inline rename + a delete on non-active sheets, guarded by an in-app confirm popup', () => {
    expect(switcher2).toContain("slotAction(sh.slotId, { action: 'rename', name: editSlotName })");
    expect(switcher2).toContain('!sh.active &&'); // delete only on non-active
    // Delete opens a themed confirmation dialog (not the browser confirm), which then calls the delete action.
    expect(switcher2).toContain('setConfirmDelete({ slotId: sh.slotId, name: sh.name })');
    expect(switcher2).toMatch(/role="dialog" aria-label="Delete this sheet\?"/);
    expect(switcher2).toContain("slotAction(d.slotId, { action: 'delete' }");
    expect(switcher2).not.toContain('if (confirm('); // no raw browser confirm
  });
});

describe('transpose quality — full digest, HP safety net, custom manifest (Area MV)', () => {
  const route3 = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/system/route.ts'), 'utf8');
  const tool = readFileSync(join(process.cwd(), 'lib/dnd/sheet-edits.ts'), 'utf8');
  const switcher3 = readFileSync(join(process.cwd(), 'app/dnd/_ui/SystemSwitcher.tsx'), 'utf8');

  it('sends a RICH source digest (abilities, saves, skills, features, spells, attacks, inventory) not just names', () => {
    expect(route3).toContain('abilityMods');
    expect(route3).toContain('saveProficiencies');
    expect(route3).toContain('skillProficiencies');
    expect(route3).toMatch(/features: c\.features\.map/);
    expect(route3).toMatch(/text: \(f\.body \?\? \[\]\)\.join/); // feature RULES TEXT, not just the name
    expect(route3).toMatch(/spells: \(c\.spells \?\? \[\]\)\.map/);
  });

  it('never leaves a transposed sheet at the blank seed’s 1 HP (repairs from level + hit die)', () => {
    expect(route3).toContain('fallbackMaxHp');
    expect(route3).toContain('transposed.combat.maxHp <= 1');
    expect(route3).toContain('transposed.combat.currentHp = transposed.combat.maxHp'); // starts full
  });

  it('the AI reports invented content in a structured `custom` list, flagged on the sheet + returned', () => {
    expect(tool).toContain('custom: {'); // the edit tool exposes a custom-content array
    expect(route3).toContain('result?.input?.custom');
    expect(route3).toContain('customized: true'); // matching sheet elements are flagged customized
    expect(route3).toContain('custom: customList'); // returned to the client
  });

  it('a custom-consented transpose is thorough + balanced-for-level in the prompt', () => {
    expect(route3).toContain('HARD, thorough look at EVERYTHING');
    expect(route3).toMatch(/BALANCED against comparable vanilla/);
    expect(route3).toContain('party level');
  });

  it('the switcher lists every custom element created in the done banner', () => {
    expect(switcher3).toContain('transpose.custom');
    expect(switcher3).toContain('custom {transpose.custom.length === 1 ? \'element\' : \'elements\'} created');
  });

  it('the add card can build a NEW sheet by AI transpose (posting action:transpose), keeping existing sheets', () => {
    expect(switcher3).toContain("aria-pressed={addMethod === 'transpose'}");
    expect(switcher3).toContain("action: 'transpose', system: addSystem, allowCustom: addKind === 'custom'");
    expect(route3).toContain("const forceNewSheet = body?.action === 'transpose'");
    expect(route3).toContain('installTransposedNewSlot(active, variants, target, transposed');
  });
});

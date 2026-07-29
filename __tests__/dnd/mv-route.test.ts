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

// RE-POINTED 2026-07-29 (P4-6c), and this is the last of the SystemSwitcher debt — the component is now
// DELETED, so the "kept for one merge cycle in case QA wants it back" note above these tests is retired
// with it.
//
// These asserted the switcher's OWN markup — its chips, its add form. That component has been rendered by
// nothing since consolidation C3, so the assertions described a UI no user could reach: green tests guarding
// dead code, which is the exact condition `no-orphan-components` was written to expose.
//
// Each assertion was checked against its NEW home rather than sed-ed across, because the behaviours did not
// survive one-for-one: `VariantBrowser` makes the whole CARD the switch target rather than a chip, and
// adding a version is a FORK from an existing one (`creating`) rather than a blank "+ Add sheet" form. The
// capabilities are the same; the shapes are not, and pretending otherwise is how a re-point becomes a lie.
describe('every version is listed and switchable (MV2c, via the VERSIONS picker)', () => {
  const browser = readFileSync(join(process.cwd(), 'app/dnd/_ui/VariantBrowser.tsx'), 'utf8');
  const page = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');

  it('the page renders every version through the VERSIONS picker (which replaced the switcher)', () => {
    expect(page).toContain('readActiveSlotMeta(rawVariants)');
    // buildVariantCards is the listSheets equivalent for the picker: one card per version, active + stored.
    expect(page).toContain('buildVariantCards(');
    expect(page).toContain('cards={variantCards}');
    // And the switcher is genuinely gone from the page, not just visually hidden.
    expect(page).not.toContain('<SystemSwitcher');
  });

  it('renders one card per version, switchable by slotId, with the active one marked', () => {
    expect(browser).toContain('rows.map((c) => {');
    expect(browser).toMatch(/onClick=\{\(\) => \{ if \(!c\.active && canWrite\) switchTo\(c\.slotId\); \}\}/);
    // The active version is distinguished — the chip's job, done with an outline instead.
    expect(browser).toMatch(/outline: c\.active \?/);
  });

  it('and a new version is FORKED from an existing one rather than added blank', () => {
    // The switcher's "+ Add sheet" built an empty sheet for a chosen system. The picker instead branches
    // from a version you are looking at, which is why it carries the source's name/system/level.
    expect(browser).toContain('sourceSlotId={creating.slotId}');
    expect(browser).toContain('sourceSystem={creating.system}');
    // Only playable systems remain offerable, and the source's own system is excluded from the targets.
    expect(browser).toContain('transposeSystems.filter((s) => s.id !== creating.system)');
    expect(page).toContain('const transposeSystems = availableSystems()');
  });

  // DROPPED, not re-pointed: "the add-sheet form is a polished card with labelled fields + a segmented
  // vanilla/custom control". Every one of those assertions was about `SystemSwitcher`'s specific markup —
  // `styles.sheetAddCard`, `styles.segmented`, an `addKind` toggle — and none of it has an equivalent in
  // the picker, because the picker does not have that form. It forks from an existing version and opens the
  // editor, so there is no vanilla/custom segmented control to assert.
  //
  // Re-pointing it would have meant inventing a claim about `VariantBrowser` to keep a test name alive. The
  // capability it guarded (a version can be created, and its kind is recorded) is covered by the fork
  // assertions above and by `variant-tracker`/`transpose-custom`.

  it('switching a version posts { slotId } to the system route', () => {
    expect(browser).toContain("JSON.stringify({ slotId })");
  });
});

describe('the ACTIVE version is identifiable (MV3, via the VERSIONS picker)', () => {
  const browser = readFileSync(join(process.cwd(), 'app/dnd/_ui/VariantBrowser.tsx'), 'utf8');
  it('resolves which version is active and marks it', () => {
    // The switcher printed a text label ("Active sheet: <strong>…"); the picker instead highlights the card
    // you are on. Same fact, shown where you are already looking rather than restated in a caption.
    expect(browser).toContain('const activeCard = rows.find((c) => c.active) ?? null;');
    expect(browser).toMatch(/outline: c\.active \?/);
  });
});

describe('rename + delete sheet route/UI (Area MV)', () => {
  const route2 = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/system/route.ts'), 'utf8');
  const browser2 = readFileSync(join(process.cwd(), 'app/dnd/_ui/VariantBrowser.tsx'), 'utf8');
  it('the route renames (active via meta or a stored slot) and deletes ANY version but the original', () => {
    expect(route2).toContain("body?.action === 'rename'");
    expect(route2).toContain('renameVariant(variants, body.slotId, name)');
    expect(route2).toContain("body?.action === 'delete'");
    // Deleting the ACTIVE version used to be refused outright ("switch to another sheet first"), which is
    // what made some versions feel undeletable. `deleteSheet` now switches away and deletes in one step;
    // only the ORIGINAL is protected, and that refusal lives in the helper (see edit-flow.test.ts).
    expect(route2).toContain('deleteSheet(active, variants, body.slotId)');
    expect(route2).not.toContain('Switch to another sheet before deleting this one');
    // When the active version was deleted the live columns hold a different sheet, so they must be written.
    expect(route2).toContain('if (next.switchedTo)');
    expect(route2).toContain('update.data = next.active.data');
  });
  it('the picker has inline rename + delete, guarded by an in-app confirm dialog', () => {
    expect(browser2).toMatch(/JSON\.stringify\(\{ action: 'rename', slotId, name: next \}\)/);
    expect(browser2).toMatch(/JSON\.stringify\(\{ action: 'delete', slotId \}\)/);
    // A themed dialog, not the browser's confirm — and it NAMES the version, since a grid of similar cards
    // is exactly where "delete this one?" needs to say which one.
    expect(browser2).toContain('setConfirmDelete(');
    expect(browser2).toMatch(/role="dialog" aria-label=\{confirmDelete\.name/);
    expect(browser2).not.toContain('if (confirm('); // no raw browser confirm
  });

  it('and delete is offered on every version EXCEPT the original', () => {
    // The rule changed here, deliberately, and the old assertion (`!sh.active &&` — delete only on
    // non-active sheets) would now be WRONG: refusing to delete the version you are viewing is what made
    // some versions feel undeletable. Only the ORIGINAL is protected; deleting the viewed one switches
    // away server-side first.
    expect(browser2).toContain('const canDelete = !c.origin;');
  });
});

describe('transpose quality — full digest, HP safety net, custom manifest (Area MV)', () => {
  const route3 = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/system/route.ts'), 'utf8');
  const tool = readFileSync(join(process.cwd(), 'lib/dnd/sheet-edits.ts'), 'utf8');
  const editFlow3 = readFileSync(join(process.cwd(), 'app/dnd/_ui/EditFlow.tsx'), 'utf8');

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

  it('the report lists every custom element created, because homebrew is flagged not hidden', () => {
    // Moved to `TransposeReport` in EditFlow. It gained a clause the switcher's banner never had — "not
    // vanilla to this system" — which is the part that makes the count actionable for a DM.
    expect(editFlow3).toContain('result.custom && result.custom.length > 0');
    expect(editFlow3).toMatch(/custom \{result\.custom\.length === 1 \? 'element' : 'elements'\} created/);
    expect(editFlow3).toMatch(/flagged as customized on the sheet for DM review/);
  });

  it('and a transpose builds a NEW version rather than overwriting the current one', () => {
    // The UI half moved (the switcher's `addMethod` segmented control is gone); the ROUTE contract that
    // actually protects existing versions is unchanged and is what this test is really for.
    expect(route3).toContain("const forceNewSheet = body?.action === 'transpose'");
    expect(route3).toContain('installTransposedNewSlot(active, variants, target, transposed');
  });
});

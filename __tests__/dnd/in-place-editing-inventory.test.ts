// __tests__/dnd/in-place-editing-inventory.test.ts — what IS editable on the sheet, measured.
//
// Three items in the rules-platform doc ("the DM can edit anything", "the player can edit everything on
// their own character", and their test line) all rest on one claim: *"most fields still lack an in-place
// EDITOR (Slice 20 — the per-field ✎ edit UI, browser-deferred)"*. Measured against the code, that
// overstates the gap considerably — and the fields that genuinely are not inline-editable are that way on
// purpose, not for want of a slice.
//
// So this file replaces a vague claim with an enforced inventory. It is deliberately an INVENTORY and not a
// wish-list: if a field moves between the three groups below, someone has to say so here, which is the only
// way "what's left" stops drifting the way it has across this doc.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ABILITIES } from '@/app/dnd/_sheet/rules/dnd';

const read = (p: string) => readFileSync(join(process.cwd(), `app/dnd/_sheet/components/${p}`), 'utf8');
const ALL = ['Abilities.tsx', 'DmOverridePanel.tsx', 'StatRail.tsx', 'Hero.tsx', 'SavesSkills.tsx']
  .map(read).join('\n');

describe('GROUP 1 — numbers you can edit in place, audited by path', () => {
  it('every ability score', () => {
    // `InlineNumber` edits the BASE and displays the EFFECTIVE, so touching a score never bakes an item's
    // bonus into it. Six scores, one control.
    expect(read('Abilities.tsx')).toContain('path={`ability.${a.key}`');
    expect(ABILITIES).toHaveLength(6);
  });

  for (const path of ['combat.ac', 'combat.currentHp', 'combat.maxHp', 'combat.saveDC', 'combat.speed']) {
    it(`${path}`, () => {
      expect(ALL, `${path} should have an inline editor`).toContain(`path="${path}`);
    });
  }

  it('level', () => {
    expect(read('DmOverridePanel.tsx')).toContain('meta.level');
  });

  it('and every one of them writes to the audit log', () => {
    // THIS TEST FOUND A REAL GAP. `InlineNumber` took a `path` and used it only for temp-override
    // tracking, never for auditing. `DmOverridePanel` logged its own fields, but `Abilities` and
    // `StatRail` did not — so double-clicking your AC, HP or Strength on the sheet changed it with no
    // audit row, and it never reached the DM's review queue, while the plan doc recorded "every edit
    // audits". Now logged at the choke point, so no caller can forget.
    const inline = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/ui/InlineNumber.tsx'), 'utf8');
    expect(inline).toContain('logManualEdit(characterId, path, value, n');
  });

  it('exactly once per edit — the choke point replaced the per-caller logging, not doubled it', () => {
    // DmOverridePanel's inline fields used to log for themselves; leaving that in would file two rows for
    // one double-click.
    const dm = read('DmOverridePanel.tsx');
    expect(dm).not.toMatch(/logEdit\(`ability\.\$\{k\}`/);
    expect(dm).not.toMatch(/logEdit\(fieldPath/);
  });

  it('LEVEL still logs explicitly, because it has no path to audit by', () => {
    // Its InlineNumber is deliberately outside the temp-override system (level cascades through setLevel
    // and is always permanent), so the choke point never sees it — no path, no auto-audit.
    const dm = read('DmOverridePanel.tsx');
    expect(dm).toContain("logEdit('meta.level'");
  });
});

describe('GROUP 2 — elements with their own editor', () => {
  const editors = ['AttackEditor', 'SpellEditor', 'FeatureEditor', 'ResourceEditor', 'TraitEditor'];
  for (const e of editors) {
    it(`${e} exists and audits its diff`, () => {
      const src = readFileSync(join(process.cwd(), `app/dnd/_sheet/components/ui/${e}.tsx`), 'utf8');
      expect(src).toMatch(/logManualEdit|logManualEdits|diffFields/);
    });
  }

  it('plus the item builder, for inventory', () => {
    expect(readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/ItemBuilder.tsx'), 'utf8'))
      .toMatch(/logManualEdit|diffFields/);
  });

  it('species, through its own picker rather than free text', () => {
    expect(read('Hero.tsx')).toContain('<SpeciesPicker');
  });

  it('skill proficiency, by cycling rather than typing', () => {
    expect(read('SavesSkills.tsx')).toContain('cycleSkill(sk.key)');
  });
});

describe('BUILD changes audit; PLAY does not — and the line is drawn deliberately', () => {
  const saves = read('SavesSkills.tsx');

  it('skill proficiency audits', () => {
    // Found by the same sweep as the InlineNumber gap: a direct `setChar` reaching no element editor, so
    // clicking a proficiency dot changed the character and the DM's queue never heard. Proficiency and
    // especially EXPERTISE move every roll with that skill — squarely what a review pass looks for.
    expect(saves).toContain('logManualEdit(characterId, `skill.${key}.prof`');
  });

  it('save proficiency audits', () => {
    expect(saves).toContain('logManualEdit(characterId, `save.${key}.proficient`');
  });

  it('both read the CURRENT value before writing, so the row records a real before/after', () => {
    // Logging inside the `setChar` updater would have been the easy mistake: the old value is only
    // available outside it, and a row whose "before" equals its "after" is worse than no row.
    expect(saves).toContain('const cur = char.skills[key].prof');
    expect(saves).toContain('char.saves[key].proficient, next');
  });

  it('PLAY state stays out of the log', () => {
    // HP spent, slots used, conditions and prepared toggles are how a character is played, not how it is
    // built. Logging them would bury the build changes the queue exists to surface.
    expect(read('SpellsPanel.tsx')).not.toContain('logManualEdit');
    expect(saves).not.toMatch(/logManualEdit\([^)]*currentHp/);
  });
});

describe('GROUP 3 — deliberately NOT inline-editable, and why', () => {
  it('class and subclass are builder-owned, not text fields', () => {
    // `build.classKey` / `build.subclassKey` drive the level walker, the progression table and every
    // feature the sheet derives; `meta.className` is the display name for the same choice. The builders
    // keep the pair in step. A free-text class field would let them diverge silently, and the sheet would
    // then derive a different class's features from the one the player can see — a far worse failure than
    // having to open the builder to re-class.
    const hero = read('Hero.tsx');
    expect(hero).toContain('<EffectStar target="class"');
    expect(hero).not.toMatch(/InlineText[^>]*className|path="meta\.className"/);
  });

  it('derived numbers have no editor, because editing them would be a lie', () => {
    // Proficiency bonus, initiative and skill totals are computed from things that DO have editors. An
    // editor here would either be overwritten on the next render or silently detach the sheet from its own
    // maths. `DmOverridePanel` deliberately covers the STORED numbers only.
    const dm = read('DmOverridePanel.tsx');
    expect(dm).not.toMatch(/path="(combat\.initiative|combat\.profBonus|meta\.pb)"/);
  });
});

describe('what this measurement changes about "what is left"', () => {
  it('the core numbers a player touches most are all covered', () => {
    // The doc says "most fields still lack an in-place editor". Six abilities, AC, both HP values, save DC,
    // speed and level are the numbers a sheet actually gets edited for, and all eleven have one.
    const covered = ['ability.', 'combat.ac', 'combat.currentHp', 'combat.maxHp', 'combat.saveDC', 'combat.speed', 'meta.level'];
    for (const c of covered) expect(ALL).toContain(c);
  });
});

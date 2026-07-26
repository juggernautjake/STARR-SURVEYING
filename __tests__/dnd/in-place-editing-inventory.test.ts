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
    // Reads through `stateOf` since the skill list became system-scoped — a key the character has never
    // touched has no stored entry, and reading it directly would crash rather than log.
    expect(saves).toContain('const cur = stateOf(key).prof');
    expect(saves).toContain('char.saves[key].proficient, next');
  });

  it('PLAY state stays out of the log', () => {
    // HP spent, slots used, conditions and prepared toggles are how a character is played, not how it is
    // built. Logging them would bury the build changes the queue exists to surface.
    expect(read('SpellsPanel.tsx')).not.toContain('logManualEdit');
    expect(saves).not.toMatch(/logManualEdit\([^)]*currentHp/);
  });

  it('ADDING content audits — a feat or a spell arriving is what a DM reviews', () => {
    const featPicker = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/ui/FeatPicker.tsx'), 'utf8');
    const spellPicker = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/ui/SpellPicker.tsx'), 'utf8');
    expect(featPicker).toContain('logManualEdit(characterId, `feature.${f.name}`');
    expect(spellPicker).toContain('logManualEdit(characterId, `spell.${def.name}`');
  });

  it('items arriving, being copied, and being DELETED all audit', () => {
    // Deletion is the one that mattered most: the confirm dialog says outright that it "cannot be undone",
    // which was true precisely because nothing recorded it. The row's `old_value` is what a revert needs.
    const inv = read('Inventory.tsx');
    expect(inv).toContain('logManualEdit(characterId, `item.${item.name}`, null, item.name)');
    expect(inv).toContain('logManualEdit(characterId, `item.${gone.name}`, gone.name, null)');
    expect(inv).toContain('(copy)`, null,');
  });

  it('reads the item BEFORE the update, or there would be nothing left to name', () => {
    expect(read('Inventory.tsx')).toContain('const gone = char.inventory.find((it) => it.id === id)');
  });

  it('DELETING a feature or an attack audits — the least recoverable actions on the sheet', () => {
    // Both confirms say "cannot be undone", which was true because nothing recorded them. A feature is
    // often a whole feat or class ability, and an attack is a build element with its own maths.
    expect(read('Features.tsx')).toContain('logManualEdit(characterId, `feature.${f.name}`, f.name, null)');
    expect(read('Attacks.tsx')).toContain('logManualEdit(characterId, `attack.${a.name}`, a.name, null)');
  });

  it('and duplicating one audits as an arrival', () => {
    expect(read('Features.tsx')).toContain('(copy)`, null,');
    expect(read('Attacks.tsx')).toContain('(copy)`, null,');
  });

  it('and uses the SAME path vocabulary the element editors use', () => {
    // `feature.<name>` / `spell.<name>` are what FeatureEditor and SpellEditor write, so a gained feat and
    // a later edit to it read as the same element in the queue rather than as two unrelated things.
    const featureEditor = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/ui/FeatureEditor.tsx'), 'utf8');
    expect(featureEditor).toContain('feature.');
  });
});

// ── The work list, now empty ──────────────────────────────────────────────────────────────────────────
//
// Six defects across four slices came from one root: `log-edit.ts` calls itself "the ONE client path…
// one audit vocabulary, not a parallel path", and nothing enforced it, so call sites quietly grew their
// own behaviour while the plan doc recorded "every edit audits" as settled.
//
// This started as a list of five known gaps that asserted their own CURRENT state — so fixing one FAILED
// the test and forced the list to shrink rather than rot. It went 5 → 4 → 2 → 0. What replaces it is the
// completed picture, kept for the same reason: a new unaudited build path should fail here.
describe('every mechanical build path audits', () => {
  const MECHANICAL: [string, string][] = [
    ['Hero.tsx', 'meta.species'],       // carries size, speed, senses, traits
    ['Bio.tsx', 'meta.background'],     // 2024: carries the ability spread
    ['Features.tsx', 'feature.'],
    ['Attacks.tsx', 'attack.'],
    ['Inventory.tsx', 'item.'],
    ['SavesSkills.tsx', 'skill.'],
    // Missed in the first sweep because Resources reads as a PLAY surface. Spending a resource is play;
    // adding, copying or deleting the TRACK is a build change. The distinction is what the element is, not
    // which panel it sits in — and that mistake is exactly why this list exists as a test.
    ['Resources.tsx', 'resource.'],
  ];

  for (const [file, path] of MECHANICAL) {
    it(`${file} logs ${path}`, () => {
      // Accepts either quoting: a fixed path is a plain string ('meta.species'), an element path is a
      // template (`feature.${f.name}`). Pinning one form would fail on the other for no reason.
      expect(read(file), `${file} should audit its build changes`)
        .toMatch(new RegExp(`logManualEdit\\(characterId, [\`']${path.replace('.', '\\.')}`));
    });
  }

  it('the character NAME audits on blur, not per keystroke', () => {
    // `onChange` fires per letter, so logging there would bury the queue under "Ana / Anak / Anakin".
    // Capturing on focus and comparing on blur records the one edit the player actually made, and
    // `logManualEdit` no-ops when nothing moved — so tabbing through the field logs nothing.
    const hero = read('Hero.tsx');
    expect(hero).toContain("onFocus={() => { nameAtFocus.current = char.meta.name }}");
    expect(hero).toContain("onBlur={() => logManualEdit(characterId, 'meta.name'");
  });

  it('BACKSTORY PROSE stays out, deliberately', () => {
    // Appearance, personality, ideals, bonds and notes are typed character by character and carry no
    // mechanics. Burying a stolen feat under three hundred rows of someone writing their backstory would
    // defeat the queue rather than complete it. Only `background` — which moves ability scores — audits.
    // Anchored on the DECLARATION and read to the end of that one statement. A proximity regex on the
    // bare word `setBio` matched `setBackground`'s comment, which refers to it by name — the same
    // "grep found the prose, not the code" trap as the jump-nav and TakeAnyway guards.
    const bio = read('Bio.tsx');
    const decl = bio.indexOf('const setBio = ');
    expect(decl, 'setBio should exist').toBeGreaterThan(-1);
    expect(bio.slice(decl, bio.indexOf('\n', decl))).not.toContain('logManualEdit');
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

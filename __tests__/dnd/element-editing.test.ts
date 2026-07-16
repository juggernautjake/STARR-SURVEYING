// __tests__/dnd/element-editing.test.ts — editing attacks and items in place (Slices 20 + 27).
//
// The reported ask, three times over with screenshots: rename "Backless Park Bench", change its
// damage die, rename an item. The rows always carried the data (Attack, InvItem have every field);
// what was missing was any way IN. A feature nobody can find is a feature that doesn't exist.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ITEM_TAGS, tagInfo } from '@/app/dnd/_sheet/components/ui/tagInfo';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const MENU = read('app/dnd/_sheet/components/ui/ElementMenu.tsx');
const DIALOG = read('app/dnd/_sheet/components/ui/EditDialog.tsx');
const ATTACK_EDITOR = read('app/dnd/_sheet/components/ui/AttackEditor.tsx');
const ATTACKS = read('app/dnd/_sheet/components/Attacks.tsx');
const INVENTORY = read('app/dnd/_sheet/components/Inventory.tsx');
const CSS = read('app/dnd/_sheet/styles/theme.css');

describe('every editable row has a way in', () => {
  it('attacks and items both mount the ⋯ menu', () => {
    expect(ATTACKS).toContain('<ElementMenu');
    expect(INVENTORY).toContain('<ElementMenu');
  });

  it('the menu is gated on canWrite — a viewer sees none', () => {
    // An affordance that errors on click is worse than no affordance.
    expect(ATTACKS).toMatch(/canWrite && \(\s*<ElementMenu/);
    expect(INVENTORY).toMatch(/canWrite && \(\s*<ElementMenu/);
  });

  it('the item editor REUSES the existing ItemBuilder rather than adding a second one', () => {
    // There was already an ItemBuilder that upserts by id — it was just gated behind editMode, so
    // the editor existed and the row had no way to reach it. A second item editor would be the
    // exact drift the ledger work keeps fighting: two things editing the same data, diverging.
    expect(INVENTORY).toContain('ItemBuilder');
    expect(INVENTORY).toMatch(/setEditingId\(it\.id\)/);
    expect(INVENTORY).not.toMatch(/from '\.\/ui\/ItemEditor'/);
    // ...and it is no longer gated behind editMode.
    expect(INVENTORY).not.toMatch(/\{editMode && editingId && \(/);
  });
});

describe('features are editable too', () => {
  const FEATURES = read('app/dnd/_sheet/components/Features.tsx');
  const FEATURE_EDITOR = read('app/dnd/_sheet/components/ui/FeatureEditor.tsx');

  it('mounts the ⋯ menu, canWrite-gated', () => {
    expect(FEATURES).toContain('<ElementMenu');
    expect(FEATURES).toMatch(/canWrite && \(\s*<ElementMenu/);
  });

  it('edits name, source, unlock level, body and flavor', () => {
    for (const f of ['name', 'source', 'unlockLevel', 'body', 'flavor']) {
      expect(FEATURE_EDITOR, `${f} must be editable`).toContain(`'${f}'`);
    }
  });

  it('round-trips the paragraph array through a plain textarea', () => {
    // The model stores paragraphs as an array; people write in a textarea. Split going in, join
    // going out — lossless for anything anyone would actually type.
    expect(FEATURE_EDITOR).toMatch(/\(draft\.body \?\? \[\]\)\.join\('\\n\\n'\)/);
    expect(FEATURE_EDITOR).toMatch(/split\(\/\\n\{2,\}\/\)/);
    // Blank paragraphs would render as empty <p>s on the card.
    expect(FEATURE_EDITOR).toMatch(/\.filter\(Boolean\)/);
  });

  it('a blank name cannot erase the card heading', () => {
    expect(FEATURE_EDITOR).toMatch(/draft\.name\.trim\(\) \|\| feature\.name/);
  });
});

describe('spells are editable too (Slices 20/27/33)', () => {
  const SPELLS = read('app/dnd/_sheet/components/SpellsPanel.tsx')
  const SPELL_EDITOR = read('app/dnd/_sheet/components/ui/SpellEditor.tsx')

  it('the spell row mounts the ⋯ menu, canWrite-gated', () => {
    expect(SPELLS).toContain('<ElementMenu')
    expect(SPELLS).toMatch(/canWrite && \(\s*<ElementMenu/)
  })

  it('the editor covers name, level, school, timing, description and scaling', () => {
    for (const f of ['name', 'level', 'school', 'castTime', 'range', 'components', 'duration', 'description', 'higher']) {
      expect(SPELL_EDITOR, `${f} must be editable`).toContain(`'${f}'`)
    }
  })

  it('lets the spell resolve by save OR attack — the DC-control ask', () => {
    // Slice 33 for spells: a spell can declare a save (which ability, what happens on a success)
    // that the sheet resolves against the spell save DC.
    expect(SPELL_EDITOR).toMatch(/'attack'/)
    expect(SPELL_EDITOR).toMatch(/'save'/)
    expect(SPELL_EDITOR).toMatch(/ability: 'dex'/) // toggling save on seeds a DEX save
  })

  it('a blank name cannot erase the spell', () => {
    expect(SPELL_EDITOR).toMatch(/draft\.name\.trim\(\) \|\| spell\.name/)
  })

  it('writes through setChar', () => {
    expect(SPELL_EDITOR).toMatch(/spells: \(c\.spells \?\? \[\]\)\.map/)
  })
})

describe('resources are editable too (Slices 20/27)', () => {
  const RESOURCES = read('app/dnd/_sheet/components/Resources.tsx')
  const RESOURCE_EDITOR = read('app/dnd/_sheet/components/ui/ResourceEditor.tsx')

  it('the resource row mounts the ⋯ menu, canWrite-gated, and has an Add button', () => {
    expect(RESOURCES).toContain('<ElementMenu')
    expect(RESOURCES).toMatch(/canWrite && \(\s*<ElementMenu/)
    expect(RESOURCES).toMatch(/＋ Add resource/)
  })

  it('the editor covers name, max, resetOn, colour, unlock level and note', () => {
    for (const f of ['name', 'max', 'resetOn', 'color', 'unlockLevel', 'note']) {
      expect(RESOURCE_EDITOR, `${f} must be editable`).toContain(`'${f}'`)
    }
  })

  it('never leaves current above a reduced max (or the pip row lies)', () => {
    expect(RESOURCE_EDITOR).toMatch(/Math\.min\(draft\.current, max\)/)
  })
})

describe('the ⋯ menu behaves like a menu', () => {
  it('closes on outside click and Escape', () => {
    // A menu you can only close by picking something is a trap.
    expect(MENU).toMatch(/mousedown/);
    expect(MENU).toMatch(/Escape/);
  });

  it('does not trigger the row underneath it', () => {
    // Attack rows are click-to-roll; opening the menu must not roll an attack.
    expect(MENU).toMatch(/stopPropagation/);
  });

  it('is a real, labelled, keyboard-reachable button', () => {
    expect(MENU).toMatch(/aria-label=\{`Edit \$\{label\}`\}/);
    expect(MENU).toMatch(/aria-haspopup="menu"/);
    expect(MENU).toMatch(/role="menuitem"/);
  });
});

describe('the attack editor edits what was actually asked for', () => {
  it('covers name, damage die, type, ability, range, bonuses and notes', () => {
    for (const field of ['name', 'damage', 'damageType', 'ability', 'range', 'bonusToHit', 'bonusDamage', 'notes']) {
      expect(ATTACK_EDITOR, `${field} must be editable`).toContain(`'${field}'`);
    }
  });

  it('writes through setChar, not a private path', () => {
    // So autosave, the DM edit log and realtime propagation all come along for free.
    expect(ATTACK_EDITOR).toMatch(/setChar\(\(c\) => \(\{/);
    expect(ATTACK_EDITOR).toMatch(/attacks: c\.attacks\.map/);
  });

  it('a blank name cannot erase the row', () => {
    expect(ATTACK_EDITOR).toMatch(/draft\.name\.trim\(\) \|\| attack\.name/);
  });

  it('keeps a homebrew damage type instead of snapping it to an official one', () => {
    expect(ATTACK_EDITOR).toMatch(/!DAMAGE_TYPES\.includes\(draft\.damageType\)/);
  });

  it('says so when something else overrides the damage die', () => {
    // Otherwise you edit a field that is silently ignored on the next render.
    expect(ATTACK_EDITOR).toMatch(/usesFormStrikeDie \|\| draft\.damageByLevel/);
    expect(ATTACK_EDITOR).toMatch(/only used as a fallback/);
  });

  it('controls the save DC for save-based attacks (Slice 33)', () => {
    // The "control the hit DC for weapons and spells" ask: a save-based attack can choose which
    // ability powers its DC and set a flat override.
    const ATTACKS = read('app/dnd/_sheet/components/Attacks.tsx');
    for (const field of ['saveBased', 'saveAbility', 'aoe', 'saveDcAbility', 'saveDcOverride']) {
      expect(ATTACK_EDITOR, `${field} must be editable`).toContain(`'${field}'`);
    }
    // The row honours the per-attack override, then the chosen DC ability, then STR.
    expect(ATTACKS).toMatch(/a\.saveDcOverride \?\? \(8 \+ pb \+ abilityMod\(abilities\[a\.saveDcAbility \?\? 'str'\]\)\)/);
  });

  it('only shows the save fields when the attack is save-based', () => {
    // No point offering a save ability on a to-hit attack.
    expect(ATTACK_EDITOR).toMatch(/draft\.saveBased && \(/);
  });
});

describe('the dialog does not eat your edit', () => {
  it('a click inside does not close it', () => {
    // Dragging a text selection out of a field must not close the dialog and discard the edit.
    expect(DIALOG).toMatch(/onMouseDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  });

  it('closes on Escape and focuses its first field', () => {
    expect(DIALOG).toMatch(/Escape/);
    expect(DIALOG).toMatch(/querySelector<HTMLElement>\('input,select,textarea'\)\?\.focus\(\)/);
  });
});

describe('item tags explain themselves', () => {
  it('every tag in the union has a definition', () => {
    // Reported: "at the moment I don't know what FLAVOR means."
    for (const t of Object.keys(ITEM_TAGS)) {
      expect(tagInfo(t), `${t} needs an explanation`).toBeTruthy();
    }
  });

  it('flavor says plainly that it does nothing mechanically', () => {
    expect(tagInfo('flavor')).toMatch(/no mechanical effect/i);
  });

  it('the load-bearing tags say what they DO', () => {
    // These aren't decoration: `weapon` is what puts a thing in the Attacks table, `consumable` is
    // what makes it usable-and-gone, `equipped` is what applies its effects.
    expect(tagInfo('weapon')).toMatch(/Attacks table/i);
    expect(tagInfo('consumable')).toMatch(/Used up/i);
    expect(tagInfo('equipped')).toMatch(/effects/i);
  });

  it('an unknown/homebrew tag returns null rather than a made-up definition', () => {
    expect(tagInfo('totally-homebrew')).toBeNull();
  });

  it('the Gear list renders the tooltip and hints that one exists', () => {
    expect(INVENTORY).toContain('tagInfo(t)');
    expect(INVENTORY).toMatch(/title=\{info \?\? undefined\}/);
    // Discoverability: a tooltip nobody knows about helps nobody.
    expect(CSS).toMatch(/\.tag\.tag-info/);
    expect(CSS).toMatch(/cursor: help/);
  });
});

describe('the editor chrome is theme-token driven', () => {
  it('the dialog hardcodes no colour', () => {
    // It renders on every skin.
    const i = CSS.indexOf('.dnd-sheet .ed-dialog {');
    expect(i).toBeGreaterThan(-1);
    const block = CSS.slice(i, CSS.indexOf('}', i));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}/i);
    expect(block).toMatch(/var\(--panel\)/);
  });
});

// __tests__/dnd/grant-render-paths.test.ts — the grant targets split by HOW they render, and Rule 2
// demands the registry be honest about it:
//   · grant_feature / grant_sense — effect-rendered: a component reads ledger.explain(<target>).
//   · grant_proficiency / grant_language — effect-rendered: ledger.collected('grant_proficiency').
//   · grant_attack / grant_spell / grant_resource — a full structured object, so authored on the item's
//     grants* field (which renders while the item is active), NOT as a ref-string effect. Their help +
//     rendersAt now say so, so a builder can't emit an effect that renders nowhere.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { findTarget } from '@/lib/dnd/effects/targets';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const FEATURES = read('app/dnd/_sheet/components/Features.tsx');
const ATTACKS = read('app/dnd/_sheet/components/Attacks.tsx');
const SPELLS = read('app/dnd/_sheet/components/SpellsPanel.tsx');
const RESOURCES = read('app/dnd/_sheet/components/Resources.tsx');

describe('effect-rendered grants read the ledger at their claimed home', () => {
  it('grant_feature is surfaced via ledger.explain in the Features tab', () => {
    expect(findTarget('grant_feature')!.rendersAt).toMatch(/Features/);
    expect(FEATURES).toContain(".explain('grant_feature')");
  });
});

describe('grant_feature actually RESOLVES through the ledger (the "pendant from another class" case)', () => {
  // The render-path test above proves Features.tsx reads explain('grant_feature'); this proves the
  // ledger actually PUTS a granted feature there, sourced to the item, and takes it away on unequip —
  // the behaviour Slice 11's "a Barbarian feature granted to a Wizard, gone on unequip" test names.
  const RAGE: SheetEdit = {
    op: 'add_item',
    name: 'Pendant of Rage',
    equipped: true,
    effects: [{ target: 'grant_feature', operation: 'set', value: 'Rage (Barbarian)' }],
  } as SheetEdit;

  it('a Wizard wearing the pendant sees the Barbarian feature in explain(), sourced to the item', () => {
    const out = applySheetEdits(blankCharacter('Wizard'), [RAGE]);
    const granted = buildLedger(out).explain('grant_feature');
    expect(granted).toHaveLength(1);
    expect(granted[0].source).toBe('Pendant of Rage');
    expect(granted[0].effect.value).toBe('Rage (Barbarian)');
    expect(buildLedger(out).isModified('grant_feature')).toBe(true);
  });

  it('the grant vanishes the moment the item comes off', () => {
    let out = applySheetEdits(blankCharacter('Wizard'), [RAGE]);
    expect(buildLedger(out).explain('grant_feature')).toHaveLength(1);
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Pendant of Rage', value: false } as SheetEdit]);
    expect(buildLedger(out).explain('grant_feature')).toHaveLength(0);
  });

  it('an unworn item grants nothing (a pendant in your pack does not rage for you)', () => {
    const c = blankCharacter('Wizard');
    c.inventory = [{
      id: 'p', name: 'Pendant of Rage', desc: '', qty: 1, tags: [], equipped: false,
      effects: [{ target: 'grant_feature', operation: 'set', value: 'Rage (Barbarian)' }],
    }] as Character['inventory'];
    expect(buildLedger(c).explain('grant_feature')).toHaveLength(0);
  });
});

describe('structured grants are authored on the item field, and the help says so', () => {
  it.each([
    ['grant_attack', 'grantsAttack', ATTACKS, /Attacks/],
    ['grant_spell', 'grantsSpell', SPELLS, /Spells/],
    ['grant_resource', 'grantsResource', RESOURCES, /Resources/],
  ] as const)('%s → the item %s field, which renders', (key, field, component, homeRe) => {
    const t = findTarget(key)!;
    expect(t.rendersAt).toMatch(homeRe);
    expect(t.help).toContain(field);           // help directs authoring to the field that renders
    expect(t.rendersAt).toContain(field);      // rendersAt names the mechanism, not just the tab
    expect(component).toContain(`i.${field}`);  // the component actually reads that field
  });
});

describe('a granted row NAMES the item it came from (the doc\'s "badge naming its source")', () => {
  // The reads above prove the grants surface; this proves the ATTRIBUTION does — the doc requires each
  // granted feature/attack/spell/resource to be "badged with its source" so a player (and the DM) can see
  // that the extra attack/spell is on loan from an item, not native. Reading the field but dropping the
  // badge would leave grants unattributed yet still pass every test above; this guards the visible source.
  it('every structured-grant panel renders its `source` in a user-visible attribution', () => {
    // Attacks + Spells badge it inline ("granted · {source}"); Resources spells it out ("Granted by …").
    expect(ATTACKS).toContain('granted · {source}');
    expect(ATTACKS).toContain('title={`Granted by ${source}`}');
    expect(SPELLS).toContain('granted · {source}');
    expect(RESOURCES).toContain('Granted by <strong>{source}</strong>');
  });

  it('each granted row also carries the source in its React key, so duplicates from two items stay distinct', () => {
    // Two items granting the same-named attack must render as two rows, not collapse — the key includes source.
    expect(ATTACKS).toContain('`granted-${source}-');
    expect(SPELLS).toContain('`granted-${source}-');
    expect(RESOURCES).toContain('`granted-${source}-');
  });
});

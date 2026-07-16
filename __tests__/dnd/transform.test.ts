// __tests__/dnd/transform.test.ts — transform via an effect (Slice 18, tested core).
//
// "maybe a spell turns us into a bear… we would need to be able to end the effect and revert back."
// The tested-core-first piece: a `transform` effect on an item/spell IMPOSES a form, the ledger
// resolves it (`imposedTransform`/`ledger.transform()`), and that imposed form's own effects apply
// through the ledger — overlaying the character's base `activeFormId` WITHOUT writing it, so dropping
// the source reverts exactly (the anti-"permanent bear" guarantee). The full sheet-render of the form
// (strikeDie, form abilities, active highlight) rides on threading the effective form id into those
// components — a follow-up; this pins the resolution + the mechanical overlay.
import { describe, it, expect } from 'vitest';
import { buildLedger, imposedTransform } from '@/lib/dnd/effects/ledger';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character, CharForm } from '@/app/dnd/_sheet/types';

function druid(): Character {
  const c = blankCharacter('Keeper');
  c.abilities = { ...c.abilities, str: 10 };
  c.activeFormId = 'base';
  c.forms = [
    { id: 'base', name: 'Base', subtitle: '', cls: 'f-base', unlockLevel: 1, gating: 'held', flavor: '', bullets: [] },
    {
      id: 'bear', name: 'Brown Bear', subtitle: '', cls: 'f-bear', unlockLevel: 1, gating: 'surged', flavor: '', bullets: [],
      effects: [
        { target: 'ability_str', operation: 'set', value: 19 },
        { target: 'speed_walk', operation: 'add', value: 10 },
      ],
    },
  ] as CharForm[];
  return c;
}

// A Wild Shape potion: while worn, a transform effect imposes the bear form.
const potion: SheetEdit = {
  op: 'add_item',
  name: 'Wild Shape Focus',
  equipped: true,
  effects: [{ target: 'transform', operation: 'set', value: 'bear' }],
} as SheetEdit;

describe('a transform effect imposes a form, resolved by the ledger', () => {
  it('imposedTransform / ledger.transform() name the form and its source', () => {
    const out = applySheetEdits(druid(), [potion]);
    expect(imposedTransform(out)).toEqual({ value: 'bear', source: 'Wild Shape Focus' });
    expect(buildLedger(out).transform()).toEqual({ value: 'bear', source: 'Wild Shape Focus' });
  });

  it('the imposed form\'s OWN effects apply through the ledger (STR 19, +10 speed)', () => {
    const led = buildLedger(applySheetEdits(druid(), [potion]));
    expect(led.value('ability_str', 10)).toBe(19);
    expect(led.value('speed_walk', 30)).toBe(40);
  });

  it('the base is never written — activeFormId stays "base", STR stays 10 (anti-permanent-bear)', () => {
    const out = applySheetEdits(druid(), [potion]);
    expect(out.activeFormId).toBe('base'); // overlay, not mutation
    expect(out.abilities.str).toBe(10);
  });

  it('dropping the source reverts entirely — no bookkeeping', () => {
    let out = applySheetEdits(druid(), [potion]);
    expect(buildLedger(out).transform()).not.toBeNull();
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Wild Shape Focus', value: false } as SheetEdit]);
    expect(buildLedger(out).transform()).toBeNull();
    expect(buildLedger(out).isModified('ability_str')).toBe(false); // you are yourself again
  });

  it('with no transform effect, the character\'s own activeFormId still drives form effects', () => {
    const c = druid();
    c.activeFormId = 'bear'; // manually in bear form, no potion
    const led = buildLedger(c);
    expect(led.transform()).toBeNull();          // nothing IMPOSED it
    expect(led.value('ability_str', 10)).toBe(19); // ...but the active form still applies
  });
});

describe('the sheet renders the EFFECTIVE active form (Slice 18 render threading)', () => {
  const read = (p: string) => require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');
  it('the store exposes an effective activeFormId that overlays the base', () => {
    const store = read('app/dnd/_sheet/state/store.tsx');
    expect(store).toContain("ledger.transform()?.value ?? char.activeFormId");
    expect(store).toContain('activeFormId,'); // in the context value
  });
  it('the form-reading components use the effective id, not char.activeFormId', () => {
    for (const f of ['Attacks', 'DiceTray', 'FormAbilities', 'Forms', 'SavesSkills', 'StatRail']) {
      const src = read(`app/dnd/_sheet/components/${f}.tsx`);
      // each destructures activeFormId from useChar and no longer reads char.activeFormId directly.
      expect(src, `${f} uses effective activeFormId`).toMatch(/activeFormId[,\s}]/);
      expect(src, `${f} no longer reads char.activeFormId`).not.toContain('char.activeFormId');
    }
  });
  it('the Forms toggle still writes the BASE activeFormId (transform stays an overlay)', () => {
    expect(read('app/dnd/_sheet/components/Forms.tsx')).toContain('activeFormId: id'); // setActive writes base
  });
});

describe('carry-over policy: keepFeatures (Slice 18, Ground Rule 1)', () => {
  // A base character with a worn belt (+2 STR item) and a class feature (+1 AC), plus a form.
  function polymorpher(keepFeatures: boolean | undefined) {
    const c = blankCharacter('Druid');
    c.abilities = { ...c.abilities, str: 12 };
    c.combat = { ...c.combat, ac: 14 };
    c.inventory = [{
      id: 'belt', name: 'Belt of Might', desc: '', qty: 1, tags: [], equipped: true,
      effects: [{ target: 'ability_str', operation: 'add', value: 2 }],
    }] as Character['inventory'];
    c.features = [{
      id: 'feat', name: 'Natural Armor', source: 'Species', body: [],
      effects: [{ target: 'ac', operation: 'add', value: 1 }],
    }] as Character['features'];
    c.activeEffects = [{
      id: 'bless', label: 'Bless (from the cleric)', source: 'spell',
      effects: [{ target: 'ac', operation: 'add', value: 1 }],
    }] as Character['activeEffects'];
    c.forms = [{
      id: 'bear', name: 'Dire Bear', subtitle: '', cls: '', unlockLevel: 1, gating: 'held',
      flavor: '', bullets: [],
      effects: [{ target: 'ability_str', operation: 'set', value: 19 }],
      ...(keepFeatures === undefined ? {} : { carryOver: { keepFeatures } }),
    }] as Character['forms'];
    c.activeFormId = 'bear';
    return c;
  }

  it('default (no policy) keeps your gear + features — Wild Shape style', () => {
    const led = buildLedger(polymorpher(undefined));
    expect(led.value('ability_str', 12)).toBe(19 + 2); // form STR 19 + belt still worn
    expect(led.value('ac', 14)).toBe(14 + 1 + 1); // natural armor + bless both apply
  });

  it('keepFeatures:false drops your own gear + features, keeps externally-imposed effects', () => {
    const led = buildLedger(polymorpher(false));
    expect(led.value('ability_str', 12)).toBe(19); // form STR only — belt melded away
    expect(led.value('ac', 14)).toBe(14 + 1); // natural armor gone, Bless (cast ON you) stays
  });

  it('the polymorph is an overlay — dropping the form restores the full base', () => {
    const c = polymorpher(false);
    c.activeFormId = 'base'; // no form active
    const led = buildLedger(c);
    expect(led.value('ability_str', 12)).toBe(12 + 2); // belt back
    expect(led.value('ac', 14)).toBe(14 + 1 + 1); // feature + bless back
  });
})

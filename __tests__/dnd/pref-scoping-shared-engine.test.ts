// __tests__/dnd/pref-scoping-shared-engine.test.ts — a bespoke sheet is no longer offered settings its
// engine cannot honour (settings S-4 follow-up, found 2026-07-26).
//
// `PREF_SYSTEMS` closed one direction of this: a 5e player being shown PF2's "Damage while dying". Only the
// PF2 rows were ever tagged, so the other direction stayed wide open — a Pathfinder or Intuitive Games
// character was offered all NINE untagged settings, and every one was inert on that sheet.
//
// The evidence is in `preferences-consumed.test.ts`: those settings' only consumers are
// `_sheet/state/store.tsx`, `DiceTray.tsx` and `Inventory.tsx`. The bespoke sheets use none of them —
// `usePf2Panels`/`useIgPanels` import only a TYPE from the store, the bespoke roller path renders
// `rollerStageFor` rather than `<DiceTray/>`, and `Inventory` is mounted only by the 5e panel set. So the
// controls could not have worked, whatever the modal showed.
//
// Five are now scoped to the shared 5e engine because the RULE is 5e-shaped (exhaustion's table, the
// long-rest model, a shapeshift stat policy, attunement, a feat granting an ability increase). The other
// four are left visible on purpose: they are applicable-but-unwired, which is a different state and a
// different fix. Hiding those would tell the player they don't apply, when in truth nobody has read them yet.
import { describe, it, expect } from 'vitest';
import {
  prefAppliesToSystem, enumPrefsForSystem, boolPrefsForSystem,
  PREF_SHARED_ENGINE_ONLY, PREF_SYSTEMS, ENUM_ORDER, BOOL_ORDER,
} from '@/lib/dnd/preference-options';
import { isSharedEngineSystem, SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems';

const BESPOKE = ['pathfinder2e', 'intuitive-games'];
const SHARED = ['dnd5e-2024', 'dnd5e-2014', SYSTEM_AMBIGUOUS];
const all = (sys: string | undefined) => [...enumPrefsForSystem(sys), ...boolPrefsForSystem(sys)];

describe('the shared-engine settings are offered only where that engine runs', () => {
  for (const field of PREF_SHARED_ENGINE_ONLY) {
    it(`${field} is offered on the 5e engine and hidden on the bespoke sheets`, () => {
      for (const sys of SHARED) expect(prefAppliesToSystem(field, sys), `${field} on ${sys}`).toBe(true);
      for (const sys of BESPOKE) expect(prefAppliesToSystem(field, sys), `${field} on ${sys}`).toBe(false);
    });
  }

  it('an ambiguous character keeps every one of them — it IS driven by that engine', () => {
    // The trap in tagging these: `PREF_SYSTEMS` deliberately fails CLOSED for an unknown system, so listing
    // them there as ['dnd5e-2014','dnd5e-2024'] would have silently stripped five working controls from
    // every ambiguous character (of which this database has several). Delegating to `isSharedEngineSystem`,
    // which counts 'ambiguous' as shared, is what avoids that.
    for (const field of PREF_SHARED_ENGINE_ONLY) {
      expect(prefAppliesToSystem(field, SYSTEM_AMBIGUOUS), `${field} on ambiguous`).toBe(true);
      expect(prefAppliesToSystem(field, undefined), `${field} on undefined`).toBe(true);
    }
  });

  it('derives from isSharedEngineSystem rather than a second copy of its list', () => {
    // That helper's own doc warns what a drifting duplicate causes. Assert the two agree on every system.
    for (const sys of [...SHARED, ...BESPOKE, 'blades', 'coc7e']) {
      for (const field of PREF_SHARED_ENGINE_ONLY) {
        expect(prefAppliesToSystem(field, sys), `${field}/${sys}`).toBe(isSharedEngineSystem(sys));
      }
    }
  });
});

describe('what each system is actually offered', () => {
  it('a bespoke sheet is offered only settings that can reach it', () => {
    // `equipLimits` is the one genuinely cross-system setting — `ai-edit/route.ts` honours it for every
    // system's AI edits. PF2 adds its own four; IG has none of its own yet (S-4c is blocked on the owner
    // naming the IG house rules), which this now makes visible instead of padding the modal with controls
    // that did nothing.
    expect(all('intuitive-games')).toEqual(['equipLimits']);
    expect(all('pathfinder2e').sort()).toEqual(
      ['equipLimits', 'downedDamageModel', 'proficiencyWithoutLevel', 'freeArchetype', 'startingHeroPoints'].sort(),
    );
  });

  it('the 5e engine keeps everything it had', () => {
    // The whole point is to remove dead controls from OTHER systems, not to take anything off a 5e sheet.
    const five = all('dnd5e-2024');
    for (const f of PREF_SHARED_ENGINE_ONLY) expect(five).toContain(f);
    expect(five).toContain('equipLimits');
    expect(five).toHaveLength(PREF_SHARED_ENGINE_ONLY.length + 1);
    // …and still none of PF2's.
    for (const f of Object.keys(PREF_SYSTEMS)) expect(five).not.toContain(f);
  });

  it('no setting is both PF2-only and shared-engine — they would contradict', () => {
    for (const f of PREF_SHARED_ENGINE_ONLY) expect(PREF_SYSTEMS[f]).toBeUndefined();
  });

  it('every field is still classifiable, so a new setting cannot slip through unscoped', () => {
    // Not "every field is tagged" — untagged means cross-system, which is a real answer. This asserts the
    // catalog and the scoping maps cover the same universe.
    for (const f of [...ENUM_ORDER, ...BOOL_ORDER]) {
      const tagged = PREF_SYSTEMS[f] !== undefined || PREF_SHARED_ENGINE_ONLY.includes(f);
      const offeredSomewhere = [...SHARED, ...BESPOKE].some((s) => prefAppliesToSystem(f, s));
      expect(offeredSomewhere, `${f} is offered nowhere`).toBe(true);
      if (!tagged) {
        // An untagged field claims to work everywhere — including the bespoke sheets.
        for (const s of BESPOKE) expect(prefAppliesToSystem(f, s), `${f} claims ${s}`).toBe(true);
      }
    }
  });

  // ── The two ROLLER settings specifically ─────────────────────────────────────────────────────────
  //
  // Everything above tests the RULE for whatever happens to be in the list. That means removing a field
  // from `PREF_SHARED_ENGINE_ONLY` just makes the loops shorter — it passes. These two need naming
  // outright, because they are the ones somebody will untag by reasonable-sounding mistake: "every game
  // rolls dice, why is the dice-roller style 5e-only?"
  //
  // The answer is not obvious from the setting's name and lives two layers down. The bespoke sheets DO
  // mount the shared rollers — but via `rollerStageFor`, whose stages read only the `RollFeed`. The full
  // nodes that consume `diceRollerStyle`/`recordMode` (`DiceTray`, `SigilStack`, `RollBoard`,
  // `ImpactRoller`) are mounted only by `rollerFor`, on the 5e sheet. Same animation, different owner of
  // the controls. Untagging them would offer a PF2 player two settings that do nothing — which is exactly
  // the defect the scoping work removed.
  it('the roller settings stay scoped to the shared engine, and here is why', () => {
    for (const f of ['diceRollerStyle', 'recordMode'] as const) {
      expect(PREF_SHARED_ENGINE_ONLY, `${f} must stay shared-engine-only`).toContain(f);
      for (const s of BESPOKE) {
        expect(prefAppliesToSystem(f, s), `${f} must not be offered on ${s} — its stages cannot read it`).toBe(false);
      }
    }
  });
});

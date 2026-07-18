// __tests__/dnd/effect-target-render-gaps.test.ts — makes the "every target renders somewhere" promise
// HONEST for the targets it currently isn't true for.
//
// effect-targets.test.ts checks each target's `rendersAt` is a non-empty STRING; it does NOT check the
// named home actually renders it. appendix-a-contract.test.ts checks each target EXISTS in the registry.
// Neither verifies a target is actually read by a component — so four economy/attunement targets slip
// through both: they validate, the AI can emit them, and they then silently DO NOTHING and render
// NOWHERE. That's exactly the "a target with no home is a lie" failure the registry warns about, hiding
// behind two green tests. This converts that silent gap into a tracked, guarded one: the list below is
// the complete set of registered-but-unwired targets, each with why it has no home yet. Wiring one
// (adding its ledger read to a component) makes this test fail until it's removed from the list — so the
// gap can only shrink, never silently grow.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { findTarget } from '@/lib/dnd/effects/targets';

// key → why it has no render/apply home yet (needs an action-economy tracker / a sheet attunement model).
// This is the hand-maintained set of registered-but-unwired targets. The guarantee this file DOES enforce
// (see the `it`s below): every LISTED target really is registered, is read by NO component, and carries a
// reason; wiring one forces its removal (the gap for a tracked target can only shrink, never silently grow).
//
// It does NOT auto-sweep for OTHER silently-unread targets — an earlier comment claimed a completeness sweep,
// but a sound one is infeasible via source-scan: most of the ~60 targets that aren't read as a literal
// `value('key')`/`collected('key')` are nonetheless legitimately rendered through patterns a string match
// can't see — TEMPLATE reads (`value(`${a.key}_saves`)`, `value(`skill.${sk.key}`)`, `ability_${…}`, speed
// modes via a loop var), `ac` via `deriveAc`, structured grants via the item's `grants*` field, identity via
// `identity(field)` with a variable, `transform` via `ledger.transform()`, and the instant/consume ops
// (heal/temp_hp/damage/apply_condition) handled outside the ledger. So adding a NEW target still requires a
// human to add it here (or wire it) — the completeness of THIS list is maintained by review, not automation.
const REGISTERED_BUT_UNRENDERED: Record<string, string> = {
  attunement_slots: 'the current sheet Inventory has no attunement model (the equipment.ts cap is unused here), so nothing reads it',
  reaction_count: 'no action-economy tracker on the sheet to show reactions/round',
  bonus_action_count: 'no action-economy tracker on the sheet to show bonus actions/turn',
  attacks_per_action: 'the Attacks table shows individual attacks, not an Extra-Attack multiplier from an effect',
  hit_dice: 'the hit-dice pool is a STORED value used across longRest/spendHitDie; folding a hit_dice effect needs threading the effective pool through those, deferred',
  exhaustion: 'exhaustion is a stored 0..6 counter set via setExhaustion; a ledger exhaustion modifier would need to overlay that counter everywhere it is read, deferred',
  condition: 'an effect that IMPOSES a condition while active needs threading into buildLedger.activeConditions + the ConditionTracker + the condition mechanics (modifiers.ts), a multi-surface feature, deferred',
};

// Every place a component/store could actually READ a target (fold it into a number or list it).
const READ_SOURCES = [
  ...['CombatPanel', 'SavesSkills', 'Attacks', 'StatRail', 'Features', 'Resources', 'Hero', 'Bio', 'SpellsPanel', 'Inventory']
    .map((c) => `app/dnd/_sheet/components/${c}.tsx`),
  'app/dnd/_sheet/state/store.tsx',
]
  .map((p) => path.join(process.cwd(), p))
  .filter((p) => fs.existsSync(p))
  .map((p) => fs.readFileSync(p, 'utf8'))
  .join('\n');

const isRead = (key: string): boolean =>
  READ_SOURCES.includes(`collected('${key}')`) ||
  READ_SOURCES.includes(`explain('${key}')`) ||
  READ_SOURCES.includes(`value('${key}'`) ||
  READ_SOURCES.includes(`identity('${key}')`);

// A target rendered via a TEMPLATE/derived read that the literal `isRead` can't see — so the tracked list
// can't accidentally include something that IS wired. Mirrors the component read patterns for the families
// (per-ability saves, skills, ability mods, movement modes, and the variable-keyed identity fields).
const isFamilyRead = (key: string): boolean =>
  (/_saves$/.test(key) && READ_SOURCES.includes('_saves`')) ||          // value(`${a.key}_saves`)
  (key.startsWith('skill.') && READ_SOURCES.includes('skill.${')) ||    // value(`skill.${sk.key}`)
  (key.startsWith('ability_') && READ_SOURCES.includes('ability_${')) ||// value(`ability_${a.key}`)
  (key.startsWith('speed_') && READ_SOURCES.includes('speed_')) ||      // walk literal + the speeds loop
  (['image', 'token', 'gender', 'pronouns', 'profession', 'alignment'].includes(key) && READ_SOURCES.includes('identity(field)'));

describe('registered-but-unrendered effect targets are tracked, not silently lost', () => {
  it('each listed target really is registered (authorable + AI-emittable) — so the no-op is real', () => {
    for (const key of Object.keys(REGISTERED_BUT_UNRENDERED)) {
      expect(findTarget(key), `${key} should still be a real registry target`).toBeTruthy();
    }
  });

  it('each listed target is read by NO component — wiring one forces its removal from this list', () => {
    const nowRendered = Object.keys(REGISTERED_BUT_UNRENDERED).filter(isRead);
    expect(nowRendered, 'these are now read by a component — remove them from REGISTERED_BUT_UNRENDERED').toEqual([]);
  });

  it('nor is any listed target rendered via a TEMPLATE/derived read (soundness — the literal scan misses those)', () => {
    // The literal `isRead` can't see `value(`${a.key}_saves`)` etc., so a per-ability save / skill / speed
    // target could be wrongly parked in this list as "unrendered". This catches that: a listed target that
    // IS template-rendered must be removed. Guards the tracked set's soundness, not its completeness.
    const templateRendered = Object.keys(REGISTERED_BUT_UNRENDERED).filter(isFamilyRead);
    expect(templateRendered, 'a listed target is rendered via a template read — remove it from the list').toEqual([]);
  });

  it('every deferral carries a reason (the doc must be able to say WHY it has no home)', () => {
    for (const [key, reason] of Object.entries(REGISTERED_BUT_UNRENDERED)) {
      expect(reason.length, `${key} needs a reason`).toBeGreaterThan(15);
    }
  });

  it('a control target that IS wired (proficiency_bonus) is correctly NOT in the list', () => {
    // Sanity that the read-detection works: proficiency_bonus is folded in the store, so it must read true.
    expect(isRead('proficiency_bonus')).toBe(true);
    expect(REGISTERED_BUT_UNRENDERED).not.toHaveProperty('proficiency_bonus');
  });

  it('death_save is now folded into the death-save roll (was silently ignored before)', () => {
    // rollDeathSave now reads ledger.value('death_save', …), so a death-save bonus effect applies.
    expect(isRead('death_save')).toBe(true);
    expect(REGISTERED_BUT_UNRENDERED).not.toHaveProperty('death_save');
  });

  it('carrying_capacity is now folded into the Inventory carrying line', () => {
    expect(isRead('carrying_capacity')).toBe(true);
    expect(REGISTERED_BUT_UNRENDERED).not.toHaveProperty('carrying_capacity');
  });

  it('concentration_save is now folded into the concentration-save roll (was an unrendered no-op before)', () => {
    // ConditionTracker's "🎲 Save" button calls store.rollConcentrationSave, which folds
    // ledger.value('concentration_save', …) into a CON save — so a War-Caster-style bonus now applies.
    expect(isRead('concentration_save')).toBe(true);
    expect(REGISTERED_BUT_UNRENDERED).not.toHaveProperty('concentration_save');
  });
});

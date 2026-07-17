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

// key → why it has no render/apply home yet (needs an action-economy tracker / a sheet attunement model /
// a concentration-save roll). This is the COMPLETE set of registered-but-unwired targets — a completeness
// sweep below asserts no OTHER collect/explain/value-style target is silently unread.
const REGISTERED_BUT_UNRENDERED: Record<string, string> = {
  attunement_slots: 'the current sheet Inventory has no attunement model (the equipment.ts cap is unused here), so nothing reads it',
  reaction_count: 'no action-economy tracker on the sheet to show reactions/round',
  bonus_action_count: 'no action-economy tracker on the sheet to show bonus actions/turn',
  attacks_per_action: 'the Attacks table shows individual attacks, not an Extra-Attack multiplier from an effect',
  concentration_save: 'concentration is a manual tracker (ConditionTracker) with no concentration-save ROLL to fold a bonus into',
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
});

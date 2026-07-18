// __tests__/dnd/ig-mechanics-match-text.test.ts — ties the DERIVED IG mechanics to the VERBATIM rules
// text they came from, so the two can't silently drift.
//
// igConditionMechanic / igStanceMechanic (modifiers.ts) are a machine-readable model of what a condition
// or stance does to rolls — hand-derived from Brendan's verbatim text in IG_CONDITIONS / IG_STANCE_DEFS.
// ig-modifiers.test.ts checks those mechanics in ISOLATION (hardcoded −2, "advantage on attacks", …). So
// if the source text is ever revised (Brendan changes Shaken to −3, say) and only one side is updated, the
// sheet would DISPLAY the new text while APPLYING the old number — exactly the "mechanics must match the
// actual rules" guarantee the owner asked for, broken silently. This guard cross-checks the structural
// signals (the penalty number, the advantage/disadvantage/DR keyword) against the text of the SAME entry.
import { describe, it, expect } from 'vitest';
import { IG_CONDITIONS, IG_STANCE_DEFS } from '@/lib/dnd/systems/intuitive-games/content';
import { igConditionMechanic, igStanceMechanic } from '@/lib/dnd/systems/intuitive-games/modifiers';

// "advantage" but not the "advantage" inside "disadvantage".
const hasAdvantage = (t: string) => /(?<!dis)advantage/i.test(t);
const hasDisadvantage = (t: string) => /disadvantage/i.test(t);

describe('every IG condition mechanic is backed by its own verbatim text', () => {
  it.each(IG_CONDITIONS.map((c) => [c.name, c.effect ?? ''] as const))(
    '%s: derived flat penalty / disadvantage appear in the rules text',
    (name, text) => {
      const m = igConditionMechanic(name);
      if (!m) return; // conditions with no roll mechanic (Heatstroke etc.) carry none — nothing to tie
      if (m.flatD20 != null) {
        // The exact penalty number must be present in the text (a hyphen or en-dash before it).
        expect(new RegExp(`[-−]\\s*${Math.abs(m.flatD20)}\\b`).test(text), `${name}: text should state a ${m.flatD20} penalty`).toBe(true);
      }
      if (m.disadvantage) {
        expect(hasDisadvantage(text), `${name}: mechanic says disadvantage but the text doesn't`).toBe(true);
      }
    },
  );

  // The REVERSE guard: the check above only fires for conditions that ALREADY have a mechanic — a
  // condition whose text states a self roll-penalty but that MECHANICS silently forgot would slip through
  // (displayed by the tooltip, never applied to a roll: the "shown but not applied" gap). A general
  // reverse-disadvantage check is unsafe — Invisible's/Broken's "disadvantage" lands on the attacker/item,
  // correctly modelled as `other`, not a self-disadvantage — but the FLAT self-penalty phrasing is
  // unambiguous: "−N penalty on attack rolls" is only ever the creature's own (Shaken/Sickened). Anything
  // conditional (Heatstroke/Hypothermia say "treated as shaken", no such phrase) is correctly exempt.
  const statesSelfFlatPenalty = (t: string) => /[-−]\s*\d+\s+penalty on (all )?attack rolls/i.test(t);

  it('every condition whose TEXT states a self "−N penalty on attack rolls" actually derives that flatD20', () => {
    const missing = IG_CONDITIONS
      .filter((c) => statesSelfFlatPenalty(c.effect ?? ''))
      .filter((c) => (igConditionMechanic(c.name)?.flatD20 ?? 0) >= 0) // no negative flat penalty derived
      .map((c) => c.name);
    expect(missing, 'these conditions state a flat attack-roll penalty in their text but apply none').toEqual([]);
  });

  it('sanity: the reverse check selects exactly the flat-penalty conditions (Shaken, Sickened), not the conditional ones', () => {
    const selected = IG_CONDITIONS.filter((c) => statesSelfFlatPenalty(c.effect ?? '')).map((c) => c.name).sort();
    expect(selected).toEqual(['Shaken', 'Sickened']);
    // Heatstroke/Hypothermia reference shaken/entangled CONDITIONALLY — they must NOT be selected (and so
    // are correctly allowed to carry no mechanic), or the guard would wrongly demand a penalty they don't impose.
    expect(selected).not.toContain('Heatstroke');
    expect(selected).not.toContain('Hypothermia');
  });
});

describe('every IG stance mechanic is backed by its own verbatim text (per tier)', () => {
  it.each(IG_STANCE_DEFS.map((s) => [s.name, s.basic ?? '', s.advanced ?? ''] as const))(
    '%s: basic + advanced structural effects appear in the matching tier text',
    (name, basicText, advancedText) => {
      const basic = igStanceMechanic(name, 1); // below Lv 5 → basic tier
      const advanced = igStanceMechanic(name, 5); // Lv 5+ → advanced tier
      for (const [m, text] of [[basic, basicText], [advanced, advancedText]] as const) {
        if (!m) continue;
        if (m.advantage) expect(hasAdvantage(text), `${name} (${m.tier}): mechanic grants advantage, text doesn't say so`).toBe(true);
        if (m.disadvantage) expect(hasDisadvantage(text), `${name} (${m.tier}): mechanic imposes disadvantage, text doesn't`).toBe(true);
        if (m.damageReduction) expect(/damage reduction/i.test(text), `${name} (${m.tier}): mechanic grants DR, text doesn't`).toBe(true);
      }
    },
  );

  it('sanity: the cross-check would CATCH a drift (Offensive really does say advantage on attacks)', () => {
    const off = IG_STANCE_DEFS.find((s) => s.name === 'Offensive')!;
    expect(hasAdvantage(off.basic ?? '')).toBe(true);
    expect(hasDisadvantage(off.basic ?? '')).toBe(true); // and its disadvantage on Reflex saves
  });
});

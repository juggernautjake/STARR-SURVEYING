// __tests__/dnd/condition-annotate.test.ts — conditions explained where they are mentioned.
//
// Owner, 2026-07-30: *"whenever there is a condition mentioned … a tooltip will give him the information
// about that condition … if a spell makes enemies sick 1, then it should say exactly what sickness 1
// does, and same for sickness 2."*
//
// The two failure modes worth pinning are both quiet: a name matched inside a longer word (so a tooltip
// appears on something that is not a condition), and a tooltip answered from the WRONG SYSTEM (so a
// reader acts on a rule their game does not have).
import { describe, it, expect } from 'vitest';
import {
  annotateConditions, conditionGlossaryFor, conditionTooltip, isMatch,
} from '@/lib/dnd/conditions/annotate';

const matches = (text: string, system: string) => annotateConditions(text, system).filter(isMatch);
const plain = (text: string, system: string) => annotateConditions(text, system).map((s) => s.text).join('');

describe('finding conditions in prose', () => {
  it('finds one and leaves the sentence intact', () => {
    const text = 'The target must succeed on a save or be Blinded until the end of its next turn.';
    expect(matches(text, 'dnd5e-2014').map((m) => m.text)).toEqual(['Blinded']);
    // Round-trip: the segments must reassemble into exactly the input, or the renderer silently drops
    // or duplicates words in the middle of a rules sentence.
    expect(plain(text, 'dnd5e-2014')).toBe(text);
  });

  it('is case-insensitive but keeps the author’s capitalisation', () => {
    expect(matches('the creature is blinded', 'dnd5e-2014')[0].text).toBe('blinded');
  });

  it('does NOT fire inside a longer word', () => {
    // "Blindedness" is not the Blinded condition, and a tooltip on it would be a small lie in the middle
    // of a sentence a DM is reading aloud.
    expect(matches('It suffers from blindedness.', 'dnd5e-2014')).toHaveLength(0);
    expect(matches('The proneness of the cliff.', 'dnd5e-2014')).toHaveLength(0);
  });

  it('reassembles to the original text no matter how many matches', () => {
    const text = 'Blinded, Deafened and Frightened creatures are Prone.';
    expect(plain(text, 'dnd5e-2014')).toBe(text);
    expect(matches(text, 'dnd5e-2014')).toHaveLength(4);
  });
});

describe('valued conditions — the part the owner asked for by name', () => {
  it('captures the number and explains THAT value', () => {
    const [m] = matches('The target becomes Sickened 2.', 'pathfinder2e');
    expect(m.text).toBe('Sickened 2');
    expect(m.value).toBe(2);
    expect(conditionTooltip(m)).toMatch(/Sickened 2/);
    expect(conditionTooltip(m)).toMatch(/penalty of −2/);
  });

  it('reads sickened 1 and sickened 2 differently', () => {
    const one = conditionTooltip(matches('sickened 1', 'pathfinder2e')[0]);
    const two = conditionTooltip(matches('sickened 2', 'pathfinder2e')[0]);
    expect(one).not.toBe(two);
    expect(one).toMatch(/−1/);
    expect(two).toMatch(/−2/);
  });

  it('does not eat a number that is not a value', () => {
    // 5e's Blinded takes no value, so "Blinded 3 creatures" is a count. Swallowing the 3 would both
    // mis-explain the rule and remove a number from the sentence.
    const [m] = matches('Blinded 3 creatures stumble.', 'dnd5e-2014');
    expect(m.text).toBe('Blinded');
    expect(m.value).toBeUndefined();
    expect(plain('Blinded 3 creatures stumble.', 'dnd5e-2014')).toBe('Blinded 3 creatures stumble.');
  });

  it('reads a two-digit value as one number', () => {
    expect(matches('sickened 12', 'pathfinder2e')[0].value).toBe(12);
  });
});

describe('a tooltip never answers from another system’s rules', () => {
  it('explains Frightened differently per system', () => {
    // The whole reason this is system-scoped. PF2's Frightened is a status penalty to everything; 5e's is
    // disadvantage while the source is in sight. Answering with the wrong one is worse than silence,
    // because a reader would act on it.
    const pf2 = conditionTooltip(matches('Frightened 1', 'pathfinder2e')[0]);
    const dnd = conditionTooltip(matches('Frightened', 'dnd5e-2014')[0]);
    expect(pf2).not.toBe(dnd);
    expect(pf2).toMatch(/status penalty/i);
    expect(dnd).toMatch(/line of sight/i);
  });

  it('finds nothing for a system with no condition data rather than borrowing', () => {
    expect(annotateConditions('The target is Blinded.', 'blades')).toEqual([{ text: 'The target is Blinded.' }]);
    expect(annotateConditions('The target is Blinded.', null)).toEqual([{ text: 'The target is Blinded.' }]);
  });

  it('covers Intuitive Games from its own published conditions', () => {
    const g = conditionGlossaryFor('intuitive-games');
    expect(g.length).toBeGreaterThan(10);
    const [m] = matches('The creature is Entangled.', 'intuitive-games');
    expect(m.info.note).toMatch(/cannot move|can not move/i);
  });
});

describe('edge cases that would show up as broken text', () => {
  it('handles empty and condition-free prose', () => {
    expect(annotateConditions('', 'dnd5e-2014')).toEqual([]);
    expect(annotateConditions('It bites.', 'dnd5e-2014')).toEqual([{ text: 'It bites.' }]);
  });

  it('handles a hyphenated condition name', () => {
    // `Off-Guard` — the regex has to escape the hyphen, and the longest-first ordering has to try it
    // before any shorter name.
    expect(matches('The target is Off-Guard.', 'pathfinder2e').map((m) => m.text)).toEqual(['Off-Guard']);
  });

  it('handles a condition at the very start and very end', () => {
    expect(plain('Prone', 'dnd5e-2014')).toBe('Prone');
    expect(matches('Prone', 'dnd5e-2014')).toHaveLength(1);
  });
});

// __tests__/dnd/provenance.test.ts — custom-vs-vanilla flagging is deterministic and correct
// (IG builder Slice 2). A real system element → vanilla; an invented one → custom; a DM grant → dm-granted.
import { describe, it, expect } from 'vitest';
import { classifyElement, tagElement, summarizeProvenance, summarizeCharacterProvenance, extractCharacterElements, IG_KINDS } from '@/lib/dnd/provenance';
import { IG_BACKGROUNDS, igContentSummary, type IGContentKind } from '@/lib/dnd/systems/intuitive-games/content';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

describe('provenance classifier (Slice 2)', () => {
  it('flags real Intuitive Games content as vanilla and invented content as custom', () => {
    expect(classifyElement('intuitive-games', 'stance', 'Offensive')).toBe('vanilla');
    expect(classifyElement('intuitive-games', 'power', 'Mirror Image')).toBe('vanilla');
    expect(classifyElement('intuitive-games', 'weapon-type', 'Light Slashing')).toBe('vanilla');
    expect(classifyElement('intuitive-games', 'ancestry', 'Migoi')).toBe('vanilla'); // from the rules catalog
    expect(classifyElement('intuitive-games', 'class', 'Freebooter')).toBe('vanilla');
    // Invented content is custom.
    expect(classifyElement('intuitive-games', 'stance', 'Berserker Fury')).toBe('custom');
    expect(classifyElement('intuitive-games', 'power', 'Ultra Fireball')).toBe('custom');
    expect(classifyElement('intuitive-games', 'ancestry', 'Tiefling')).toBe('custom'); // not an IG ancestry
  });

  it('does not falsely flag untracked kinds (returns vanilla when it cannot prove custom)', () => {
    // 5e has no stance/power list, so those kinds can't be proven custom here.
    expect(classifyElement('dnd5e-2014', 'stance', 'Anything')).toBe('vanilla');
    // but 5e ancestry IS tracked.
    expect(classifyElement('dnd5e-2014', 'ancestry', 'Made Up Race')).toBe('custom');
    expect(classifyElement('dnd5e-2014', 'ancestry', 'Elf')).toBe('vanilla');
  });

  it('tagElement marks DM-granted when a granter is supplied, else classifies', () => {
    expect(tagElement('intuitive-games', 'feat', 'Toughness').source).toBe('vanilla');
    expect(tagElement('intuitive-games', 'feat', 'Homebrew Feat').source).toBe('custom');
    const g = tagElement('intuitive-games', 'feat', 'Homebrew Feat', { grantedBy: 'dm-user-1', mechanics: 'Once/day reroll.' });
    expect(g.source).toBe('dm-granted');
    expect(g.grantedBy).toBe('dm-user-1');
    expect(g.mechanics).toMatch(/reroll/);
  });

  it('summarizeProvenance groups elements and computes the blocking set', () => {
    const els = [
      tagElement('intuitive-games', 'stance', 'Offensive'),
      tagElement('intuitive-games', 'power', 'Ultra Fireball'),         // custom
      tagElement('intuitive-games', 'feat', 'Gift', { grantedBy: 'DM' }), // dm-granted
    ];
    const s = summarizeProvenance(els);
    expect(s.vanilla).toHaveLength(1);
    expect(s.custom).toHaveLength(1);
    expect(s.dmGranted).toHaveLength(1);
    expect(s.hasBlockingCustom).toBe(true);   // the custom power blocks a vanilla-only campaign
    // Remove the custom power → no longer blocking (dm-granted doesn't block).
    const s2 = summarizeProvenance([els[0], els[2]]);
    expect(s2.hasBlockingCustom).toBe(false);
    expect(s2.hasCustom).toBe(true);          // still has non-vanilla (the dm-granted)
  });

  it('summarizeCharacterProvenance flags a whole character and respects DM grants', () => {
    const c = blankCharacter('Kra');
    c.meta.className = 'Freebooter'; c.meta.species = 'Migoi';
    c.features = [{ name: 'Homebrew Rage', source: '', body: [] } as never];
    const s = summarizeCharacterProvenance(c, 'intuitive-games');
    expect(s.vanilla.some((e) => e.name === 'Freebooter')).toBe(true);
    expect(s.blocking.some((e) => e.name === 'Homebrew Rage')).toBe(true);
    // Now the DM grants that same homebrew feature → it moves to dm-granted and no longer blocks.
    const s2 = summarizeCharacterProvenance(c, 'intuitive-games', [{ kind: 'feat', name: 'Homebrew Rage', grantedBy: 'DM', mechanics: 'Rage rules.' }]);
    expect(s2.blocking.some((e) => e.name === 'Homebrew Rage')).toBe(false);
    expect(s2.dmGranted.some((e) => e.name === 'Homebrew Rage')).toBe(true);
    expect(s2.hasBlockingCustom).toBe(false);
  });

  it('extractCharacterElements pulls class/ancestry/weapons/features/spells', () => {
    const c = blankCharacter('X');
    c.meta.className = 'Fighter'; c.meta.species = 'Elf';
    c.attacks = [{ name: 'Longsword' } as never];
    const kinds = extractCharacterElements(c).reduce((m, e) => (m[e.kind] = (m[e.kind] ?? 0) + 1, m), {} as Record<string, number>);
    expect(kinds.class).toBe(1); expect(kinds.ancestry).toBe(1); expect(kinds.weapon).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The IG_KINDS / IGContentKind drift, found during the IG-S5 catalog audit.
//
// `background` was absent from provenance.ts's IG_KINDS while IG's own content module tracked all
// ten catalogued backgrounds and could classify them perfectly well. The shared layer never asked.
// Because an untracked kind resolves to `vanilla` — correct in general, so an unknown kind is never
// falsely flagged — the symptom was an invented background passing as official on a vanilla
// character. It produced no type error and no test failure; the gate just quietly failed open in
// the one place it is meant to fail closed.
describe('IG provenance covers every kind IG actually tracks', () => {
  it('classifies catalogued backgrounds vanilla and invented ones custom', () => {
    // The regression itself. Before the fix BOTH of these returned 'vanilla'.
    expect(classifyElement('intuitive-games', 'background', IG_BACKGROUNDS[0])).toBe('vanilla');
    expect(classifyElement('intuitive-games', 'background', 'Interdimensional Tax Auditor')).toBe('custom');
  });

  it('every catalogued background classifies vanilla — not just the first', () => {
    // A name-matching bug (casing, punctuation, a stray suffix) would show up here and not above.
    for (const name of IG_BACKGROUNDS) {
      expect(classifyElement('intuitive-games', 'background', name)).toBe('vanilla');
    }
  });

  it('IG_KINDS does not drift from IGContentKind again', () => {
    // The real guard. Rather than pinning today's list, this asserts the RELATIONSHIP: every kind
    // IG can classify must be one the shared layer routes to it. A new IGContentKind that nobody
    // wires up fails here instead of silently failing open, which is how `background` survived.
    //
    // `spell` is excluded on purpose: IG's content module carries it as an explicit ALIAS for
    // `power` (same names, same list), so routing it is redundant rather than missing.
    const igTracked = Object.keys(igContentSummary()) as IGContentKind[];
    const unrouted = igTracked.filter((k) => k !== 'spell' && !IG_KINDS.has(k as never));
    expect(unrouted).toEqual([]);
  });

  it('does NOT extend IG tracking to other systems', () => {
    // IG_KINDS is consulted ONLY for intuitive-games, and the distinction has to be tested on a
    // name IG would REJECT — asserting a catalogued IG background is vanilla on a 5e sheet proves
    // nothing, since both "5e does not track backgrounds" and "IG tracking leaked" return vanilla.
    // An invented name separates them: IG says custom, and 5e must still say vanilla because it
    // does not track this kind here. If IG's list ever leaked across, this flips to custom.
    expect(classifyElement('intuitive-games', 'background', 'Interdimensional Tax Auditor')).toBe('custom');
    expect(classifyElement('dnd5e-2024', 'background', 'Interdimensional Tax Auditor')).toBe('vanilla');
  });
});

// __tests__/dnd/pugilist-class.test.ts — the Pugilist is buildable in both editions, with every subclass.
//
// Created by Benjamin Huffman (Sterling Vermin Adventuring Co.); brought to this table by Andrew & Jacob.
// Transcribed 2026-07-27 from material the owner supplied: the complete 2014 class text and the 2024
// revision's schedule.
//
// WHAT THIS GUARDS. Before today the repo had a 2024 Pugilist with ONE subclass (Sweet Science) and no
// 2014 class at all — while `homebrew/seeds.ts` advertised the Pugilist in every system's library as a
// findable, adoptable class. Findable but not playable is the exact "authored but not wired" shape this
// codebase keeps producing, so these assertions are about REACHABILITY, not just data existing.
import { describe, it, expect } from 'vitest';
import { findClass, subclassesFor } from '@/lib/dnd/classes/registry';
import { validateClassDefinition, progressionTable } from '@/lib/dnd/classes/engine';
import { PUGILIST_2014, PUGILIST_2014_SUBCLASSES } from '@/lib/dnd/classes/pugilist';

describe('2014 — the original, with all seven Fight Clubs', () => {
  it('resolves from the registry like any other class', () => {
    const c = findClass('dnd5e-2014', 'pugilist');
    expect(c, 'a player on 2014 cannot pick a class the registry does not return').toBeTruthy();
    expect(c!.hitDie).toBe(8);
    expect(c!.subclassLabel).toBe('Fight Club');
  });

  it('is structurally valid and levels cleanly 1 → 20', () => {
    expect(validateClassDefinition(PUGILIST_2014)).toEqual([]);
    expect(progressionTable(PUGILIST_2014)).toHaveLength(20);
  });

  it('offers the seven core fight clubs PLUS Street Saint', () => {
    // Seven in the class document; Street Saint is an eighth, published separately on the author's Patreon
    // and supplied by the owner 2026-07-28. It belongs to THIS edition — its features key off Bloodied but
    // Unbowed (3) and Dig Deep (4) and it uses the 2014 3/6/11/17 ladder — so it is listed here, not only
    // under 2024.
    const names = subclassesFor('dnd5e-2014', 'pugilist').map((s) => s.name).sort();
    expect(names).toEqual([
      'Arena Royale', 'Bloodhound Bruisers', 'Dog & Hound', 'Hand of Dread',
      'Piss & Vinegar', 'Street Saint', 'The Squared Circle', 'The Sweet Science',
    ]);
  });

  it('every fight club grants features at 3rd, 6th, 11th and 17th', () => {
    // The class text states this cadence explicitly. A subclass missing a tier is a dead level for the
    // player, which is precisely what the IG Champion dropdowns were before they were filled in.
    for (const s of subclassesFor('dnd5e-2014', 'pugilist')) {
      const levels = new Set(s.features.map((f) => f.level));
      for (const tier of [3, 6, 11, 17]) {
        expect(levels.has(tier), `${s.name} has nothing at level ${tier}`).toBe(true);
      }
    }
  });

  it('Moxie is a real per-level resource, not prose', () => {
    const moxie = PUGILIST_2014.resources?.find((r) => r.id === 'moxie');
    expect(moxie).toBeTruthy();
    expect(moxie!.resetOn).toBe('short');
    // The published table: none at 1, 2 at 2nd, rising to 12 at 20th. Indexed 1–20.
    expect(moxie!.perLevel[1]).toBe(0);
    expect(moxie!.perLevel[2]).toBe(2);
    expect(moxie!.perLevel[20]).toBe(12);
  });
});

describe('2024 — the revision, with all six subclasses', () => {
  it('resolves, and is a DIFFERENT class from the 2014 one', () => {
    const c = findClass('dnd5e-2024', 'pugilist');
    expect(c).toBeTruthy();
    // The revision's d10 vs the original's d8 — the clearest single proof these are not a reskin of
    // each other. Collapsing them into one definition would hand a 2014 player the wrong hit die.
    expect(c!.hitDie).toBe(10);
    expect(findClass('dnd5e-2014', 'pugilist')!.hitDie).toBe(8);
  });

  it('offers all SIX published subclasses, not just the one that shipped', () => {
    const names = subclassesFor('dnd5e-2024', 'pugilist').map((s) => s.name).sort();
    expect(names).toEqual([
      // 2024 drops the definite article the 2014 fight-club headings carry ('Sweet Science', not 'The
      // Sweet Science') — asserted as it actually is rather than as the 2014 text names it.
      'Dog & Hound', 'Hand of Dread', 'Piss & Vinegar',
      'Street Saint', 'Sweet Science', 'The Squared Circle',
    ]);
  });

  it('Street Saint 2024 is the REVISED subclass, not the 2021 text wearing a 2024 label (P0-6)', () => {
    // Two earlier versions of this assertion were each right about the state they pinned and each wrong
    // about the world. The first required "under construction" (the subclass was named with no text). The
    // second, after the author's PDF arrived on 2026-07-28, pinned that PDF's ladder — 6:Hallowed Hands,
    // 11:Ravaged But Resolute, 17:Aura of Resilience — and a `pugilist level × 5` pool.
    //
    // That was the 2021 printing. The 2024 revision REORDERS the ladder and rebalances two features, so
    // the previous pin was asserting, confidently, that a wrong thing was right. This one pins the 2024
    // ladder and — more usefully — pins the DIFFERENCES, so a future edit that quietly re-imports the
    // 2021 text fails here rather than shipping.
    const ss = subclassesFor('dnd5e-2024', 'pugilist').find((s) => s.key === 'street-saint')!;
    expect(ss.features.map((f) => `${f.level}:${f.name}`)).toEqual([
      '3:Channel Divinity', '3:Lay on Hands', '6:Ravaged But Resolute',
      '11:Aura of Resilience', '17:Hallowed Hands',
    ]);
    expect(ss.features.every((f) => f.body.length > 80), 'every feature carries its real rules text').toBe(true);

    const cd = ss.features[0];
    expect(cd.body).toMatch(/Fists of Faith/);
    expect(cd.body).toMatch(/Grace of the Gods/);
    // The rebalance itself: radiant damage, NOT the 2021 crit range — which the 2024 line-up gave to
    // Sweet Science instead. Asserting both halves is what makes this a guard rather than a restatement.
    expect(cd.body, 'Fists of Faith deals 1d4 Radiant in 2024').toMatch(/1d4 \*\*Radiant\*\*|\*\*1d4 Radiant\*\*/);
    const sweet = subclassesFor('dnd5e-2024', 'pugilist').find((s) => s.key === 'sweet-science')!;
    expect(sweet.features[0].body, 'the 19–20 crit belongs to Sweet Science now').toMatch(/19 or 20/);

    // The pool everything else spends from. 3× in 2024, 5× in 2021 — and the 2014 entry keeps 5×, so a
    // single shared definition would make one of the two editions wrong.
    expect(ss.features[1].body).toMatch(/three times your Pugilist level/i);
    const ss2014 = PUGILIST_2014_SUBCLASSES.find((s) => s.key === 'street-saint')!;
    expect(ss2014.features.find((f) => f.name === 'Lay on Hands')!.body).toMatch(/× 5/);
  });

  it('the one figure that is still not sourced is flagged, not filled in', () => {
    // Grace of the Gods' saving-throw bonus is described only as "a pseudo Bless", which implies +1d4 —
    // and implication is not a source. Ground Rule 1 is that a missing number is left missing and said
    // so; the failure mode it prevents is a guess being quoted back as fact six months later.
    const ss = subclassesFor('dnd5e-2024', 'pugilist').find((s) => s.key === 'street-saint')!;
    const cd = ss.features[0].body;
    expect(cd, 'say it works like Bless').toMatch(/Bless/);
    expect(cd, 'do NOT state a die nobody published').not.toMatch(/\+?1d4 (?:bonus )?(?:to|on) (?:all )?saving throws/i);
  });
});

describe('attribution travels with the class', () => {
  it('the 2014 class credits its author and the pair who brought it here', () => {
    // The 2024 entry predates this work and carries the owner's original short credit, which several
    // tests pin; it is left alone rather than rewritten underneath them. Full authorship is recorded in
    // both files' headers.
    const author = findClass('dnd5e-2014', 'pugilist')!.custom?.authorName ?? '';
    expect(author).toMatch(/Benjamin Huffman/);
    expect(author).toMatch(/Andrew & Jacob/);
    expect(findClass('dnd5e-2024', 'pugilist')!.custom?.authorName).toBeTruthy();
  });

  it('and so does every 2014 fight club', () => {
    for (const s of subclassesFor('dnd5e-2014', 'pugilist')) {
      expect(s.custom?.authorName ?? '', s.name).toMatch(/Benjamin Huffman/);
    }
  });
});

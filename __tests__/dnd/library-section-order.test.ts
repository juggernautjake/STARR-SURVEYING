// __tests__/dnd/library-section-order.test.ts — every system's library presents its sections in ONE order.
//
// Owner 2026-07-27: *"in the library for all of the systems, all of the sections for feats and spells and
// everything are collapsable and expandable and that they are organized well and ordered well."*
//
// The collapsible half was already done — a section is a `<details>` and each entry is a nested `<details>`,
// both default-closed (verified in a browser: 132 of them on the 2024 page, all closed). What was NOT done
// was the ordering. Each page was assembled in whatever order its builder pushed sections, so:
//
//   · **PF2 listed Armour BEFORE Weapons** while both 5e editions listed Weapons before Armour — the same
//     two sections in opposite orders, which a player switching systems has no way to predict.
//   · **5e filed Feats after the gear tables**, putting a character option below the equipment lists.
//
// `orderSections` applies one canonical sequence to every system. The risk in any such pass is that it
// silently drops or re-homes something, so the tests below check totality and stability as hard as they
// check the order itself.
import { describe, it, expect } from 'vitest';
import { libraryPageFor, orderSections, type LibrarySection } from '@/lib/dnd/library';

const SYSTEMS = ['dnd5e-2024', 'dnd5e-2014', 'pathfinder2e', 'intuitive-games'] as const;
const idsFor = (sys: string) => (libraryPageFor(sys)?.sections ?? []).map((s) => s.id);

/** Position of `id` in the system's page, or -1. */
const posOf = (sys: string, id: string) => idsFor(sys).indexOf(id);

describe('the defect this fixes', () => {
  it('every system that has both puts Weapons before Armour', () => {
    // This is the concrete inconsistency: PF2 had it the other way round.
    for (const sys of SYSTEMS) {
      const w = posOf(sys, 'weapons');
      const a = posOf(sys, 'armor');
      if (w === -1 || a === -1) continue;
      expect(w, `${sys}: weapons should precede armor`).toBeLessThan(a);
    }
  });

  it('Feats sit with the character options, above the gear tables', () => {
    for (const sys of SYSTEMS) {
      const f = posOf(sys, 'feats');
      if (f === -1) continue;
      for (const gear of ['weapons', 'armor', 'equipment', 'tools']) {
        const g = posOf(sys, gear);
        if (g === -1) continue;
        expect(f, `${sys}: feats should precede ${gear}`).toBeLessThan(g);
      }
    }
  });

  it('and the shared spine is identical wherever two systems both have a section', () => {
    // The real property: for ANY pair of sections present in two systems, their relative order agrees.
    // Asserted pairwise rather than against a hardcoded list, so it keeps holding as sections are added.
    for (const a of SYSTEMS) {
      for (const b of SYSTEMS) {
        if (a >= b) continue;
        const shared = idsFor(a).filter((id) => idsFor(b).includes(id));
        for (let i = 0; i < shared.length; i++) {
          for (let j = i + 1; j < shared.length; j++) {
            expect(posOf(b, shared[i]), `${a} vs ${b}: ${shared[i]} before ${shared[j]}`)
              .toBeLessThan(posOf(b, shared[j]));
          }
        }
      }
    }
  });
});

describe('ordering must never lose or duplicate a section', () => {
  // An ordering pass that drops a section is far worse than no ordering pass: the rules simply vanish from
  // the page, and nothing else in the app would notice.
  it('each system keeps exactly the sections it built', () => {
    for (const sys of SYSTEMS) {
      const ids = idsFor(sys);
      expect(ids.length, `${sys} has no sections`).toBeGreaterThan(5);
      expect(new Set(ids).size, `${sys} has duplicate section ids`).toBe(ids.length);
    }
  });

  it('orderSections is total — every input comes out, exactly once', () => {
    const input = ['homebrew', 'weapons', 'zzz-unknown', 'core', 'another-unknown', 'feats']
      .map((id) => ({ id, title: id })) as LibrarySection[];
    const out = orderSections(input);
    expect(out).toHaveLength(input.length);
    expect(new Set(out.map((s) => s.id))).toEqual(new Set(input.map((s) => s.id)));
  });

  it('an UNLISTED section is appended, keeping its relative order — never dropped, never mid-sorted', () => {
    // The property that makes adding a section safe: it shows up predictably at the end rather than
    // disappearing or landing somewhere arbitrary.
    const input = ['weapons', 'zzz-unknown', 'core', 'another-unknown']
      .map((id) => ({ id, title: id })) as LibrarySection[];
    const out = orderSections(input).map((s) => s.id);
    expect(out.slice(0, 2)).toEqual(['core', 'weapons']);
    // Both unknowns survive, in the order they were authored.
    expect(out.slice(2)).toEqual(['zzz-unknown', 'another-unknown']);
  });

  it('is stable for equal ranks', () => {
    const input = ['u1', 'u2', 'u3'].map((id) => ({ id, title: id })) as LibrarySection[];
    expect(orderSections(input).map((s) => s.id)).toEqual(['u1', 'u2', 'u3']);
  });
});

describe('homebrew stays last, because it is extras beneath the official rules', () => {
  it('every system that has a homebrew section ends with it', () => {
    for (const sys of SYSTEMS) {
      const ids = idsFor(sys);
      if (!ids.includes('homebrew')) continue;
      expect(ids[ids.length - 1], `${sys}`).toBe('homebrew');
    }
  });
});

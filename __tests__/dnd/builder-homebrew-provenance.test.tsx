// __tests__/dnd/builder-homebrew-provenance.test.tsx — the VANILLA builder must mark homebrew as homebrew.
//
// Found in the final-QA walkthrough (DND_FINAL_QA_WALKTHROUGH), on the very first step of building a
// vanilla D&D 5e 2024 character: the class list offered "Pugilist" — a fully-authored but HOMEBREW class —
// rendered exactly like the twelve PHB classes, in a panel whose own copy promises "Everything offered is
// vanilla and rules-legal for the level you choose."
//
// Including Pugilist is intentional; hiding its provenance was not. Both the registry and the class file
// say, in so many words, that it is "flagged `custom` so the picker badges it" — the flag was set, carried
// as far as `classesForSystem`, and then dropped at the <option>. For subclasses it was worse: the flag was
// discarded in `dnd5eSubclassOptions`'s own mapping, so the UI could not have marked it.
//
// This is the platform's standing rule (vanilla = hard block, custom = flagged, DM-granted = marked)
// applied to the one surface that had quietly lost the "flagged" half.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dnd5eSubclassOptions } from '@/lib/dnd/statgen/builder5e';
import { classesForSystem } from '@/lib/dnd/classes/registry';
import { speciesCatalogFor } from '@/lib/dnd/species/view';
import { featEligibilityForSystem } from '@/lib/dnd/feats/eligibility';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
import Dnd5eManualBuilder from '@/app/dnd/_ui/Dnd5eManualBuilder';

describe('the 2024 class list still contains the homebrew class, flagged', () => {
  const classes = classesForSystem('dnd5e-2024');

  it('offers Pugilist AND marks it custom in the data', () => {
    const pug = classes.find((c) => /pugilist/i.test(c.name));
    expect(pug, 'Pugilist should still be offered — it is authored 1–20').toBeTruthy();
    expect(pug!.custom, 'Pugilist must carry its provenance').toBeTruthy();
    expect(pug!.custom?.authorName).toBe('Jacob');
  });

  // Thirteen since 2026-07-31: the 12 PHB classes plus the Artificer (Eberron: Forge of the Artificer).
  // The Artificer is FIRST-PARTY, so the point of this test — that only homebrew carries `custom` — holds
  // with it on the unflagged side. Flagging a published class to keep the count at 12 would have been the
  // wrong fix: it would have made the picker badge official rules as someone's homebrew.
  it('leaves the official classes unflagged', () => {
    const official = classes.filter((c) => !/pugilist/i.test(c.name));
    expect(official).toHaveLength(13);
    for (const c of official) expect(c.custom, `${c.name} must NOT be flagged custom`).toBeFalsy();
  });
});

describe('subclass options carry provenance through the mapping', () => {
  it('dnd5eSubclassOptions keeps `custom` instead of dropping it', () => {
    // It used to map to `{key, name}` only, which made it impossible for the picker to mark a homebrew
    // subclass no matter what the UI did.
    const subs = dnd5eSubclassOptions('dnd5e-2024', 'pugilist');
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.some((s) => s.custom), 'a Pugilist subclass should be flagged custom').toBe(true);
  });

  it('does not invent provenance for official subclasses', () => {
    const subs = dnd5eSubclassOptions('dnd5e-2024', 'fighter');
    expect(subs.length).toBeGreaterThan(0);
    for (const s of subs) expect(s.custom, `${s.name} must NOT be flagged custom`).toBeFalsy();
  });
});

describe('species provenance survives the view mapping too', () => {
  // Same root cause as subclasses, found on the NEXT step of the same walkthrough: `SpeciesView` had no
  // `custom` field at all, so Rangor — whose data comment also promises "flagged `custom` so the picker
  // badges it" — arrived at the dropdown indistinguishable from the ten official 2024 species.
  const list = speciesCatalogFor('dnd5e-2024');

  it('flags Rangor and leaves the official species bare', () => {
    const rangor = list.find((s) => /rangor/i.test(s.name));
    expect(rangor, 'Rangor should still be offered').toBeTruthy();
    expect(rangor!.custom?.authorName).toBe('Jacob');
    for (const s of list.filter((x) => !/rangor/i.test(x.name))) {
      expect(s.custom, `${s.name} must NOT be flagged custom`).toBeFalsy();
    }
  });

  it('does not conflate homebrew with the existing `source` field', () => {
    // `source` answers "did we resolve this from data?" — an authored homebrew species resolves fully, so
    // it is 'vanilla' by that definition. Reusing it for provenance would have marked nothing.
    const rangor = list.find((s) => /rangor/i.test(s.name))!;
    expect(rangor.source).toBe('vanilla');
    expect(rangor.custom).toBeTruthy();
  });
});

describe('the builder renders the flag', () => {
  const render = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(<Dnd5eManualBuilder system="dnd5e-2024" characterId="c1" {...props} />);

  it('labels the homebrew class in the dropdown and leaves official ones bare', () => {
    const html = render();
    expect(html).toContain('Pugilist — homebrew (Jacob)');
    expect(html).toContain('Rangor — homebrew (Jacob)');
    expect(html).not.toContain('Dragonborn — homebrew');
    // The official twelve must not pick up the suffix.
    expect(html).toMatch(/>Fighter</);
    expect(html).not.toContain('Fighter — homebrew');
  });

  it('says nothing about homebrew until a homebrew choice is actually made', () => {
    // The standing notice is for a build that IS homebrew; showing it by default would cry wolf on every
    // vanilla build.
    expect(render()).not.toContain('This build uses');
  });
});

// ── ASI/feat slot legality (walkthrough slice 3) ────────────────────────────────────────────────────
// The picker's own copy says "Only rules-legal picks are offered" and the wizard says "ineligible picks
// are greyed with the reason". Neither was true: the ONLY thing disabled was a full slot list, so a
// level-4 Fighter was offered Epic Boons (level 19+), Origin feats (those come from your background) and
// Fighting Styles (a class feature, not an ASI pick) — all fully clickable.
//
// `featEligibilityForSystem` already encoded every one of those rules. Nothing called it from the builder.
describe('the ASI/feat picker refuses what the rules refuse', () => {
  // Ability keys are LOWERCASE (`AbilityKey` in _sheet/rules/dnd) — the same type the builder feeds in.
  // Writing them uppercase here made Grappler read as "requires STR 13+" against an undefined score, which
  // is a good reminder that this context is a real typed contract, not a bag of strings.
  const ctx = (level: number) => ({ slot: 'asi' as const, level, className: 'Fighter', abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 } });

  it('blocks Epic Boons below 19 and allows them at 19', () => {
    expect(featEligibilityForSystem('dnd5e-2024', 'Boon of Truesight', ctx(4)).ok).toBe(false);
    expect(featEligibilityForSystem('dnd5e-2024', 'Boon of Truesight', ctx(18)).ok).toBe(false);
    // RAW: an ASI slot takes "an ASI or another feat you qualify for", and at 19 you qualify.
    expect(featEligibilityForSystem('dnd5e-2024', 'Boon of Truesight', ctx(19)).ok).toBe(true);
  });

  it('blocks Origin and Fighting Style feats at an ASI slot, at every level', () => {
    for (const lvl of [4, 12, 20]) {
      expect(featEligibilityForSystem('dnd5e-2024', 'Alert', ctx(lvl)).ok, `Alert @${lvl}`).toBe(false);
      expect(featEligibilityForSystem('dnd5e-2024', 'Archery', ctx(lvl)).ok, `Archery @${lvl}`).toBe(false);
    }
  });

  it('still allows General feats and the ASI itself', () => {
    expect(featEligibilityForSystem('dnd5e-2024', 'Grappler', ctx(4)).ok).toBe(true);
    expect(featEligibilityForSystem('dnd5e-2024', 'Ability Score Improvement', ctx(4)).ok).toBe(true);
  });

  it('gives a readable reason — these strings are shown to the player', () => {
    // "A Origin feat can't be taken through a Ability Score Improvement" made a correct rule look broken.
    const origin = featEligibilityForSystem('dnd5e-2024', 'Alert', ctx(4)).reason ?? '';
    expect(origin).toContain('An Origin feat');
    expect(origin).toContain('an Ability Score Improvement slot');
    expect(origin).not.toMatch(/\bA Origin\b|\ba Ability\b/);
    expect(featEligibilityForSystem('dnd5e-2024', 'Archery', ctx(4)).reason).toContain('A Fighting Style feat');
  });

  it('the builder wires the gate in, rather than only owning the copy that promises it', () => {
    const src = readFileSync(join(process.cwd(), 'app/dnd/_ui/Dnd5eManualBuilder.tsx'), 'utf8');
    expect(src).toContain('featEligibilityForSystem');
    expect(src).toMatch(/slot: 'asi'/);
    // Disabled for BOTH reasons, and the reason surfaced — not just the full-slots case as before.
    expect(src).toMatch(/const disabled = full \|\| blocked/);
    expect(src).toMatch(/title=\{why\}/);
  });
});

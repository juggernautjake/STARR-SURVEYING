// __tests__/dnd/backgrounds-2014.test.ts — the 2014 background catalog, and the ASI model it must
// NOT inherit from 2024.
//
// A one-entry catalog is an unusual thing to test, so state the point up front: the assertions here
// are not "we catalogued a lot", they are **"we catalogued exactly what our sources carry, and the
// 2024 ability model cannot reach a 2014 character"**. SRD 5.1 reproduces one background (Acolyte)
// alongside the general rules; padding the list from memory of the PHB would be presenting invented
// rules to a player as verified 2014 content. So one entry is the correct outcome, and the coverage
// object has to say so out loud.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BACKGROUNDS_2014, BACKGROUNDS_2014_STATUS, findBackground2014,
} from '@/lib/dnd/backgrounds/dnd5e-2014';
import {
  backgroundsForSystem, findBackgroundForSystem, backgroundsGrantAbilityIncreases, backgroundCoverage,
} from '@/lib/dnd/backgrounds';
import { BACKGROUNDS_2024 } from '@/lib/dnd/backgrounds/dnd5e-2024';

const D2014 = 'dnd5e-2014';
const D2024 = 'dnd5e-2024';

describe('the 2014 background catalog', () => {
  it('holds exactly what SRD 5.1 carries: the Acolyte, and says so', () => {
    expect(BACKGROUNDS_2014).toHaveLength(1);
    expect(BACKGROUNDS_2014[0].key).toBe('acolyte');
    expect(BACKGROUNDS_2014_STATUS.completeForSources).toBe(true);
    expect(BACKGROUNDS_2014_STATUS.completeForEdition).toBe(false);
    expect(BACKGROUNDS_2014_STATUS.missingCategories.length).toBeGreaterThan(0);
  });

  it('does not pad the list with the PHB backgrounds it cannot source', () => {
    // Named individually rather than counted, so a future pass "helpfully" adding Soldier from
    // memory fails loudly. Every one of these is real 2014 content — it is simply not content we
    // have any right to reproduce, and inventing it is the failure this repo keeps refusing.
    const names = BACKGROUNDS_2014.map((b) => b.name);
    for (const phbOnly of [
      'Charlatan', 'Criminal', 'Entertainer', 'Folk Hero', 'Guild Artisan', 'Hermit',
      'Noble', 'Outlander', 'Sage', 'Sailor', 'Soldier', 'Urchin',
    ]) {
      expect(names, `${phbOnly} is PHB-only — record the gap, do not invent the entry`).not.toContain(phbOnly);
    }
  });

  it('the Acolyte carries its real 2014 grants', () => {
    const acolyte = findBackground2014('acolyte')!;
    expect(acolyte.system).toBe('dnd5e-2014');
    expect(acolyte.skillProficiencies).toEqual(['insight', 'religion']);
    expect(acolyte.languages).toMatch(/two/i);
    expect(acolyte.feature.name).toBe('Shelter of the Faithful');
    expect(acolyte.equipment).toMatch(/15 gp/);
    expect(acolyte.source).toBe('SRD 5.1');
    // Resolvable by display name too, since a sheet stores free text.
    expect(findBackground2014('Acolyte')?.key).toBe('acolyte');
    expect(findBackground2014('nope')).toBeUndefined();
  });

  it('feature text respects the 320-character house limit (the copyright guard)', () => {
    for (const b of BACKGROUNDS_2014) {
      expect(b.feature.text.length, `${b.name} — paraphrase, do not transcribe`).toBeLessThanOrEqual(320);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The ability-score model — the reason the two catalogs are separate types.
// ─────────────────────────────────────────────────────────────────────────────

describe('a 2014 background grants NO ability score increases', () => {
  it('the 2014 type carries no ability field, under any name', () => {
    for (const b of BACKGROUNDS_2014) {
      const json = JSON.stringify(b).toLowerCase();
      expect(json, b.name).not.toContain('abilityscores');
      expect(json, b.name).not.toContain('abilityincrease');
      expect(json, b.name).not.toContain('originfeat');
    }
  });

  it('the dispatcher answers the model question explicitly, in both directions', () => {
    expect(backgroundsGrantAbilityIncreases(D2024)).toBe(true);
    expect(backgroundsGrantAbilityIncreases(D2014)).toBe(false);
    // Unknown systems get `false` — the safe direction, since a wrong `true` silently edits someone's
    // ability scores while a wrong `false` merely does not offer a flow.
    for (const s of ['pathfinder2e', 'intuitive-games', 'a-made-up-system', null, undefined]) {
      expect(backgroundsGrantAbilityIncreases(s), String(s)).toBe(false);
    }
  });

  it('the normalised view reports empty abilities for 2014 and real ones for 2024', () => {
    const acolyte2014 = findBackgroundForSystem(D2014, 'acolyte')!;
    expect(acolyte2014.abilityScores).toEqual([]);
    expect(acolyte2014.grantsAbilityIncreases).toBe(false);
    expect(acolyte2014.originFeat).toBeUndefined();
    expect(acolyte2014.feature?.name).toBe('Shelter of the Faithful');

    const acolyte2024 = findBackgroundForSystem(D2024, 'acolyte')!;
    expect(acolyte2024.abilityScores.length).toBe(3);
    expect(acolyte2024.grantsAbilityIncreases).toBe(true);
    expect(acolyte2024.originFeat).toBe('magic-initiate');
  });

  it('the 2024 ability-spread flow is not reachable from a 2014 sheet', () => {
    // `reconcileBackgroundIncreases` (and the validate/grants pair beside it) encode 2024's +2/+1
    // rule and take a 2024 `Background`. Firing them for a 2014 character would stack 2024's ability
    // model on top of the racial increases 2014 already gave them — a live edition bleed.
    //
    // Verified by reading the ONLY call site: every invocation in Bio.tsx sits inside the `is2024`
    // branch, so the flow cannot fire for 2014 today. This asserts that structurally rather than
    // trusting the reading, because the gate is a UI condition and UI conditions move.
    const bio = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Bio.tsx'), 'utf8');
    expect(bio).toContain("const is2024 = system === 'dnd5e-2024'");
    // The background picker and the spread controls both live behind the is2024 gate.
    expect(bio).toContain('{is2024 && (char.meta.background || canWrite) && (');
    // And the mechanical background is only resolved for a 2024 sheet in the first place.
    expect(bio).toContain('const bg = is2024 && char.meta.background ? findBackground(char.meta.background) : undefined');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The dispatcher.
// ─────────────────────────────────────────────────────────────────────────────

describe('backgroundsForSystem — the system-keyed dispatcher', () => {
  it('serves each edition its own list, and nothing to systems it does not know', () => {
    expect(backgroundsForSystem(D2014)).toHaveLength(1);
    expect(backgroundsForSystem(D2024)).toHaveLength(BACKGROUNDS_2024.length);
    for (const s of ['pathfinder2e', 'intuitive-games', 'a-made-up-system', null, undefined]) {
      expect(backgroundsForSystem(s), String(s)).toEqual([]);
    }
  });

  it('never hands one edition the other\'s entry, even for a shared name', () => {
    // "Acolyte" exists in BOTH editions with materially different grants — the ideal bleed vector,
    // because the wrong answer is well-formed and plausible.
    expect(findBackgroundForSystem(D2014, 'acolyte')!.system).toBe('dnd5e-2014');
    expect(findBackgroundForSystem(D2024, 'acolyte')!.system).toBe('dnd5e-2024');
    // A 2024-only background does not resolve on a 2014 sheet.
    expect(findBackgroundForSystem(D2014, 'soldier')).toBeUndefined();
    expect(findBackgroundForSystem(D2024, 'soldier')).toBeDefined();
  });

  it('reports coverage honestly per system', () => {
    expect(backgroundCoverage(D2014).total).toBe(1);
    expect(backgroundCoverage(D2014).completeForSources).toBe(true);
    expect(backgroundCoverage(D2014).completeForEdition).toBe(false);
    expect(backgroundCoverage(D2024).completeForEdition).toBe(true);
    expect(backgroundCoverage('a-made-up-system').total).toBe(0);
    expect(backgroundCoverage(null).completeForSources).toBe(false);
  });

  it('the Acolyte\'s editionNote names the confirmed difference rather than a vague one', () => {
    const note = BACKGROUNDS_2014[0].editionNote!;
    expect(note).toMatch(/2024/);
    // The difference that matters is the ability model, and it must be stated, not gestured at.
    expect(note).toMatch(/ability/i);
    expect(note).toMatch(/no ability increase/i);
  });
});

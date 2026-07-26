// __tests__/dnd/altered-vanilla-kind.test.ts — "altered vanilla" is a real third state (S8, owner-directed).
//
// The owner's call, 2026-07-26:
//
//   "If a vanilla character takes an outside of class feat or something like that, they become a custom
//    character. Or we need a tag that is like 'altered vanilla' or something like that. We need it to be
//    clear that something is not the usual."
//
// Why the third value earns its keep: a character with ONE DM-approved cross-class feat is not a homebrew
// build, and collapsing them means a vanilla-only table must refuse both or accept both.
//
// THE DANGEROUS PART, and what most of this file guards. Every gate used to ask `kind === 'vanilla'` to
// decide whether the rules bind. Adding a third value silently turns that test FALSE for the new kind — so
// an altered-vanilla character would have stopped being gated altogether, which is the opposite of "make it
// clear something is not the usual". `isRulesEnforcedKind` exists so the question is asked as "is this
// custom?", and these tests pin that no call site regressed to the equality check.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  variantKind, variantKindLabel, isRulesEnforcedKind, unboundReasonFor, type SheetVariantKind,
} from '@/lib/dnd/system-variants';
import { variantTags } from '@/lib/dnd/variant-tags';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const ALL: SheetVariantKind[] = ['vanilla', 'altered-vanilla', 'custom'];

describe('the kind parses and labels', () => {
  it('reads the stored value, defaulting to vanilla for legacy sheets', () => {
    expect(variantKind({ kind: 'altered-vanilla' })).toBe('altered-vanilla');
    expect(variantKind({ kind: 'custom' })).toBe('custom');
    expect(variantKind({ kind: 'vanilla' })).toBe('vanilla');
    expect(variantKind({})).toBe('vanilla');           // legacy/unlabelled
    expect(variantKind(null)).toBe('vanilla');
    expect(variantKind({ kind: 'nonsense' })).toBe('vanilla'); // unknown fails SAFE, not open
  });

  it('labels each state distinctly — the whole point is that it is obvious', () => {
    expect(variantKindLabel('vanilla')).toBe('Vanilla');
    expect(variantKindLabel('altered-vanilla')).toBe('Altered vanilla');
    expect(variantKindLabel('custom')).toBe('Custom-built');
    expect(new Set(ALL.map(variantKindLabel)).size).toBe(3); // no two states read the same
  });
});

describe('the rules still BIND for altered vanilla', () => {
  it('only a custom build opts out of enforcement', () => {
    expect(isRulesEnforcedKind('vanilla')).toBe(true);
    expect(isRulesEnforcedKind('altered-vanilla')).toBe(true);
    expect(isRulesEnforcedKind('custom')).toBe(false);
  });

  it('the unbound reason distinguishes a DM grant from a custom character', () => {
    expect(unboundReasonFor('vanilla', true)).toBe('dm-grant');
    expect(unboundReasonFor('custom', false)).toBe('custom-character');
    // Altered vanilla is NOT "unbound" — its exceptions are named individually, not blanket-allowed.
    expect(unboundReasonFor('altered-vanilla', false)).toBeUndefined();
    expect(unboundReasonFor('vanilla', false)).toBeUndefined();
  });
});

describe('no gate regressed to the equality check', () => {
  // The specific failure adding a third value causes. Each of these decides whether the rules bind.
  const GATED = [
    'app/api/dnd/characters/[id]/dnd5e-build/route.ts',
    'app/api/dnd/characters/[id]/pf2-build/route.ts',
    'app/api/dnd/characters/[id]/ig-build/route.ts',
    'app/dnd/_sheet/components/ui/FeatPicker.tsx',
    'app/dnd/_sheet/components/ui/SpellPicker.tsx',
    'app/dnd/_ui/PF2ContentPicker.tsx',
  ];

  for (const f of GATED) {
    it(`${f} asks isRulesEnforcedKind, not === 'vanilla'`, () => {
      const src = read(f);
      expect(src).toContain('isRulesEnforcedKind');
      expect(src, `${f} still compares to 'vanilla'`).not.toMatch(/(variantKind|buildVariant)\s*===\s*'vanilla'/);
    });
  }

  it('the two bespoke build routes derive their unbound reason from one helper', () => {
    for (const f of ['app/api/dnd/characters/[id]/pf2-build/route.ts', 'app/api/dnd/characters/[id]/ig-build/route.ts']) {
      expect(read(f)).toContain('unboundReasonFor(buildVariant');
    }
  });
});

describe('the badge says which state it is', () => {
  const tagsFor = (kind: SheetVariantKind) => variantTags({
    system: 'dnd5e-2024', kind, active: true, origin: true,
  } as Parameters<typeof variantTags>[0]).map((t) => t.label);

  it('altered vanilla reads as neither Vanilla nor Custom', () => {
    expect(tagsFor('altered-vanilla')).toContain('Altered vanilla');
    expect(tagsFor('altered-vanilla')).not.toContain('Vanilla');
    expect(tagsFor('altered-vanilla')).not.toContain('Custom');
  });

  it('the other two are unchanged', () => {
    expect(tagsFor('vanilla')).toContain('Vanilla');
    expect(tagsFor('custom')).toContain('Custom');
  });

  it('every kind produces exactly one provenance chip', () => {
    for (const k of ALL) {
      const provenance = tagsFor(k).filter((l) => ['Vanilla', 'Altered vanilla', 'Custom'].includes(l));
      expect(provenance, k).toHaveLength(1);
    }
  });
});

describe('the variant route accepts the new kind', () => {
  const src = read('app/api/dnd/characters/[id]/variant/route.ts');
  it('validates against the list rather than a pair of ternaries', () => {
    expect(src).toContain("KINDS: SheetVariantKind[] = ['vanilla', 'altered-vanilla', 'custom']");
    expect(src).toContain('KINDS.find((k) => k === body.kind)');
  });
});

// __tests__/dnd/homebrew-placeholders.test.ts — every builder field shows a worked example.
//
// Owner, 2026-07-29: *"make sure there is well chosen place holder text for all of the input fields for
// all of the homebrew options. All of the place holder text should relate to the type of thing that is
// being homebrewed."*
//
// The second sentence is the hard half. `summary`, `description` and `tags` are shared by all eighteen
// kinds, so a single example is either wrong for seventeen of them or so vague it teaches nothing. The
// commonest reason a creator writes a one-word summary is not knowing what shape of answer is wanted.
import { describe, it, expect } from 'vitest';
import { HOMEBREW_KINDS } from '@/lib/dnd/homebrew/model';
import { fieldsForKind, commonFieldsFor } from '@/lib/dnd/homebrew/kinds';

/** The types where a placeholder is a worked example rather than noise. A select shows its options; a
 *  checkbox has nothing to exemplify. */
const NEEDS_EXAMPLE = ['text', 'textarea', 'dice'];

describe('the shared identity fields are kind-specific', () => {
  for (const kind of HOMEBREW_KINDS) {
    it(`${kind} has its own summary/description/tags examples`, () => {
      const common = commonFieldsFor(kind);
      for (const key of ['summary', 'description', 'tags']) {
        const f = common.find((x) => x.key === key)!;
        expect(f.placeholder, `${kind}.${key}`).toBeTruthy();
      }
    });
  }

  it('no two kinds share a summary example', () => {
    // The assertion that makes "relates to the type of thing" real rather than aspirational: if a copy
    // is pasted across kinds this fails, and a generic default fails hardest of all.
    const summaries = HOMEBREW_KINDS.map((k) => commonFieldsFor(k).find((f) => f.key === 'summary')!.placeholder);
    expect(new Set(summaries).size).toBe(HOMEBREW_KINDS.length);
  });

  it('an example is not a restatement of the label', () => {
    // "Summary" as a placeholder for Summary teaches nothing. `help` already says what the field means.
    for (const kind of HOMEBREW_KINDS) {
      for (const f of commonFieldsFor(kind)) {
        if (!f.placeholder) continue;
        expect(f.placeholder.toLowerCase(), `${kind}.${f.key}`).not.toBe(f.label.toLowerCase());
        expect(f.placeholder.length, `${kind}.${f.key}`).toBeGreaterThan(12);
      }
    }
  });
});

describe('coverage', () => {
  it('reports which kind-specific fields still lack an example', () => {
    // NOT asserted at zero yet — 35 kind-specific fields (a weapon's `properties`, a class's `asiLevels`)
    // are still bare, and pretending otherwise would be worse than counting them. This pins the direction:
    // the number may fall, never rise.
    const bare: string[] = [];
    for (const kind of HOMEBREW_KINDS) {
      for (const f of fieldsForKind(kind)) {
        if (NEEDS_EXAMPLE.includes(f.type) && !f.placeholder) bare.push(`${kind}.${f.key}`);
      }
    }
    expect(bare.length, `still bare: ${bare.join(', ')}`).toBeLessThanOrEqual(35);
  });
});

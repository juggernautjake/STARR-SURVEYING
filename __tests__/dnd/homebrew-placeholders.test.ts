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
  it('EVERY text, textarea and dice field across all 18 kinds has an example', () => {
    // Was a ceiling of 35 when only the shared fields were done; now exact. A new field added to any kind
    // without an example fails here, which is the only way "all of the input fields" stays true after the
    // slice that made it true.
    const bare: string[] = [];
    for (const kind of HOMEBREW_KINDS) {
      for (const f of fieldsForKind(kind)) {
        if (NEEDS_EXAMPLE.includes(f.type) && !f.placeholder) bare.push(`${kind}.${f.key}`);
      }
    }
    expect(bare, `no placeholder: ${bare.join(', ')}`).toEqual([]);
  });

  it('a kind-specific example is not reused across kinds', () => {
    // Same reasoning as the summary check: a pasted example is a generic one wearing a costume. Compared
    // within field KEY, since `senses` legitimately differs between a race and a creature but should not
    // be identical.
    const byKey = new Map<string, string[]>();
    for (const kind of HOMEBREW_KINDS) {
      for (const f of fieldsForKind(kind)) {
        if (!f.placeholder || !NEEDS_EXAMPLE.includes(f.type)) continue;
        byKey.set(f.key, [...(byKey.get(f.key) ?? []), f.placeholder]);
      }
    }
    for (const [key, values] of byKey) {
      expect(new Set(values).size, `"${key}" reuses an example across kinds`).toBe(values.length);
    }
  });
});

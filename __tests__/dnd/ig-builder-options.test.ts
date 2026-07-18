// __tests__/dnd/ig-builder-options.test.ts — Area B8 (data-level slice of the alignment/verification walk).
//
// The manual B8 walkthrough confirms the build visually in-app; this pins the part that's a pure invariant:
// EVERY option the IG builder offers must be a real vanilla-catalog element, so the picker can never present a
// "phantom" the provenance system would flag as custom-on-a-vanilla-build. It reconstructs the exact option
// lists `IGCharacterBuilder` renders (the `igCatalog()` `names(kind)` lists + the taxonomy's parent classes and
// scoped subclasses) and runs each name through the SAME `classifyElement` the builder uses for its provenance
// count. If the taxonomy and the classifier/catalog ever drift, a builder-offered class/subclass classifies as
// 'custom' here and this fails — catching the drift before a surveyor sees a phantom option.
import { describe, it, expect } from 'vitest';
import { igCatalog } from '@/lib/dnd/systems/intuitive-games/catalog';
import { igParentClasses, igSubclassesOf } from '@/lib/dnd/systems/intuitive-games/taxonomy';
import { classifyElement } from '@/lib/dnd/provenance';
import type { ElementKind } from '@/lib/dnd/provenance';

// The builder's own helper, mirrored: the names offered for a given catalog kind.
const catalog = igCatalog();
const names = (kind: ElementKind): string[] =>
  catalog.filter((g) => g.kind === kind).flatMap((g) => g.entries.map((e) => e.name));

// Exactly the kinds the builder pulls from the catalog for its pickers (IGCharacterBuilder lines 26–35).
const CATALOG_KINDS: ElementKind[] = ['ancestry', 'subclass', 'stance', 'power', 'feat', 'defensive-power', 'weapon-type'];

describe('IG builder offers only vanilla-catalog options (Area B8 — no phantom picks)', () => {
  for (const kind of CATALOG_KINDS) {
    it(`every offered ${kind} is a real vanilla catalog entry`, () => {
      const offered = names(kind);
      expect(offered.length).toBeGreaterThan(0); // the picker isn't silently empty
      const custom = offered.filter((n) => classifyElement('intuitive-games', kind, n) !== 'vanilla');
      expect(custom, `these offered ${kind}s classify as custom (phantom): ${custom.join(', ')}`).toEqual([]);
    });
  }

  it('every parent class the class dropdown offers classifies as vanilla', () => {
    const parents = igParentClasses();
    expect(parents.length).toBe(4);
    const custom = parents.filter((n) => classifyElement('intuitive-games', 'class', n) !== 'vanilla');
    expect(custom, `phantom parent classes: ${custom.join(', ')}`).toEqual([]);
  });

  it('every scoped subclass the subclass dropdown offers classifies as vanilla (taxonomy ↔ classifier agree)', () => {
    // This is the cross-source check: the builder's subclass options come from the TAXONOMY (igSubclassesOf),
    // but provenance classifies them through igIsVanilla — the two must not drift.
    const stragglers: string[] = [];
    for (const parent of igParentClasses()) {
      for (const sub of igSubclassesOf(parent)) {
        if (classifyElement('intuitive-games', 'subclass', sub) !== 'vanilla') stragglers.push(`${parent} → ${sub}`);
      }
    }
    expect(stragglers, `taxonomy subclasses the classifier doesn't recognize as vanilla: ${stragglers.join(', ')}`).toEqual([]);
  });
});

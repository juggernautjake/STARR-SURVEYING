// __tests__/dnd/library-sections-collapsible.test.ts — every rules section collapses, and starts closed.
//
// OWNER, 2026-07-29: *"Please make it so that the spells section also is a toggle dropdown element like the
// sections titled HOW THE GAME RESOLVES and ABILITIES & ATTRIBUTES. Please make sure the glossary is also able
// to be toggled open and closed. Please make sure everything is closed by default. This should be the case for
// each section in each system."*
//
// WHAT HAD HAPPENED: the library page's generic sections were already default-closed `<details>` — that
// decision shipped in July. Three sections were not, because each is its OWN component with its own
// hand-rolled `<section className={framedPanel}>` header: SpellBrowser, GlossaryList, and the class-tables
// panel. The pattern lived in the page and the exceptions lived elsewhere, so the exceptions never got it.
//
// Fixing those three by hand would have satisfied today's list and left the fourth section, whenever someone
// writes it, just as free to be a plain `<section>`. So the chrome moved into `CollapsibleSection` and this
// asserts the property rather than the three fixes: no library surface renders a section header outside a
// collapsible, and the shared component starts closed.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
/** Negative source assertions run comment-stripped, or a comment explaining the old pattern fails the check. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Every component that renders a library/rules section. */
const SECTION_SURFACES = [
  'app/dnd/library/[key]/page.tsx',
  'app/dnd/_ui/SpellBrowser.tsx',
  'app/dnd/_ui/GlossaryList.tsx',
];

describe('the shared collapsible is the pattern', () => {
  const src = read('app/dnd/_ui/CollapsibleSection.tsx');

  it('renders a native <details> with the <summary> first', () => {
    // Native, so it works before hydration and is keyboard/screen-reader correct without any of our code —
    // and `DeepLinkOpener` already opens ancestor `<details>`, so `#entry-…` links keep working.
    expect(src).toMatch(/<details/);
    expect(src.indexOf('<summary')).toBeGreaterThan(src.indexOf('<details'));
    // A <summary> that is not the first child is not a disclosure control at all.
    expect(src).not.toMatch(/<details[^>]*>\s*\{?\s*<div/);
  });

  it('defaults to CLOSED', () => {
    expect(src).toMatch(/defaultOpen = false/);
  });

  it('and gives the header a 44px target on touch', () => {
    // The section header is the primary tap target on the page once everything is collapsed.
    const css = read('app/dnd/_ui/hextech.module.css');
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.sectionSummary \{\s*min-height: 44px/);
  });
});

describe('every library section surface uses it', () => {
  for (const file of SECTION_SURFACES) {
    it(file, () => {
      expect(read(file)).toContain('CollapsibleSection');
    });
  }

  it('and none renders a section header outside a collapsible', () => {
    // THE PATTERN THAT WAS THE BUG: a `panelTitle` heading inside a plain `<section>`. If this matches, some
    // section is back to being non-collapsible — which is invisible on the page until you look for it, since
    // an always-open section looks perfectly fine on its own.
    for (const file of SECTION_SURFACES) {
      const src = code(file);
      const sections = [...src.matchAll(/<section[^>]*framedPanel[\s\S]{0,400}?<h2[^>]*panelTitle/g)];
      expect(sections.map((m) => m[0].slice(0, 60)), `${file} has a non-collapsible section header`).toEqual([]);
    }
  });

  it('and no surface hardcodes `open` on a rules section', () => {
    // `defaultOpen` exists for a genuinely single-section page; a caller passing it here would reintroduce
    // "not closed by default" one section at a time.
    for (const file of SECTION_SURFACES) {
      expect(code(file), `${file} forces a section open`).not.toMatch(/<CollapsibleSection[^>]*defaultOpen/);
    }
  });
});

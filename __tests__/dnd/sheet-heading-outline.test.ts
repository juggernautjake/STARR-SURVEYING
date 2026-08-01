// __tests__/dnd/sheet-heading-outline.test.ts — the two document-structure gaps from slice 105.
//
// Slice 118. Slice 117 pinned the blank-character flash after noting it was the only finding of this arc
// living as prose in a 4,500-line doc. These two were in exactly the same position, and prose is where
// slices 73 and 109 both showed findings rot.
//
// Measured in a browser at slice 105, after hydration, on three pages:
//
//     /dnd hub    6 headings   1 h1   no level jumps
//     5e sheet    4 headings   1 h1   **h1 → h3 at "Dossier"**
//     IG sheet   11 headings   **0 h1**   no jumps
//
// Both are WCAG 1.3.1. Neither was fixed, and the reason is recorded here with each pin, because in both
// cases the obvious one-line change is wrong:
//
//   · The 5e `<h3>Dossier</h3>` is styled BY TAG — `.dnd-sheet .card h3` in `theme.css`, plus skin
//     overrides. Promoting it to `<h2>` silently drops its styling. The clean fix decouples the CSS from
//     the tag; the cheap one is `aria-level="2"`, which keeps the look and leaves an ARIA workaround a
//     later CSS cleanup would want removed. That is a judgement about which direction the styles go — and
//     it renders in TWO places, so it is not a one-line change either way.
//   · The IG sheet's character name reaches `SheetPortrait`, which uses it only for an `alt` attribute.
//     Nothing there is a heading, so choosing which element becomes the `h1` is a structural decision on
//     someone's bespoke sheet.
//
// The `it.fails` pins below keep the suite green while making both impossible to lose: fixing either one
// reports "expected to fail but passed" and names the pin to delete.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const APP = read('app/dnd/_sheet/App.tsx');
const FIVE = read('app/dnd/_sheet/panels/fivePanels.tsx');
const IG = read('app/dnd/_ui/IGSheet.tsx');
const IG_PANELS = read('app/dnd/_ui/ig/useIgPanels.tsx');
const THEME = read('app/dnd/_sheet/styles/theme.css');

describe('the files are the ones we think they are', () => {
  // Limitation 12: a zero count from a file that does not exist looks exactly like a clean result.
  it('every source read is non-empty', () => {
    for (const [name, src] of Object.entries({ APP, FIVE, IG, IG_PANELS, THEME })) {
      expect(src.length, `${name} is empty — wrong path?`).toBeGreaterThan(500);
    }
  });
});

describe('5e — the heading level skip, FIXED 2026-07-27', () => {
  // The fix took the direction this file called the clean one: decouple the CSS from the tag, rather than
  // paper over the level with `aria-level`. Card titles are now `<h2>` — a card IS a top-level section of
  // the sheet, sitting directly under the character-name `<h1>` — and the 12 skin rules that styled
  // `.card h3` now read `.card :is(h2, h3)`, so nothing lost its look and any `h3` left inside a card
  // still renders identically.
  //
  // Promoting ONLY "Dossier" would have made the original measurement pass while leaving the defect: the
  // sheet is tabbed, and ~25 card titles across 12 panels were `h3`, so any tab whose first heading was
  // not Dossier still skipped h1 → h3. That is why this is a sweep and not a two-line edit.
  it('"Dossier" is an h2 in both places it renders', () => {
    expect(APP).toContain('<h2>Dossier</h2>');
    expect(FIVE).toContain('<h2>Dossier</h2>');
  });

  it('no card title is left at h3 in the panels that render them', () => {
    for (const path of [
      'app/dnd/_sheet/App.tsx', 'app/dnd/_sheet/panels/fivePanels.tsx',
      'app/dnd/_sheet/components/Features.tsx', 'app/dnd/_sheet/components/SpellsPanel.tsx',
      'app/dnd/_sheet/components/SavesSkills.tsx', 'app/dnd/_sheet/components/Bio.tsx',
      'app/dnd/_sheet/components/Balance.tsx', 'app/dnd/_sheet/components/MlmPanel.tsx',
      'app/dnd/_sheet/components/CombatPanel.tsx', 'app/dnd/_sheet/components/InteractiveSheet.tsx',
    ]) {
      expect(read(path), `${path} still has an h3 card title`).not.toContain('<h3');
    }
  });

  it('and the styling followed the tag rather than being dropped', () => {
    // The constraint that made this a judgement call. Both tags are styled now, so the promotion is
    // invisible to the eye and the rules keep working for anything still using h3.
    expect(THEME).toMatch(/\.dnd-sheet \.card :is\(h2, h3\)\s*\{/);
    expect(THEME).toMatch(/\.dnd-sheet\.skin-streamer \.card :is\(h2, h3\)/);
    expect(THEME, 'a bare `.card h3` selector came back').not.toMatch(/\.card h3/);
  });

  it('the dialog title and the per-form sub-item were deliberately NOT promoted', () => {
    // Neither is a card title. `EditDialog`'s heading labels a modal, which carries its own outline, and
    // `Forms`' is a sub-item inside a panel. Promoting them would invent structure rather than fix it.
    expect(read('app/dnd/_sheet/components/ui/EditDialog.tsx')).toContain('<h3>{title}</h3>');
    expect(read('app/dnd/_sheet/components/Forms.tsx')).toContain('<h3 className="form-name">');
  });
});

describe('the bespoke sheets — top-level heading, FIXED 2026-07-27', () => {
  it('IG renders exactly one h1', () => {
    const h1s = (IG + IG_PANELS).match(/<h1/g) ?? [];
    expect(h1s.length).toBe(1);
  });

  it('and it is the masthead that was already acting as the title', () => {
    // Chosen over a visually-hidden h1, which would have read the name twice to a screen reader while
    // leaving the visible masthead semantically inert.
    expect(IG_PANELS).toMatch(/<h1 style=\{\{ margin: 0[^}]*\}\}>\{id\.name \|\| 'Unnamed'\}<\/h1>/);
  });

  it('PF2 too — the pin named IG, but the other bespoke sheet had the same defect', () => {
    // Found by checking the sibling rather than by another browser pass. `clamped-token-surface.test.ts`
    // records why that habit exists here: "THE SAME BUG, THREE TIMES … the third only because the
    // second's write-up said to check the siblings."
    const pf2 = read('app/dnd/_ui/pf2/usePf2Panels.tsx');
    expect((pf2.match(/<h1/g) ?? []).length).toBe(1);
    expect(pf2).toMatch(/<h1 style=\{\{ margin: 0[^}]*\}\}>\{id\.name \|\| 'Unnamed'\}<\/h1>/);
  });

  it('the portrait still spends the name on an alt, which is why it is not the heading', () => {
    const portrait = read('app/dnd/_sheet/components/SheetPortrait.tsx');
    expect(portrait).toMatch(/alt=\{`\$\{name/);
    expect(portrait).not.toContain('<h1');
  });
});

describe('the bespoke sheets’ SECTION heads — found 2026-08-01, and the first was caused by the fix above', () => {
  // Adding IG's `h1` (slice 105, above) turned every IG section head into an `h1 → h3` SKIP. The sheet had
  // no `h1`, so its `h3`s never skipped anything; giving it one made them all wrong at once. A fix that
  // creates the next defect is exactly what a browser pass catches and a source-lock does not, and this
  // one was measured on a live IG sheet: one skip, repeated on all five sections.
  //
  // Then PF2, by the sibling habit: it had a DIFFERENT shape of the same defect. Its sheet carried exactly
  // ONE heading — the character name — and every section title was a styled `<span>`. No level skip,
  // because there were no levels; and no way to navigate the sheet by section at all.
  //
  // Neither change moves a pixel. Every IG heading property is inline, and `.pf2SectionTitle` already
  // carried the whole PF2 look; only `margin: 0` had to be added, because a `span` has none and an `h2`
  // has `0.83em 0`, which would have broken the flex row's baseline. Computed styles were re-measured
  // after each change and are identical.
  it('IG section heads are h2, directly under the character h1', () => {
    expect(IG_PANELS, 'an IG section head went back to h3 — that is an h1 → h3 skip').not.toMatch(/<h3[ >]/);
    expect(IG_PANELS).toMatch(/<h2 style=\{\{ margin: 0, display: 'inline-flex'/);
  });

  it('PF2 section heads are h2 rather than a styled span', () => {
    const pf2 = read('app/dnd/_ui/pf2/usePf2Panels.tsx');
    expect(pf2).toMatch(/<h2 style=\{\{ margin: 0 \}\} className=\{styles\.pf2SectionTitle\}/);
    expect(pf2, 'the section title reverted to a semantically inert span')
      .not.toMatch(/<span className=\{styles\.pf2SectionTitle\}/);
  });

  it('the PF2 heading still needs its explicit margin reset', () => {
    // `.pf2SectionTitle` sets family, size, weight, letter-spacing, case and colour — but NOT margin,
    // because it was written for a span. If someone drops the inline `margin: 0` the UA h2 margin comes
    // back and the section rule stops sitting on the title's baseline.
    const css = read('app/dnd/_ui/hextech.module.css');
    const rule = css.slice(css.indexOf('.pf2SectionTitle {'), css.indexOf('.pf2SectionRule'));
    expect(rule).toContain('font-size: 14.5px');
    expect(rule, 'the class now sets a margin — the inline reset may be redundant, re-measure before removing it')
      .not.toMatch(/^\s*margin:/m);
  });
});

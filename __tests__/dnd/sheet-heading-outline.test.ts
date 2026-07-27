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

describe('5e — the heading level skip, and why it is not a one-line fix', () => {
  it('"Dossier" is an h3 and renders in two places', () => {
    expect(APP).toContain('<h3>Dossier</h3>');
    expect(FIVE).toContain('<h3>Dossier</h3>');
  });

  it('there is no h2 between the h1 and it', () => {
    // The skip itself: the sheet has an h1 (the character name) and then jumps straight to h3.
    expect(APP).not.toContain('<h2');
  });

  it('and the h3 is styled BY TAG, which is the whole constraint', () => {
    // Promoting the tag drops these rules. Pinned so the cost stays visible next to the defect.
    expect(THEME).toMatch(/\.dnd-sheet \.card h3\s*\{/);
    expect(THEME).toMatch(/\.dnd-sheet\.skin-streamer \.card h3/);
  });
});

describe('IG — no top-level heading at all', () => {
  it('the bespoke sheet renders no h1', () => {
    expect(IG).not.toContain('<h1');
    expect(IG_PANELS).not.toContain('<h1');
  });

  it('and the name never reaches a heading element', () => {
    // `SheetPortrait` receives `name` and spends it on an `alt`. That is why picking the h1 is structural
    // rather than a rename — there is no existing element that is semantically the title.
    const portrait = read('app/dnd/_sheet/components/SheetPortrait.tsx');
    expect(portrait).toMatch(/alt=\{`\$\{name/);
    expect(portrait).not.toContain('<h1');
  });
});

describe('THE DEFECTS — pinned, fail on purpose', () => {
  it.fails('5e: the sheet should not skip from h1 to h3 (slice 105)', () => {
    // Passes once an h2 exists between them, or "Dossier" carries an explicit level.
    const skips = APP.includes('<h3>Dossier</h3>') && !APP.includes('<h2') && !APP.includes('aria-level');
    expect(skips).toBe(false);
  });

  it.fails('IG: the sheet should have exactly one h1 (slice 105)', () => {
    const hasH1 = IG.includes('<h1') || IG_PANELS.includes('<h1');
    expect(hasH1).toBe(true);
  });
});

// __tests__/dnd/bespoke-heading-contrast.test.ts — hard numbers for the gold-family heading decision.
//
// Slice 44 recorded that no contrast check had been made on the new edit-history panel, and warned that
// "it inherits the right tokens" is exactly the assumption slice 34 found wrong elsewhere. This is that
// check, and it found the heading failing AA on all three light skins.
//
// **It is deliberately NOT fixed here, and that is the substance of this file.**
//
// The panel's heading uses `var(--hx-gold-2)`, which is the house style: the IG panels' own `<h3>` section
// headings use the same token at the same weight. So this is not a defect introduced by the new panel — it
// is the SAME gold-family item the final-QA baseline already tracks as one of its remaining colour
// decisions ("the gold/amber family on pale panels"). Changing one heading in isolation would make the
// sheet inconsistent with every sibling heading AND leave those siblings failing, while pre-empting a call
// that belongs to whoever owns each skin's identity.
//
// What was missing was NUMBERS. This supplies them, per skin, from the repo's tested contrast maths, so the
// decision can be made on measurement rather than impression — and so that whenever it IS made, this file
// is what proves it worked.
//
// WHY `--hx-gold-2` FAILS WHILE THE BODY TOKENS PASS, which is the useful structural finding:
// `skin-tokens.ts` derives `--hx-text` and `--hx-muted` through `ensureContrast(…, panel, 7 | 4.5)` — they
// are CLAMPED against the panel and therefore correct on every skin by construction. The gold ramp is not
// clamped; it is the skin's own swatch, darkened. So the ink tokens are safe by design and the gold ones
// are safe only by luck, which is precisely why the light skins broke and the dark ones did not.
import { describe, it, expect } from 'vitest';
import { skinHxVars } from '@/lib/dnd/skin-tokens';
import { contrastRatio, aaThresholdForSize } from '@/lib/dnd/theme-contrast';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** The skins that exist on live characters (slice 34's set), minus `default`, which emits no overrides. */
const LIGHT = ['streamer', 'donata', 'jack'];
const DARK = ['lazzuh'];

/** The heading is 13px BOLD. Bold only earns the 3.0 threshold at ≥18.66px, so this needs the full 4.5. */
const NEED = aaThresholdForSize(13, true);

function tokens(skin: string) {
  const v = skinHxVars(skin) as Record<string, string>;
  return { gold2: v['--hx-gold-2'], panel: v['--hx-panel'], panel2: v['--hx-panel-2'], text: v['--hx-text'], muted: v['--hx-muted'] };
}

/** `.framedPanel` paints `linear-gradient(180deg, var(--hx-panel-2), var(--hx-panel))`, and the heading sits
 *  at the TOP of the panel — over `--hx-panel-2`, the lighter stop and the worse case. Measuring against
 *  `--hx-panel` alone would flatter it by ~0.4, which is the difference between "fails" and "borderline". */
const worstBackdrop = (t: ReturnType<typeof tokens>) => t.panel2 ?? t.panel;

describe('the threshold is the strict one', () => {
  it('13px bold still needs 4.5, not 3.0', () => {
    expect(NEED).toBe(4.5);
  });
});

describe('the body tokens are safe BY CONSTRUCTION', () => {
  for (const skin of [...LIGHT, ...DARK]) {
    it(`${skin}: --hx-text and --hx-muted clear AA on the panel`, () => {
      const t = tokens(skin);
      // These are `ensureContrast(…, panel, 7)` and `(…, panel, 4.5)` in skin-tokens.ts. If either ever
      // fails, the clamp itself is broken — a far bigger problem than one heading's colour.
      expect(contrastRatio(t.text, t.panel)!).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(t.muted, t.panel)!).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('the gold heading is NOT, and here is the measurement', () => {
  it('dark skins pass comfortably', () => {
    for (const skin of DARK) {
      const t = tokens(skin);
      expect(contrastRatio(t.gold2, worstBackdrop(t))!).toBeGreaterThan(NEED);
    }
  });

  it('all three LIGHT skins fail — the tracked gold-family item, now with numbers', () => {
    // Measured 2026-07-27 against the panel-2 stop: streamer 3.70 · donata 3.64 · jack 3.75 (all < 4.5).
    // This assertion is characterising a KNOWN-OPEN item, not blessing it. When the gold family is
    // retuned, this test fails — and that failure is the signal to flip it to `toBeGreaterThanOrEqual`
    // and close the item, NOT to delete the assertion.
    for (const skin of LIGHT) {
      const t = tokens(skin);
      const r = contrastRatio(t.gold2, worstBackdrop(t))!;
      expect(r, `${skin} gold-2 on panel-2`).toBeLessThan(NEED);
      // And it is CLOSE — within ~0.9 of passing — which is what makes it a tuning decision rather than a
      // rewrite. Recorded so nobody assumes the gold has to be abandoned to fix it.
      expect(r).toBeGreaterThan(3.0);
    }
  });

  it('the new panel uses the same token as the sheets’ own section headings', () => {
    // The reason this is not fixed in isolation: doing so would leave every sibling heading failing while
    // making the new panel the odd one out.
    const panel = read('app/dnd/_ui/SheetEditHistory.tsx');
    const igPanels = read('app/dnd/_ui/ig/useIgPanels.tsx');
    expect(panel).toContain('--hx-gold-2');
    expect(igPanels).toContain("'var(--hx-gold-2)'");
  });

  it('the panel’s BODY text is fine, so only the heading is at issue', () => {
    // The rows themselves use `--hx-text` and `--hx-muted`, both clamped — so the content a DM actually
    // reads is legible on every skin even while the heading decision is open.
    const src = read('app/dnd/_ui/SheetEditHistory.tsx');
    expect(src).toContain('var(--hx-text)');
    expect(src).toContain('var(--hx-muted)');
  });
});

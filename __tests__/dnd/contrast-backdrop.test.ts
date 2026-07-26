// __tests__/dnd/contrast-backdrop.test.ts — the two measurement bugs that cost the 2026-07-26 contrast arc
// two slices, pinned so they cannot come back.
//
// Both lived in a snippet pasted into a browser console, which is exactly why they survived: a console
// one-liner has no tests and no reviewer. Both INVENTED failures rather than hiding them, which is the safer
// direction and still nearly produced two rounds of "fixes" to working code.
//
//   1. `backgroundColor` only, ignoring `background-image` — the roller dock is painted by a gradient, so the
//      walk stepped past it and measured its labels against the page behind: a fabricated regression.
//   2. the first colour of the first background LAYER only — `.dnd-sheet` paints a 5% pink pinstripe OVER an
//      opaque light base, so the element looked translucent, the walk climbed to the dark site chrome, and
//      ten perfectly legible headings were reported at 1.2–1.4:1.
//
// The fixtures below are the real computed values from those two elements.
import { describe, it, expect } from 'vitest';
import {
  backgroundLayers, backdropOf, measureText, contrastRatio, type RGBA,
} from '@/lib/dnd/theme-contrast';

const hex = (c: RGBA) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const TRANSPARENT = { backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none' };
const DARK_CHROME = { backgroundColor: 'rgb(10, 12, 22)' };

describe('bug 1: a gradient IS a background', () => {
  // `.fld`, the floating roller dock, on a streamer-skinned sheet.
  const DOCK = { backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'linear-gradient(160deg, rgba(255, 250, 254, 0.98), rgba(255, 240, 250, 0.98))' };

  it('reads the gradient rather than treating the element as transparent', () => {
    const layers = backgroundLayers(DOCK);
    expect(layers).toHaveLength(1);
    expect(layers[0].a).toBeCloseTo(0.98, 2);
  });

  it('so the dock reads NEAR-WHITE, not the dark page behind it', () => {
    const bd = backdropOf([DOCK, TRANSPARENT, DARK_CHROME]);
    expect(bd.r).toBeGreaterThan(240);
    expect(bd.g).toBeGreaterThan(240);
  });

  it('and the label measured on it fails, which is the REAL defect that fix was for', () => {
    // `--hx-muted`'s default `#a09b8c` on that near-white dock — the 2.59:1 slice 24 found.
    const m = measureText({ color: '#a09b8c', fontSizePx: 11 }, [DOCK, TRANSPARENT, DARK_CHROME]);
    expect(m.ratio!).toBeLessThan(3);
    expect(m.pass).toBe(false);
  });

  it('while the shell ink on the same dock passes — the fix that shipped', () => {
    const m = measureText({ color: '#8a3f7c', fontSizePx: 11 }, [DOCK, TRANSPARENT, DARK_CHROME]);
    expect(m.ratio!).toBeGreaterThanOrEqual(4.5);
    expect(m.pass).toBe(true);
  });
});

describe('bug 2: a background can have SEVERAL layers', () => {
  // `.dnd-sheet` on the streamer skin: a translucent pinstripe over an opaque base.
  const SHEET = {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    backgroundImage:
      'repeating-linear-gradient(0deg, rgba(255, 30, 156, 0.05) 0px, rgba(255, 30, 156, 0.05) 1px, rgba(0, 0, 0, 0) 1px, rgba(0, 0, 0, 0) 3px), ' +
      'linear-gradient(180deg, rgb(255, 250, 254), rgb(255, 240, 250))',
  };

  it('collects every layer, topmost first', () => {
    const layers = backgroundLayers(SHEET);
    expect(layers).toHaveLength(2);
    expect(layers[0].a).toBeCloseTo(0.05, 2);   // the pinstripe paints ON TOP
    expect(layers[1].a).toBe(1);                // the opaque base is beneath it
  });

  it('splits on TOP-LEVEL commas only — a gradient\'s own commas are not layer breaks', () => {
    // The naive `.split(',')` reading is what produced a 5%-alpha "surface".
    expect(backgroundLayers({ backgroundImage: 'linear-gradient(160deg, rgb(1,2,3), rgb(4,5,6))' })).toHaveLength(1);
  });

  it('stops at the opaque base instead of climbing to the dark chrome', () => {
    const bd = backdropOf([TRANSPARENT, SHEET, DARK_CHROME]);
    expect(hex(bd)).toMatch(/^#f[0-9a-f]/); // near-white, not #16152e
  });

  it('so the heading that was reported at 1.38:1 actually passes', () => {
    // `RESOURCES & USES`: 31px, streamer's `--ink` #5a1050. Screenshot-verified legible.
    const m = measureText({ color: '#5a1050', fontSizePx: 31 }, [TRANSPARENT, SHEET, DARK_CHROME]);
    expect(m.need).toBe(3);            // large text
    expect(m.ratio!).toBeGreaterThan(8);
    expect(m.pass).toBe(true);
  });

  it('and the OLD reading would have failed it — the artifact, reproduced', () => {
    // First layer only, treated as the whole surface: translucent → climb → dark chrome.
    const naive = backdropOf([TRANSPARENT, { backgroundImage: 'repeating-linear-gradient(0deg, rgba(255, 30, 156, 0.05) 0px, rgba(255, 30, 156, 0.05) 1px)' }, DARK_CHROME]);
    expect(contrastRatio('#5a1050', `rgb(${Math.round(naive.r)}, ${Math.round(naive.g)}, ${Math.round(naive.b)})`)!).toBeLessThan(3);
  });
});

describe('the ordinary cases still behave', () => {
  it('an opaque element ends the walk', () => {
    const bd = backdropOf([{ backgroundColor: 'rgb(20, 30, 40)' }, { backgroundColor: 'rgb(255, 255, 255)' }]);
    expect(hex(bd)).toBe('#141e28');
  });

  it('a fully transparent chain falls through to the base', () => {
    expect(hex(backdropOf([TRANSPARENT, TRANSPARENT]))).toBe('#ffffff');
  });

  it('translucent layers composite in order, nearest first', () => {
    const bd = backdropOf([{ backgroundColor: 'rgba(255, 255, 255, 0.5)' }, { backgroundColor: 'rgb(0, 0, 0)' }]);
    expect(Math.round(bd.r)).toBe(128);
  });

  it('applies the per-SIZE AA threshold, not a flat 4.5', () => {
    const big = measureText({ color: '#767676', fontSizePx: 30 }, [{ backgroundColor: '#ffffff' }]);
    const small = measureText({ color: '#767676', fontSizePx: 12 }, [{ backgroundColor: '#ffffff' }]);
    expect(big.need).toBe(3);
    expect(small.need).toBe(4.5);
    expect(big.pass).toBe(true);
    expect(small.pass).toBe(true); // #767676 on white is 4.54 — just over both
  });

  it('handles an empty chain without throwing', () => {
    expect(hex(backdropOf([]))).toBe('#ffffff');
  });
});

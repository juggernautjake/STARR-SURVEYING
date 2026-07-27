// __tests__/dnd/donata-filled-button-contrast.test.ts — the brand-fill item, made decision-ready.
//
// The contrast baseline lists "brand-filled buttons — 20 on donata, 1 on lazzuh" as one of its remaining
// colour decisions. Measuring it narrows that a great deal, and the narrowing is the point: **most of the
// brand fills are fine**, and the failures are not "brand colour vs legibility" in general — they are a
// specific, mechanical thing.
//
// Donata's filled buttons are GRADIENTS with a white label:
//
//     .btn.teal   { color:#fff; background: linear-gradient(160deg, var(--teal), var(--tealbright)) }
//     .btn.danger { color:#fff; background: linear-gradient(160deg, #f0577a, var(--danger)) }   ← CLOSED
//     .btn.pink   { color:#fff; background: linear-gradient(160deg, #ff5fa8, var(--hotpink)) }
//     .btn.solid  { color:#fff; background: linear-gradient(160deg, var(--hotpink), var(--violet)) }
//
// UPDATE 2026-07-27 — `.btn.danger` is closed (option A: light stop → #ca4966, label → `var(--danger-on)`).
// It was taken first because it is the one the analysis below shows CANNOT use option B. `.btn.teal` and
// `.btn.pink` remain open, and remain a look decision rather than a correctness one, since both can take
// either remedy.
//
// In every case the gradient ENDS on a colour white reads on comfortably (6.41 / 6.91 / 5.87). It is only
// the LIGHT stop — where the button starts — that was never checked against its own label. `.btn.solid`
// starts on `--hotpink` and passes; the other three start lighter and fail.
//
// So this is not twenty judgement calls. It is THREE gradient stops, each with two remedies that both
// preserve the skin's identity, both measured below. That is what makes it a one-step decision instead of
// an open-ended design conversation — and it is deliberately left AS a decision, because unlike the clamp
// bug (slice 47) nothing here is misconfigured: these are hand-picked brand colours, and changing one is a
// change to how the skin looks.
//
// WHEN IT IS DECIDED, this file is what proves the fix: flip the failing assertions, exactly as slice 46's
// did when slice 47 closed it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio } from '@/lib/dnd/theme-contrast';
import { donataTheme, themeToCssVars } from '@/app/dnd/_sheet/theme';

const CSS = readFileSync(join(process.cwd(), 'app/dnd/_sheet/styles/theme.css'), 'utf8');

const WHITE = '#ffffff';
const DONATA_INK = '#3a2140'; // the skin's own body ink — its "deep plum", ~11:1 on cream
const AA = 4.5;

/** The light (first) stop of each donata filled-button gradient, with the label it carries.
 *  `btn.danger` is no longer here: it was closed 2026-07-27 (see the CLOSED block below). The two that
 *  remain are still open, and both CAN take option B, which is why they were not closed alongside it —
 *  option B keeps the candy colour exactly, and choosing between that and a deeper stop is a look
 *  decision rather than a correctness one. */
const LIGHT_STOPS = {
  'btn.teal': '#17b3a3',    // --teal, commented in theme.ts as "candy teal (bg)"
  'btn.pink': '#ff5fa8',
};
/** What `btn.danger` used to start on, kept so the closed case still records what was wrong. */
const DANGER_LIGHT_STOP_BEFORE = '#f0577a';

/** The dark (second) stop each gradient ends on — already legible under white. */
const DARK_STOPS = {
  'btn.teal': '#0a6b5d',    // --tealbright, "link/mod/term teal"
  'btn.danger': '#ad1f3d',  // --danger
  'btn.pink': '#c2185b',    // --hotpink
};

describe('the rules are still shaped the way this measurement assumes', () => {
  it('donata paints these buttons as gradients with a white label', () => {
    // If a rule is restructured, the stops below stop describing reality — fail loudly rather than keep
    // asserting numbers about CSS that no longer exists.
    expect(CSS).toContain('.dnd-sheet.skin-donata .btn.teal { color: #fff; background: linear-gradient(160deg, var(--teal), var(--tealbright))');
    expect(CSS).toContain('.dnd-sheet.skin-donata .btn.pink { color: #fff; background: linear-gradient(160deg, #ff5fa8, var(--hotpink))');
    // `.btn.danger` was CLOSED 2026-07-27 by option A — it is the one this file said could not use
    // option B. Its light stop is now #ca4966 and its label is the derived `--danger-on`.
    expect(CSS).toContain('.dnd-sheet.skin-donata .btn.danger { color: var(--danger-on, #fff); background: linear-gradient(160deg, #ca4966, var(--danger))');
  });
});

describe('the DARK stop of every gradient is already fine', () => {
  for (const [name, colour] of Object.entries(DARK_STOPS)) {
    it(`${name} ends on a colour white reads on`, () => {
      expect(contrastRatio(WHITE, colour)!).toBeGreaterThan(AA);
    });
  }

  it('and `.btn.solid` passes at BOTH ends, so it needs nothing', () => {
    // Worth pinning: it is the control case that shows the skin's palette is not the problem.
    expect(contrastRatio(WHITE, '#c2185b')!).toBeGreaterThan(AA); // --hotpink
    expect(contrastRatio(WHITE, '#7b2cbf')!).toBeGreaterThan(AA); // --violet
  });
});

describe('the LIGHT stop is where they fail — the remaining open item, with numbers', () => {
  // Measured 2026-07-27: teal 2.62 · danger 3.31 · pink 2.82, all against the white label.
  for (const [name, colour] of Object.entries(LIGHT_STOPS)) {
    it(`${name} starts on a colour white does NOT read on`, () => {
      expect(contrastRatio(WHITE, colour)!).toBeLessThan(AA);
    });
  }
});

describe('btn.danger — CLOSED 2026-07-27 by option A', () => {
  const AFTER = '#ca4966';

  it('it used to start on a stop white could not read (3.31)', () => {
    expect(contrastRatio(WHITE, DANGER_LIGHT_STOP_BEFORE)!).toBeLessThan(AA);
  });

  it('and now starts on one it can', () => {
    expect(contrastRatio(WHITE, AFTER)!).toBeGreaterThanOrEqual(AA);
  });

  it('the label clears BOTH stops for every theme this skin can actually wear', () => {
    // The mix-and-match case, which is why the hardcoded `#fff` had to go. `themeVariantsFor` gives the
    // donata skin the five universal themes (all carrying HEXTECH_GROUNDS' #c8413f) plus its own
    // #ad1f3d when no theme overrides. The streamer palettes are NOT reachable here — they are offered
    // only to `skin === 'streamer'` — which is what keeps this list closed rather than open-ended.
    for (const darkStop of ['#ad1f3d', '#c8413f']) {
      expect(contrastRatio(WHITE, darkStop)!, `white on ${darkStop}`).toBeGreaterThanOrEqual(AA);
    }
    expect(contrastRatio(WHITE, AFTER)!).toBeGreaterThanOrEqual(AA);
  });

  it('and if a future theme ever makes white wrong, the label follows the theme instead of staying #fff', () => {
    // `--danger-on` is derived per theme (contrast.ts). It resolves to white for both reachable values
    // above, so this change is a no-op today — its value is that it cannot silently go stale.
    const on = (themeToCssVars(donataTheme) as unknown as Record<string, string>)['--danger-on'];
    expect(on).toBe('#ffffff');
    expect(CSS).toContain('.dnd-sheet.skin-donata .btn.danger { color: var(--danger-on, #fff);');
  });
});

describe('two remedies, both measured, both keeping the skin', () => {
  // OPTION A — darken only the light stop to the minimum that passes, preserving hue. The gradient simply
  // starts deeper, ending where it already ended.
  const OPTION_A = { 'btn.teal': '#118479', 'btn.danger': '#ca4966', 'btn.pink': '#c24880' };

  for (const [name, colour] of Object.entries(OPTION_A)) {
    it(`A: ${name} → ${colour} clears AA under white`, () => {
      expect(contrastRatio(WHITE, colour)!).toBeGreaterThanOrEqual(AA);
    });
  }

  // OPTION B — keep the brand colour EXACTLY and change the label to the skin's own ink. Better where the
  // candy colour is the point; `.btn.gold` on this same skin already does exactly this (`color:#4a2f04`),
  // so it is an established pattern here rather than a new one.
  it('B: donata ink on the candy teal clears AA with the fill untouched', () => {
    expect(contrastRatio(DONATA_INK, LIGHT_STOPS['btn.teal'])!).toBeGreaterThan(AA);
  });

  it('B works on the pink stop too', () => {
    expect(contrastRatio(DONATA_INK, LIGHT_STOPS['btn.pink'])!).toBeGreaterThan(AA);
  });

  it('B does NOT work on the danger stop — which is why that one took option A', () => {
    // Recorded because it is the kind of detail that turns "just use dark text everywhere" into a second
    // round of bugs: the danger stop is mid-toned, and neither white nor the ink clears it.
    expect(contrastRatio(DONATA_INK, DANGER_LIGHT_STOP_BEFORE)!).toBeLessThan(AA);
  });

  it('the gold button already uses option B, which is why it never appeared in the baseline', () => {
    expect(CSS).toContain(".dnd-sheet.skin-donata .btn.gold { color: #4a2f04;");
  });
});

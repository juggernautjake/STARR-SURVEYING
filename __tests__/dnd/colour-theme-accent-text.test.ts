// __tests__/dnd/colour-theme-accent-text.test.ts — the five selectable COLOUR THEMES, measured as text.
//
// Slice 71. The bespoke sheets' `--hx-*` tokens are DERIVED and now clamped (slices 47/59/60/67), so one
// correction fixes every skin. `app/dnd/_sheet/theme.ts`'s palettes are the other half: hand-picked, and
// held to a contrast standard by hand. The CHARACTER themes in that file show the standard being applied —
// their comments carry the ratios they were chosen to hit:
//
//     hotpink: '#c2185b',   // deep raspberry — primary accent/value text, ~5.4:1
//     hotpink: '#35593a',   // primary accent — section nums, values, headers (7.2:1 on the card, ...)
//
// The five COLOUR themes (Hextech Gold / Shadow Isles / Noxus / Freljord / Void Prophet) were added later
// and carry no such annotation. Noxus's only contrast note is about a BORDER:
//
//     // Alpha raised so the crimson border is perceptible on the dark panel (TR-2) — 0.28 was 1.24:1 ...
//
// So borders were checked and the accent-as-TEXT was not. Found by measurement, on a live sheet: Perrin
// Underbough on Noxus put four `.sec-num` labels at 3.45 and 3.78.
//
// WHY THIS MATTERS MORE THAN ONE LABEL: `.sec-num` is not incidental. `.dnd-sheet .sec-num { color:
// var(--hotpink) }` is the BASE rule — it applies to every skin that does not override it — and ~15 shared
// components render one (`SectionHead`, `VariantToggle`, `SkinSwitch`, `LayoutSwitch`, `DescriptionsPanel`,
// `CustomizationSummary`, `SheetArtUploader`, `AiSheetEdit`, `DmOverridePanel`, the galleries…). Every
// section heading on the sheet is this token.
//
// This file asserts the RULE — the accent must be readable as 13px text on the panel stops it sits on.
// Seven combinations do not meet it today. They are pinned below with `it.fails` and their measured
// ratios, which keeps the suite honest in both directions: the gap cannot be forgotten, and the moment
// someone corrects the palette vitest reports "expected to fail but passed" and points at the pin to
// remove. A clamp cannot do this one — these are hand-picked colours, so the fix is a decision (see the
// slice-71 annotation in DND_FINAL_QA_WALKTHROUGH.md), not a derivation.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, aaThresholdForSize } from '@/lib/dnd/theme-contrast';
import {
  hextechTheme, hextechShadowIsles, hextechNoxus, hextechFreljord, hextechVoidProphet,
  donataTheme, themeToCssVars,
} from '@/app/dnd/_sheet/theme';

/** `.sec-num` is 13px / weight 400 — squarely under the large-text exemption. */
const AA = aaThresholdForSize(13, false);

/**
 * The grounds every colour theme shares (HEXTECH_GROUNDS).
 *
 * CORRECTED slice 72: `panel-3` is in the palette but is barely used as a background — the only rules
 * that paint it are `.dnd-sheet .stage` and two `.skin-donata` ones. A section head does not sit on it.
 * Slice 71 measured all three stops and reported the worst, which overstated the default theme's case
 * (`#0397ab` is 4.85/4.63 where labels actually sit, and only 4.30 on a stop they do not reach).
 * It stays in the table because `--muted` and `--ink` DO paint on `.stage`, but it is marked.
 */
const PANELS = { panel: '#0a1626', 'panel-2': '#0e1e30', 'panel-3': '#12283f' } as const;

/** The stops a `.sec-num` label actually renders on. */
const LABEL_STOPS = ['panel', 'panel-2'] as const;

const THEMES = [
  ['Hextech Gold', hextechTheme],
  ['Shadow Isles', hextechShadowIsles],
  ['Noxus Crimson', hextechNoxus],
  ['Freljord Ice', hextechFreljord],
  ['Void Prophet', hextechVoidProphet],
] as const;

describe('the threshold', () => {
  it('a 13px section label needs 4.5, not the large-text 3', () => {
    expect(AA).toBe(4.5);
  });
});

/**
 * The seven combinations that do not meet AA today, with the ratio each measured at (slice 71).
 * Keyed `<theme> on <stop>`. Removing an entry turns its case back into a normal assertion.
 *
 * Note the shape of it: Noxus and Void Prophet fail on ALL THREE stops, and the DEFAULT theme
 * (Hextech Gold) slips only on the deepest one — which is why a spot-check on a single sheet would
 * plausibly have missed it, and did until this sweep.
 */
const KNOWN_GAPS: Record<string, number> = {
  'Hextech Gold on panel-3': 4.3,
  'Noxus Crimson on panel': 3.45,
  'Noxus Crimson on panel-2': 3.19,
  'Noxus Crimson on panel-3': 2.84,
  'Void Prophet on panel': 3.95,
  'Void Prophet on panel-2': 3.66,
  'Void Prophet on panel-3': 3.26,
};

describe('every colour theme’s accent is readable as section-heading TEXT', () => {
  // FIXED 2026-07-27. The seven `it.fails` pins that used to live here are gone, and NOT because the
  // palettes were repainted. `.sec-num` now reads `var(--hotpink-ink, var(--hotpink))`, a per-theme
  // alternate derived in `themeToCssVars` from the theme's own grounds (`app/dnd/_sheet/contrast.ts`).
  //
  // Why a derivation rather than the one-token swap this file used to recommend: the swap fixes the five
  // themes someone measured. It does nothing for a combination nobody measured, and those are the ones
  // that bite — `themeVariantsFor` hands the five universal themes to every non-streamer skin, so the
  // real surface is skins × themes, not five palettes. The derivation covers the product by construction.
  //
  // The measurements below are unchanged; only which value they are applied to has changed.
  for (const [label, theme] of THEMES) {
    const hotpink = theme.colors?.hotpink;
    const ink = (themeToCssVars(theme) as unknown as Record<string, string>)['--hotpink-ink'];

    it(`${label}: defines the accent at all`, () => {
      expect(hotpink, `${label} has no hotpink`).toBeTruthy();
    });

    for (const stop of LABEL_STOPS) {
      it(`${label}: heading ink ${ink} on ${stop}`, () => {
        // The stops a `.sec-num` actually renders on. `panel-3` is excluded deliberately (see PANELS) —
        // it is painted by `.stage` and two donata rules, and a section head does not sit on it.
        expect(contrastRatio(ink, PANELS[stop])!).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it('the recorded gaps are still what the RAW accent measures', () => {
    // Kept as-is. These numbers are why the alternate exists; if a palette edit moves one, the pairing
    // between the recorded gap and the value it describes has drifted and this says so. The raw accent
    // failing is no longer a defect — nothing paints heading text with it — but it is still the evidence.
    for (const [label, theme] of THEMES) {
      for (const [stop, bg] of Object.entries(PANELS)) {
        const expected = KNOWN_GAPS[`${label} on ${stop}`];
        if (expected === undefined) continue;
        expect(contrastRatio(theme.colors!.hotpink!, bg)!, `${label} on ${stop}`).toBeCloseTo(expected, 1);
      }
    }
  });

  it('and a theme that was already fine kept its exact accent', () => {
    // The derivation must not redesign palettes that passed. Donata's `#c2185b` is annotated in the
    // palette as ~5.4:1 and hand-checked; it comes back byte-identical. (An earlier cut of the
    // derivation included every token's self-tint in the backdrop set and pushed this to #a7154e —
    // correcting a colour against a backdrop a section heading never lands on.)
    const donataInk = (themeToCssVars(donataTheme) as unknown as Record<string, string>)['--hotpink-ink'];
    expect(donataInk).toBe('#c2185b');
  });
});

describe('the character themes show the standard being met, so this is a gap and not a policy', () => {
  it('a hand-picked accent CAN clear AA in this file — two already do, by construction', () => {
    // These are the annotated ones: '#c2185b' (~5.4:1) and '#35593a' (7.2:1 on the card). Both were chosen
    // against a PALE panel, so they are dark inks; the assertion is only that the file's own authors held
    // accents to a text-legibility bar. That bar is what the five colour themes above are measured against.
    expect(contrastRatio('#c2185b', '#f4ecdf')!).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio('#35593a', '#f4ecdf')!).toBeGreaterThanOrEqual(AA);
  });
});

describe('an in-palette fix exists — no new colour has to be invented', () => {
  // SUPERSEDED 2026-07-27, kept because the analysis is still true and still useful. The sibling swap was
  // the right call while the fix had to be a hand-picked decision per theme; it was NOT taken, because
  // deriving `--hotpink-ink` fixes the same five themes AND every skin × theme combination nobody
  // measured, without changing any palette the designer authored. What follows documents that the
  // cheaper option was real, so a future reader knows it was weighed rather than missed.
  it('each failing theme already carries a lighter sibling that reads where labels sit', () => {
    // Every one of these palettes defines `pink` as the lighter partner of `hotpink`. Where the accent is
    // too dark to read, its own `pink` is the natural substitute for the TEXT uses: same hue, same family,
    // already part of the theme. This asserts the option is real, so the fix is a one-token swap and not a
    // colour-picking exercise. (Whether to take it is the owner's call — it changes how the theme looks.)
    //
    // NARROWED slice 72, and this is a correction to slice 71's claim rather than a tightening. That slice
    // said the substitute "clears 4.5 on the panel stops" while asserting only `panel-2`. On all three,
    // Noxus's `#e0576a` is 4.97 / 4.60 / **4.10** — under, on `panel-3`. The recommendation survives
    // because `panel-3` is not a surface a section label sits on (see PANELS above), but the claim as
    // written was broader than the assertion behind it, which is how slice 51 got a figure wrong.
    for (const [label, theme] of THEMES) {
      const hotpink = theme.colors?.hotpink;
      const pink = theme.colors?.pink;
      if (!hotpink || !pink) continue;
      for (const stop of LABEL_STOPS) {
        if (contrastRatio(hotpink, PANELS[stop])! >= AA) continue; // already fine, nothing to substitute
        expect(contrastRatio(pink, PANELS[stop])!, `${label} pink ${pink} is a usable ink on ${stop}`)
          .toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it('and the substitute is NOT claimed beyond where it holds', () => {
    // The honest bound, pinned so the write-up and the code cannot drift apart again.
    expect(contrastRatio('#e0576a', PANELS['panel-3'])!).toBeLessThan(AA);
    expect(contrastRatio('#e0576a', PANELS['panel-2'])!).toBeGreaterThanOrEqual(AA);
  });
});

// ── The sibling sweep (slice 72) ──────────────────────────────────────────────────────────────────
//
// Slice 71 checked `--hotpink` because `--hotpink` was what a live sheet flagged. This repo's own
// `clamped-token-surface.test.ts` records why that is not enough: *"THE SAME BUG, THREE TIMES … the third
// only because the second's write-up said to check the siblings."* So every token that paints text was
// measured across all five themes. Two probe artifacts were caught and discarded before they became
// claims, both of a kind this repo has logged before:
//
//   · `--violet-2` looked like the worst offender (2.11–4.29). **8 of its 8 text uses are `.skin-donata`**,
//     a LIGHT skin with its own pale panels — measuring it against the dark hextech grounds was the
//     probe's error, not a defect.
//   · `--teal` and `--line` matched only `border-color:`, because the census regex had no left boundary.
//     That is the same false positive already fixed once in `/color: var\(--hx-line\)/`.
//
// What survived is `--danger`, and it is a different KIND of finding from the accent.
describe('--danger — FIXED 2026-07-27 by splitting the token, not by repainting it', () => {
  const DANGER_GROUNDS = '#c8413f'; // HEXTECH_GROUNDS, shared by all five colour themes
  const DANGER_BASE = '#ff5252';    // theme.css / lazzuhTheme default

  // WHAT THE PIN HERE USED TO SAY, and why it is gone. `--danger` failed AA as text on every panel
  // stop (3.71 / 3.44 / 3.06). The obvious repair — pick a lighter red — does not work, because the
  // SAME token is also used as a FILL with a white label, and the two demands move apart:
  //
  //     #c8413f   text on panel-3  3.06 fail  |  white label on it as a fill  4.90 pass
  //     #e77a79   text on panel-3  5.32 pass  |  white label on it as a fill  2.82 fail
  //
  // So the token was split into three (see `app/dnd/_sheet/contrast.ts`): `--danger` keeps the identity
  // colour for fills and borders, `--danger-ink` is derived per theme for text, `--danger-on` is derived
  // for a label sitting on a danger fill. The derivation runs in `themeToCssVars`, so it covers skin ×
  // theme combinations nobody enumerated — which matters because `themeVariantsFor` lets every
  // non-streamer skin wear any of the five universal themes.
  //
  // Contrast is now asserted over ALL themes × accents in `theme-contrast-alternates.test.ts`. What
  // stays here is the part that file cannot express: why the identity value is still "wrong" and must
  // remain so.

  it('the base default clears AA on every panel stop', () => {
    for (const bg of Object.values(PANELS)) {
      expect(contrastRatio(DANGER_BASE, bg)!).toBeGreaterThanOrEqual(AA);
    }
  });

  it('the identity colour STILL fails as text — and is deliberately left that way', () => {
    // Not a regression: `--danger` is now only ever a fill, a border or the codex HP bar, all of which
    // need 3:1, and all of which it clears. Changing it would alter the design for no accessibility
    // gain. This asserts the failing number on purpose, so nobody "fixes" the identity token later and
    // quietly breaks the white labels that sit on it.
    const worst = Math.min(...Object.values(PANELS).map((bg) => contrastRatio(DANGER_GROUNDS, bg)!));
    expect(worst).toBeLessThan(AA);
    expect(worst).toBeCloseTo(3.06, 1);
    // …while clearing the 3:1 bar that a non-text use actually has to meet.
    expect(worst).toBeGreaterThanOrEqual(3);
  });

  it('every colour theme inherits that override, so all five carry it', () => {
    // `danger` is not overridden per-theme; it comes from the shared grounds. One fix covers five themes.
    for (const [label, theme] of THEMES) {
      expect(theme.colors?.danger ?? DANGER_GROUNDS, `${label}`).toBe(DANGER_GROUNDS);
    }
  });

  it('it paints small error text, so the 3:1 large-text exemption does not rescue it', () => {
    // `.dnd-sheet .tp-err { font-size: 12px }` — 12px, weight 400. This is why the text alternate had
    // to clear 4.5 and not 3, and it is the reason the split was necessary at all.
    expect(aaThresholdForSize(12, false)).toBe(4.5);
  });

  it('and every text site now reads the alternate, not the identity token', () => {
    // The fix is only real if the stylesheet actually consumes it. `.tp-err` is the 12px error text the
    // threshold above is about; if it ever goes back to `var(--danger)` this fails.
    const css = readFileSync(join(process.cwd(), 'app/dnd/_sheet/styles/theme.css'), 'utf8');
    expect(css).toMatch(/\.tp-err\s*\{[^}]*color:\s*var\(--danger-ink, var\(--danger\)\)/);
    // No `color:` may point at the bare identity token anywhere in the sheet stylesheet. (`border-color`
    // and `background` still may, and must — hence the negative lookbehind on the hyphen.)
    const bareTextUses = [...css.matchAll(/(^|[^-\w])color:\s*var\(--danger\)/g)];
    expect(bareTextUses.map((m) => m[0]), 'a text site regressed to the identity colour').toEqual([]);
  });

  it('measured live at 3.02 on a Reset button, which is where this was first seen', () => {
    // The live reading composites through the button's own tint, so it lands a little under the
    // flat-panel figure. Pinned as the observation, not re-derived. That tint is now
    // `rgba(var(--danger-rgb), 0.14)` rather than a hardcoded red, so it follows the character's
    // palette — which is also what makes the derived alternate's arithmetic match what is painted.
    expect(contrastRatio(DANGER_GROUNDS, '#2f2433')!).toBeCloseTo(3.02, 1);
  });
});

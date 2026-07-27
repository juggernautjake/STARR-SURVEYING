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
import { contrastRatio, aaThresholdForSize } from '@/lib/dnd/theme-contrast';
import {
  hextechTheme, hextechShadowIsles, hextechNoxus, hextechFreljord, hextechVoidProphet,
} from '@/app/dnd/_sheet/theme';

/** `.sec-num` is 13px / weight 400 — squarely under the large-text exemption. */
const AA = aaThresholdForSize(13, false);

/** The grounds every colour theme shares (HEXTECH_GROUNDS), and the stops a section head sits on. */
const PANELS = { panel: '#0a1626', 'panel-2': '#0e1e30', 'panel-3': '#12283f' } as const;

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
  for (const [label, theme] of THEMES) {
    const hotpink = theme.colors?.hotpink;

    it(`${label}: defines the accent at all`, () => {
      expect(hotpink, `${label} has no hotpink`).toBeTruthy();
    });

    for (const [stop, bg] of Object.entries(PANELS)) {
      const key = `${label} on ${stop}`;
      const gap = KNOWN_GAPS[key];
      // `it.fails` asserts the case DOES fail. Fixing the palette flips it to "expected to fail but
      // passed", which is the signal to delete the KNOWN_GAPS entry — the gap cannot rot silently.
      const runner = gap === undefined ? it : it.fails;

      runner(`${label}: accent ${hotpink} on ${stop}${gap === undefined ? '' : ` (known ${gap})`}`, () => {
        expect(contrastRatio(hotpink!, bg)!).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it('the pinned gaps still measure what they were pinned at', () => {
    // Guards the other direction: if a palette edit moves one of these without closing it, the recorded
    // number stops matching and this says so, rather than the pin quietly covering a different value.
    for (const [label, theme] of THEMES) {
      for (const [stop, bg] of Object.entries(PANELS)) {
        const expected = KNOWN_GAPS[`${label} on ${stop}`];
        if (expected === undefined) continue;
        expect(contrastRatio(theme.colors!.hotpink!, bg)!, `${label} on ${stop}`).toBeCloseTo(expected, 1);
      }
    }
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
  it('each failing theme already carries a lighter sibling in the same hue', () => {
    // Every one of these palettes defines `pink` as the lighter partner of `hotpink`. Where the accent is
    // too dark to read, its own `pink` is the natural substitute for the TEXT uses: same hue, same family,
    // already part of the theme. This asserts the option is real, so the fix is a one-token swap and not a
    // colour-picking exercise. (Whether to take it is the owner's call — it changes how the theme looks.)
    for (const [label, theme] of THEMES) {
      const hotpink = theme.colors?.hotpink;
      const pink = theme.colors?.pink;
      if (!hotpink || !pink) continue;
      const accent = contrastRatio(hotpink, PANELS['panel-2'])!;
      if (accent >= AA) continue; // already fine, nothing to substitute
      expect(contrastRatio(pink, PANELS['panel-2'])!, `${label} pink ${pink} is a usable ink`)
        .toBeGreaterThanOrEqual(AA);
    }
  });
});

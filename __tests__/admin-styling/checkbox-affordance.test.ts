// __tests__/admin-styling/checkbox-affordance.test.ts
//
// ── EVERY CHECKBOX IN THE ADMIN WAS A CIRCLE ────────────────────────────────────────────────────
//
// Two deliberate decisions about one control lived ~1,000 lines apart in `AdminLayout.css` and
// disagreed with each other:
//
//   ~line 350   `checkbox-radio-reset-2026-06-21` — resets to native so every control reads as
//               *"proper, perfectly round (radio) or square (checkbox)"*, in its own comment.
//   ~line 1376  *"Global Checkbox Styles (circle / dot design)"* — re-styled every checkbox as a
//               circle with a round dot.
//
// At equal specificity the later rule wins on source order, so the reset was silently defeated.
// Radios are round and were untouched, so the two controls looked identical while meaning opposite
// things: a radio says *pick one of these*, a checkbox says *pick any number of these*.
//
// It surfaced in a research screenshot — a document list with "Select all" / "Deselect all" beside
// controls shaped like radio buttons — and was recorded rather than fixed there, correctly, because
// one screenshot is not grounds for a product-wide change.
//
// ── WHY THIS IS A TEST AND NOT JUST A FIX ───────────────────────────────────────────────────────
//
// The circle was not an accident. Somebody wrote it on purpose, with a heading. The reason it needs
// a guard rather than only a correction is that the same thing has already happened once: a
// deliberate reset was overwritten by a later deliberate block, and NOTHING anywhere noticed for
// months. The next person with a design opinion about checkboxes will land in the same file.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS = path.join(process.cwd(), 'app', 'admin', 'styles', 'AdminLayout.css');
const raw = fs.readFileSync(CSS, 'utf8');

/** Comments stripped, length-preserving. This file now EXPLAINS the circle at length, and a raw
 *  scan reads the explanation as the offence — the twelfth instance in this repository. */
const css = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/**
 * The declarations inside every rule whose selector list mentions `input[type="<t>"]`.
 *
 * Selector-aware rather than a text search: `border-radius: 50%` appears dozens of times in this
 * 1,800-line file, on avatars, badges and dots, and "does the file contain a 50%" is a question
 * with no useful answer.
 *
 * `only: true` drops rules that target BOTH controls, which is the right filter when asking what
 * makes a checkbox different from a radio. It is the WRONG filter for asking whether radios are
 * styled at all — the first version of this test used it for both and reported zero radio rules,
 * because the only rule that styles radios is the shared `checkbox-radio-reset` that names both.
 * The scan was wrong, not the stylesheet.
 */
function declarationsFor(type: 'checkbox' | 'radio', opts: { only?: boolean } = {}): string[] {
  const other = type === 'checkbox' ? 'radio' : 'checkbox';
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!;
    if (!selector.includes(`input[type="${type}"]`)) continue;
    if (opts.only && selector.includes(`input[type="${other}"]`)) continue;
    out.push(m[2]!);
  }
  return out;
}

describe('a checkbox is square and a radio is round', () => {
  /** Rules that shape the checkbox and not the radio — where the difference has to live. */
  const checkboxRules = declarationsFor('checkbox', { only: true });
  /** Every rule that touches a radio, shared ones included. */
  const radioRules = declarationsFor('radio');

  it('control: the stylesheet was read and both controls are styled in it', () => {
    // Without this every assertion below passes vacuously against an empty list — which is exactly
    // how a rule can be "verified" by a scan that could not have found it.
    expect(raw.length).toBeGreaterThan(20000);
    expect(checkboxRules.length, 'no checkbox-only rules found at all').toBeGreaterThan(3);
    expect(radioRules.length, 'no rule anywhere styles a radio').toBeGreaterThan(0);
  });

  it('control: comment-stripping worked, so the prose explaining the circle is not scanned', () => {
    expect(css).not.toContain('circle / dot design');
    expect(css, 'stripping removed the code as well').toContain('input[type="checkbox"]');
  });

  it('no checkbox rule makes the box round', () => {
    const round = checkboxRules.filter((d) => /border-radius:\s*(50%|9999px|999px)/.test(d));
    expect(round, `a checkbox rule sets a pill/circle radius:\n${round.join('\n---\n')}`).toEqual([]);
  });

  it('and the checkbox does carry a small square radius, so the rule is present rather than absent', () => {
    // "No round rule" is also true of a stylesheet with no checkbox styling at all. This is the
    // positive half: the custom control still exists, it is just square now.
    const withRadius = checkboxRules.filter((d) => /border-radius:/.test(d));
    expect(withRadius.length, 'the checkbox has no border-radius rule at all').toBeGreaterThan(0);
    for (const d of withRadius) {
      const value = d.match(/border-radius:\s*([^;]+)/)![1]!.trim();
      // 0 is fine; anything up to 4px is fine; a percentage is not.
      expect(value, `checkbox border-radius "${value}" is not a small square corner`)
        .toMatch(/^(0|[0-4](\.\d+)?px)$/);
    }
  });

  it('the checked mark is a tick, not a dot', () => {
    // A round dot inside a square box is a radio wearing a square, which is worse than either.
    const checkedAfter = css.match(/input\[type="checkbox"\]:checked::after[^{]*\{([^}]*)\}/);
    expect(checkedAfter, 'nothing draws the checked state').toBeTruthy();
    const body = checkedAfter![1]!;
    expect(body, 'the checked mark is still a round dot').not.toMatch(/border-radius:\s*50%/);
    // Two borders of a rotated box is how a tick is drawn without a font.
    expect(body).toMatch(/border-width:\s*0 \d/);
    expect(body).toMatch(/rotate\(45deg\)/);
  });

  it('a radio is still round, because that is what a radio is', () => {
    // The fix must not have swept the radios square along with the checkboxes. `appearance: auto`
    // hands them back to the platform, which draws them round; an explicit 50% is also fine.
    const nativeAgain = radioRules.some((d) => /appearance:\s*auto/.test(d));
    const explicitlyRound = radioRules.some((d) => /border-radius:\s*50%/.test(d));
    expect(nativeAgain || explicitlyRound,
      'radios are neither native nor explicitly round — they may now look like checkboxes').toBe(true);
  });

  it('and no rule squares a radio off', () => {
    // The other direction: `appearance: auto` somewhere does not help if a later rule gives the
    // radio a 3px corner. Same source-order trap that caused the original bug.
    const squared = radioRules.filter((d) => /border-radius:\s*[0-4](\.\d+)?px/.test(d));
    expect(squared, `a radio rule gives it square corners:\n${squared.join('\n---\n')}`).toEqual([]);
  });

  it('control: this check would notice a square radio', () => {
    const fakeRadio = ['appearance: none; border-radius: 3px;'];
    const ok = fakeRadio.some((d) => /appearance:\s*auto/.test(d) || /border-radius:\s*50%/.test(d));
    expect(ok).toBe(false);
  });

  it('control: this check would notice a round checkbox', () => {
    const fake = ['appearance: none; border-radius: 50%;'];
    expect(fake.filter((d) => /border-radius:\s*(50%|9999px|999px)/.test(d))).toHaveLength(1);
  });
});

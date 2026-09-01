// __tests__/research/validation-notices-agree.test.ts — Phase C2.
//
// Two inline validation messages sit on the same block of the New Research Project form:
//
//   · the COUNTY checker  — "That is the state, not the county"      (AdminResearch.css)
//   · the PLACES notice   — "Address suggestions are unavailable…"   (AddressAutocomplete.css)
//
// They are the same KIND of message — a field-level caution about the address block — and they were
// arriving in different ambers: #FEF3C7 hardcoded here against `--color-warning-bg` (#FFFBEB)
// there. Two shades of warning on one form reads as two severities, and there is only one.
//
// ── AND ONE OF THE TOKENS DID NOT EXIST ─────────────────────────────────────────────────────────
//
// `AddressAutocomplete.css` read `var(--color-warning-border, #FDE68A)` and
// `--color-warning-border` was defined NOWHERE. It rendered — the fallback saw to that — so nothing
// ever failed. The token was simply a fiction, and a theme change would have moved the notice's
// background while leaving its border behind.
//
// That is the quiet half of the bug that once had 16 theme tokens read by 159 rules and defined
// nowhere. The loud half renders as nothing and gets noticed. This half renders correctly and
// silently opts out of theming.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TOKENS = read('app/styles/tokens.css');
const RESEARCH = read('app/admin/styles/AdminResearch.css');
const AUTOCOMPLETE = read('app/admin/components/AddressAutocomplete.css');

/** The declaration block for one class, up to its closing brace. */
function ruleFor(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `${selector} should exist`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}

describe('the status tokens the notices read are actually defined', () => {
  it('defines every status BORDER token', () => {
    // --color-warning-border was read for as long as AddressAutocomplete.css has existed and
    // defined for none of it. The other three are added alongside so the set is complete rather
    // than patched at the one place that happened to be noticed.
    for (const t of ['success', 'warning', 'error', 'info']) {
      expect(TOKENS, `--color-${t}-border is missing`).toContain(`--color-${t}-border:`);
    }
  });

  it('defines the bg and text tokens the notices read', () => {
    // Still asserted to EXIST: 200-odd sites outside the research portal read it, and this test
    // is not the place to claim they have all moved. What is asserted below is that the two
    // notices agree with each other, on the themed pair.
    expect(TOKENS).toContain('--color-warning-bg:');
    expect(TOKENS).toContain('--color-warning-text:');
  });
});

describe('the two notices agree', () => {
  const county = ruleFor(RESEARCH, '.research-modal__county-note--warn');
  const places = ruleFor(AUTOCOMPLETE, '.address-autocomplete__notice');

  it('the county note reads tokens rather than hardcoding hex', () => {
    // The token NAMES moved on 2026-08-31. `--color-warning-bg` is defined once, in tokens.css,
    // and in no palette block — so it stayed a fixed cream while `--color-warning-text` followed
    // the theme, and a dark palette put light text on a pale panel: 1.31:1, measured on the GIS
    // quality card that shares this pair. `themes.css` had already solved it under the
    // `-surface` name (THEME-STATUS-PAIRS-2026-08-24) before the C2 slice added the second,
    // unthemed family without knowing. The property this test protects is unchanged; the pair it
    // names is the themed one now.
    expect(county).toContain('var(--color-warning-surface');
    expect(county).toContain('color-mix(in srgb, var(--color-warning-text)');
    expect(county).toContain('var(--color-warning-text');
  });

  it('both use the same background token — one severity, one colour', () => {
    expect(county).toContain('--color-warning-surface');
    expect(places).toContain('--color-warning-surface');
  });

  it('both use the same border token', () => {
    // Derived from the token that IS themed, which is the pattern PageOffGate.css established. A
    // fixed #FDE68A border around a dark panel is the same defect one layer out.
    const derived = 'color-mix(in srgb, var(--color-warning-text) 25%, transparent)';
    expect(county).toContain(derived);
    expect(places).toContain(derived);
  });

  it('neither hardcodes the amber it used to', () => {
    // #FEF3C7 was the county note's literal; keeping it anywhere in these two rules would mean the
    // two messages can drift apart again the next time a theme moves.
    expect(county, 'county note still carries a literal amber').not.toMatch(/#FEF3C7/i);
  });
});

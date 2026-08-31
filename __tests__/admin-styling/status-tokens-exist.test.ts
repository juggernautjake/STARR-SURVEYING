// __tests__/admin-styling/status-tokens-exist.test.ts
//
// ── A BOUNDED FAMILY, WHICH IS WHY THIS GUARD IS SAFE TO HAVE ───────────────────────────────────
//
// Phase C2 measured every custom property in `app/**` and found ~38 read with a fallback and defined
// nowhere — then deliberately did NOT build a guard on that number, because it over-reports: `--p-x`
// is set from JavaScript in `EmployeePond.tsx`, `--theme-` matched a regex artefact, and a check
// that cries wolf is a check nobody runs. That reasoning still holds.
//
// This is the part of it that IS safe to enforce: the status ramp is a closed grid — four meanings
// (success, warning, error, info) across four slots (bg, text, border, surface). Nothing sets these
// from JavaScript, none is a prefix of anything else, and every legitimate member is one line in
// `tokens.css`. A name in this shape that no file defines is unambiguously a typo, never a
// deliberate runtime value.
//
// ── WHAT IT HAS ALREADY CAUGHT ──────────────────────────────────────────────────────────────────
//
//   · `--color-warning-border` (C2) — read by `AddressAutocomplete.css` since the day that file was
//     written, defined nowhere. It RENDERED, because of the fallback, so nothing ever failed.
//   · `--color-danger-text` / `--color-danger-bg` (E2) — six rules across jobs, learn, marketing,
//     receipts and research. The real family is `--color-error-*`. Note that bare `--color-danger`
//     IS defined, twelve times, which is exactly what made the invented suffixes look plausible.
//
// The failure mode is the quiet one: CSS answers a missing variable with the fallback, silently and
// for ever. The rule looks converted, reviews as converted, and paints one literal on all twelve
// palettes. Nothing errors, and only a theme change reveals it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** Every file that could DEFINE a token. */
const DEFINING = ['app/styles/tokens.css', 'app/styles/themes.css', 'app/styles/globals.css'];

/** The closed grid. A name matching this shape is a member of the family or a typo — nothing else. */
const STATUS_TOKEN = /--color-(success|warning|error|info|danger)-(bg|text|border|surface)\b/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(css|tsx|ts)$/.test(e.name)) out.push(full);
  }
  return out;
}

const defined = new Set<string>();
for (const f of DEFINING) {
  for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/^\s*(--color-[a-z-]+)\s*:/gm)) {
    defined.add(m[1]);
  }
}

describe('the status ramp is a closed grid', () => {
  it('has a control — a token known to exist is seen as defined', () => {
    // Without this, a broken `defined` set would report the whole repo as clean and this file would
    // pass for ever while measuring nothing. Every negative result needs a positive to stand on.
    expect(defined.has('--color-error-text'), 'the definition scan itself is broken').toBe(true);
    expect(defined.size).toBeGreaterThan(8);
  });

  it('every status token READ anywhere is DEFINED somewhere', () => {
    const missing: string[] = [];
    for (const file of walk(path.join(ROOT, 'app'))) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(STATUS_TOKEN)) {
        if (!defined.has(m[0])) {
          missing.push(`${path.relative(ROOT, file).split(path.sep).join('/')}: ${m[0]}`);
        }
      }
    }
    expect(
      [...new Set(missing)].sort(),
      'These paint their literal fallback on every palette. CSS answers a missing variable with the '
      + 'fallback silently and for ever, so the rule looks converted and reviews as converted. '
      + 'Either define it in tokens.css beside its siblings, or use the name that exists.',
    ).toEqual([]);
  });

  it('the four meanings each have their four slots, so a caller can pair them', () => {
    // `-text` on `-bg` is the documented pairing in tokens.css. A meaning missing a slot sends the
    // next person to invent one — which is precisely how --color-danger-text came to exist.
    const gaps: string[] = [];
    for (const tone of ['success', 'warning', 'error', 'info']) {
      for (const slot of ['bg', 'text', 'border', 'surface']) {
        if (!defined.has(`--color-${tone}-${slot}`)) gaps.push(`--color-${tone}-${slot}`);
      }
    }
    expect(gaps, 'an incomplete ramp is an invitation to invent a name').toEqual([]);
  });
});

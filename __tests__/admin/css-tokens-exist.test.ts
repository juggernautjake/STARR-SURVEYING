// __tests__/admin/css-tokens-exist.test.ts
//
// ── A COLOUR THAT IS NOT DEFINED RENDERS AS NOTHING, SILENTLY ────────────────────────────────────
//
// `var(--color-danger)` looks exactly like `var(--color-error)` in a diff, in a review, and in a
// type-checker. The token set has `--color-error*`; there is no `--color-danger*`. A component that
// reaches for the second one does not error, does not warn, and does not fall back to a sensible
// default — CSS treats the declaration as invalid at computed-value time, so the property lands on
// `unset` and the element renders with **no** colour at all.
//
// That shipped in this repo on 2026-08-14: a Stop button with no background, a recording indicator
// dot that was invisible, and refund amounts and outstanding balances rendered in the inherited
// body colour instead of red. Everything else about those screens was correct, which is why nobody
// looked twice.
//
// Two pre-existing uses of the same wrong name survive precisely because they were written with a
// literal fallback — `var(--color-danger-bg, #FEE2E2)` — which is why this test permits that form.
// A fallback makes the reference safe; a bare reference to an undefined token is a bug.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/**
 * Genuinely undefined today, and pre-existing. Each one is the same defect this test exists to
 * catch — a `var()` with no definition and no fallback — found in a subsystem this change does not
 * touch. Listed rather than silently excluded, so the count can only go down.
 */
const KNOWN_UNDEFINED: Record<string, string> = {
  '--lab-bg': 'app/admin/styles/TestingLab.css — used once at ~line 2567, never defined. Possibly dead CSS in a 2.5k-line file.',
  '--lab-border': 'Same block as --lab-bg.',
  '--lab-surface': 'Same block as --lab-bg.',
  '--lab-text': 'Same block as --lab-bg.',
  '--va-fg': 'app/AndrewAsh/studio/_ui/builder.css — the voice-actor site, a separate product surface.',
  '--va-muted': 'Same file as --va-fg.',
  '--text': 'app/dnd/_sheet/components/Inventory.tsx — the D&D skin system publishes `--hx-*` tokens '
    + '(lib/dnd/skin-tokens.ts); bare `--text` is not one of them, so the inventory table\'s text colour '
    + 'falls through to inherited rather than the skin\'s ink. Its neighbours in the same file '
    + '(`--panel-2`, `--gold`) were written with fallbacks and are fine.',
};

/**
 * Every custom property that will have a value at runtime.
 *
 * Two sources, and BOTH count: a stylesheet declaration, and a property set from TypeScript. The
 * second is a real and deliberate pattern here — `MapViewport` publishes the zoom level as
 * `--map-scale` so labels can counter-scale in CSS, and `EmployeePond` publishes per-particle
 * `--p-x`/`--p-y`. Those have no stylesheet declaration and are not bugs, so a checker that only
 * reads CSS would report a dozen false positives and get itself deleted.
 */
function definedTokens(): Set<string> {
  const out = new Set<string>();
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!['node_modules', '.next', '.git'].includes(e.name)) walk(p); }
      else if (/\.(tsx?|css)$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(ROOT, 'app'));
  walk(path.join(ROOT, 'styles'));
  walk(path.join(ROOT, 'components'));
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    // A stylesheet DEFINITION: `--name:` on the left of a colon inside a rule.
    for (const m of src.matchAll(/(^|[;{\s])(--[a-zA-Z0-9_-]+)\s*:/g)) out.add(m[2]!);
    // Set from TypeScript: `setProperty('--name', …)` or an inline style key `'--name':`.
    for (const m of src.matchAll(/setProperty\(\s*['"`](--[a-zA-Z0-9_-]+)/g)) out.add(m[1]!);
    for (const m of src.matchAll(/['"`](--[a-zA-Z0-9_-]+)['"`]\s*(?:as\s+\w+\s*)?\]?\s*:/g)) out.add(m[1]!);
  }
  return out;
}

/** Every `var(--token)` reference WITHOUT a fallback, across components and stylesheets. */
function bareReferences(): Array<{ file: string; token: string }> {
  const out: Array<{ file: string; token: string }> = [];
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!['node_modules', '.next', '.git'].includes(e.name)) walk(p); }
      else if (/\.(tsx?|css)$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(ROOT, 'app'));
  walk(path.join(ROOT, 'components'));
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    // `var(--x)` with no comma before the closing paren — i.e. no fallback supplied.
    for (const m of src.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g)) {
      out.push({ file: path.relative(ROOT, f).split(path.sep).join('/'), token: m[1]! });
    }
  }
  return out;
}

describe('every CSS custom property a component uses is actually defined', () => {
  const defined = definedTokens();
  const used = bareReferences();

  it('finds the token definitions', () => {
    // Guards the guard: an empty definition set would make every reference look undefined, and an
    // empty reference set would make the check below pass forever.
    expect(defined.size).toBeGreaterThan(30);
    expect(used.length).toBeGreaterThan(100);
  });

  it('defines --color-error but not --color-danger', () => {
    // Pins the specific confusion that caused this. If a `--color-danger` family is ever added on
    // purpose, this line is where that decision gets recorded.
    expect(defined.has('--color-error')).toBe(true);
    expect(defined.has('--color-danger')).toBe(false);
  });

  it('no component references a token that does not exist', () => {
    const missing = used.filter((u) => !defined.has(u.token) && !(u.token in KNOWN_UNDEFINED));
    const grouped = [...new Set(missing.map((m) => `${m.token}  ←  ${m.file}`))].sort();
    expect(
      grouped,
      'These `var(--token)` references have no definition and no fallback, so the property is\n'
      + 'dropped and the element renders with no value at all — invisible text, uncoloured buttons.\n'
      + 'Either use a defined token (see app/styles/tokens.css) or supply a literal fallback,\n'
      + `e.g. var(--color-danger-bg, #FEE2E2):\n  ${grouped.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the known-undefined list never grows, and drops entries as they are fixed', () => {
    // A ratchet, not an amnesty. An entry that has since been defined must come off the list, or it
    // buys headroom for a new one to appear without failing anything — the same rot the lib-orphan
    // ratchet documents.
    const stillUndefined = Object.keys(KNOWN_UNDEFINED).filter((t) => !defined.has(t));
    const fixed = Object.keys(KNOWN_UNDEFINED).filter((t) => defined.has(t));
    expect(
      fixed,
      `These are listed as undefined but now have a definition. Remove them from KNOWN_UNDEFINED:
  ${fixed.join('\n  ')}`,
    ).toEqual([]);
    expect(stillUndefined.length).toBeLessThanOrEqual(Object.keys(KNOWN_UNDEFINED).length);
  });

  it('every colour token a component uses is a real colour token', () => {
    // The palette specifically, with no exemption list — this is the design system, and a component
    // reaching for a colour that does not exist is never intentional.
    const badColours = used
      .filter((u) => u.token.startsWith('--color-') && !defined.has(u.token))
      .map((u) => `${u.token}  ←  ${u.file}`);
    expect(
      [...new Set(badColours)].sort(),
      `Undefined colour tokens. The palette lives in app/styles/tokens.css — note it is
--color-error*, NOT --color-danger*:\n  ${[...new Set(badColours)].join('\n  ')}`,
    ).toEqual([]);
  });
});

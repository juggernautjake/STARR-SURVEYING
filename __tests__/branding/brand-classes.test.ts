// __tests__/branding/brand-classes.test.ts
//
// ── THIRTY-NINE CLASSES THAT RENDERED NOTHING ───────────────────────────────────────────────────
//
// Measured 2026-09-01, before this file existed: 145 distinct `brand-*` classes are used in a
// `className` somewhere under `app/admin/branding`, and **39 of them resolved to no rule in any
// stylesheet in the repository.** The whole "Add a design" tab — the drop zone, the colour picker,
// the field labels, the resolution list, the primary button — was complete, correct React that
// rendered as unstyled text on a white page.
//
// One of the 39, `.brand-profile__text`, is used by `LogosTab.tsx`, which was already merged and
// live. So this was never a property of the new work. It is a property of CSS: a class name that
// matches nothing is not an error in any language involved.
//
// `tsc` cannot see it. `next build` cannot see it. Every existing test in `brand-system.test.ts`
// passed throughout. The only thing that catches it is holding the two sides against each other,
// which is the shape of every defect this repository has found in the last week.
//
// ── WHY THIS SCANS BOTH DIRECTIONS ──────────────────────────────────────────────────────────────
//
// Used-but-undefined is the bug that shipped. Defined-but-unused is the one that arrives next: a
// slice renames `brand-drop__lede`, the old rule stays, and 40 lines of dead CSS accumulate until
// nobody can tell which rules matter. Neither direction alone keeps the file honest.
//
// The unused direction is a WARNING LIST with an allowlist, not a hard failure, because a handful
// of rules are legitimately reached without a literal `className` — see `REACHED_INDIRECTLY`.
//
// ── THE CONTROLS ARE NOT OPTIONAL ───────────────────────────────────────────────────────────────
//
// Fourteen-plus times in this repository a check has reported a clean result from a scan that could
// not have produced a dirty one — a regex matching nothing, a directory that did not exist, a
// mutation that never applied. Three controls below assert the scanner finds what it must find,
// and one asserts it would fail on a class that genuinely has no rule.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PORTAL_DIR = path.join(ROOT, 'app', 'admin', 'branding');
const APP_DIR = path.join(ROOT, 'app');

function walk(dir: string, ext: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

/**
 * Every `brand-*` token that appears inside a `className`, mapped to the file that uses it.
 *
 * Deliberately NOT a bare `\bbrand-[\w-]+` scan of the whole file. That version was written first
 * and it is wrong in both directions at once: it picks up `brand-upload-name` (an element `id`
 * passed to `htmlFor`), `brand-tab-${t.id}` (an `id` template), and the words `brand-kit` and
 * `recolour-brand-marks.mjs` out of prose and code comments — nine false positives out of 48 — and
 * it would keep passing if somebody moved a class into a variable.
 *
 * Reading only `className=` is narrower and truthful about what it covers: a class assembled in a
 * variable is outside this check, and the test says so rather than pretending otherwise.
 */
function usedClasses(): Map<string, string> {
  const used = new Map<string, string>();
  for (const file of walk(PORTAL_DIR, '.tsx')) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);

    for (const m of src.matchAll(/className=/g)) {
      const expr = classNameExpression(src, m.index! + 'className='.length);
      // Every string literal inside the expression, whichever quote style. A ternary
      // (`cond ? 'a b' : 'a'`), a concatenation and a template all reduce to their literal parts,
      // which is where class names live in all three.
      for (const lit of expr.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
        const raw = lit[1] ?? lit[2] ?? lit[3] ?? '';
        for (const tok of raw.split(/[\s${}]+/)) {
          // A trailing dash means the token is the fixed HALF of an interpolation —
          // `brand-plate--${a.plate}` yields `brand-plate--`, which is not a class anybody wrote.
          // The suffixes it can take are checked by the modifier rule in the orphan direction.
          if (!/^brand-[A-Za-z0-9_-]*[A-Za-z0-9_]$/.test(tok)) continue;
          if (!used.has(tok)) used.set(tok, rel);
        }
      }
    }
  }
  return used;
}

/**
 * The expression after `className=` — either a quoted string or a braced expression, read to its
 * matching brace.
 *
 * A fixed slice of the following N characters was the first version and it is quietly wrong: too
 * short and it truncates a ternary mid-literal, too long and it swallows the next attribute's
 * strings and reports classes as used that are not. Counting braces is exact.
 */
function classNameExpression(src: string, at: number): string {
  if (src[at] === '"' || src[at] === "'") {
    const end = src.indexOf(src[at]!, at + 1);
    return end === -1 ? '' : src.slice(at, end + 1);
  }
  if (src[at] !== '{') return '';
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(at + 1, i);
    }
  }
  return '';
}

/** Every class SELECTOR defined anywhere in the app's stylesheets. */
function definedClasses(): Set<string> {
  const defined = new Set<string>();
  for (const file of walk(APP_DIR, '.css')) {
    const css = fs.readFileSync(file, 'utf8');
    // Strip comments first. The header of Branding.css names `.brand-plate` and half a dozen other
    // classes while explaining the pinned-colour rule; a raw scan reads that prose as a definition
    // and reports every class the file happens to discuss as defined. Eleventh instance in this
    // repository of a check matching its own explanation.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(/\.(brand-[A-Za-z0-9_-]+)/g)) defined.add(m[1]!);
  }
  return defined;
}

/**
 * Classes with a rule that no `className=` literal names.
 *
 * Each is reached another way, and each entry says which — an entry with no reason is how an
 * allowlist becomes a place to hide failures.
 */
const REACHED_INDIRECTLY: Record<string, string> = {
  'brand-spin-kf': 'the @keyframes name behind .brand-spin, not a class at all',
};

describe('every class the branding portal renders has a rule', () => {
  const used = usedClasses();
  const defined = definedClasses();

  it('control: the scanner actually found classes on both sides', () => {
    // Without this, an empty `used` map or an empty `defined` set makes every assertion below pass
    // vacuously — which is exactly how 39 undefined classes lived through a green suite.
    expect(used.size, 'no brand-* classes parsed out of app/admin/branding/**.tsx')
      .toBeGreaterThan(100);
    expect(defined.size, 'no brand-* selectors parsed out of app/**/*.css').toBeGreaterThan(100);
  });

  it('control: the scanner sees a class it must see, on each side', () => {
    // Two names picked because they are load-bearing and unlikely to be renamed casually.
    expect(used.has('brand-plate'), 'the used-scan missed .brand-plate').toBe(true);
    expect(defined.has('brand-plate'), 'the defined-scan missed .brand-plate').toBe(true);
    // And one from the block this test was written for.
    expect(used.has('brand-drop'), 'the used-scan missed .brand-drop').toBe(true);
  });

  it('control: comment-stripping works, so prose cannot count as a definition', () => {
    const stripped = '/* .brand-invented-by-a-comment is discussed here */\n.brand-real {}'
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(stripped).not.toContain('brand-invented-by-a-comment');
    expect(stripped).toContain('.brand-real');
  });

  it('no class is used in a className without a CSS rule', () => {
    const missing = [...used.entries()].filter(([c]) => !defined.has(c));
    const detail = missing.map(([c, f]) => `  .${c}  ←  ${f}`).join('\n');
    expect(missing.map(([c]) => c),
      `these classes render nothing — used in a className, defined in no stylesheet:\n${detail}`)
      .toEqual([]);
  });

  it('control: this check would fail on a class with no rule', () => {
    // The mutation, run in-process rather than by editing a file: a class that certainly has no
    // rule must be reported. Without this the assertion above passes on a `defined` set that
    // happens to contain everything, and would keep passing if the CSS were deleted wholesale.
    const fake = 'brand-this-class-has-no-rule-anywhere';
    expect(defined.has(fake)).toBe(false);
    expect([fake].filter((c) => !defined.has(c))).toEqual([fake]);
  });

  it('and no brand rule is defined that nothing reaches', () => {
    // The other direction. A warning list rather than a hard equality: see REACHED_INDIRECTLY.
    const orphaned = [...defined]
      .filter((c) => !used.has(c) && !(c in REACHED_INDIRECTLY))
      // A modifier's base is used even when the modifier is only ever appended in a template.
      .filter((c) => !(c.includes('--') && used.has(c.split('--')[0]!)));
    expect(orphaned,
      `these rules exist and no className names them — dead CSS, or a rename that missed one:\n  ${orphaned.join('\n  ')}`)
      .toEqual([]);
  });
});

describe('the upload tab is mounted, not merely written', () => {
  // The repository's most common defect, and the reason this file's sibling checks the caller:
  // a component with passing tests that nothing renders. Assert that page.tsx imports and mounts
  // it, rather than that UploadTab imports its own helpers.
  const page = fs.readFileSync(path.join(PORTAL_DIR, 'page.tsx'), 'utf8');

  it('page.tsx imports UploadTab', () => {
    expect(page).toMatch(/import UploadTab from '\.\/_tabs\/UploadTab'/);
  });

  it('and renders it behind its own tab id', () => {
    expect(page).toContain("active === 'upload'");
    expect(page).toContain('<UploadTab />');
  });

  it('and the tab is declared, so it can be reached', () => {
    expect(page).toMatch(/id: 'upload'/);
  });

  it('control: a tab id that does not exist is not found', () => {
    expect(page).not.toContain("active === 'not-a-real-tab'");
  });
});

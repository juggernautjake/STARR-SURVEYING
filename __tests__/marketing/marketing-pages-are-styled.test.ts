// __tests__/marketing/marketing-pages-are-styled.test.ts
//
// `MarketingUploads.css` recorded this defect on 2026-08-06 and deferred the rest of it:
//
//     "the whole /admin/marketing sub-app is in the same state. Those are left for a deliberate pass"
//
// Three pages referenced class names that nothing defined, so they rendered as unstyled flow content
// from the day they were written. Nothing failed, no test broke, and no error appeared anywhere —
// which is exactly why it survived: "authored but not wired" produces working code that looks broken,
// and only a person opening the page can see it.
//
// This guards the whole class of defect rather than the three instances: EVERY class name the pages
// use must exist in a stylesheet. Add a `.mk__sparkline` to the JSX without styling it and this fails.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
// Line endings normalised on the way in. Git converts these files to CRLF in the working tree on
// Windows, so an assertion matching a literal '\n' inside a selector list passes on one machine and
// fails on another — a test that reports a defect the source does not have.
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const SHARED = read('app/admin/marketing/Marketing.css');
const UPLOADS = read('app/admin/marketing/MarketingUploads.css');
const ALL_CSS = `${SHARED}\n${UPLOADS}`;

const PAGES: Array<{ file: string; prefix: string }> = [
  // A1 (2026-08-11) — the four pages became tabs on /admin/marketing and their bodies moved to
  // . The old routes still exist as redirects, which load no stylesheet and have no markup,
  // so this guard follows the bodies rather than the URLs. The question it asks is unchanged: does
  // every marketing SURFACE load a stylesheet that defines the classes it uses.
  { file: 'app/admin/marketing/_tabs/DashboardTab.tsx', prefix: 'mk' },
  { file: 'app/admin/marketing/_tabs/SpendTab.tsx', prefix: 'ms' },
  { file: 'app/admin/marketing/_tabs/ExportsTab.tsx', prefix: 'mx' },
  { file: 'app/admin/marketing/_tabs/UploadsTab.tsx', prefix: 'mu' },
  // A5 (2026-08-12) — the trend chart is a fifth marketing SURFACE with its own mk__ classes.
  // It is a component rather than a tab body, and that distinction means nothing to the defect this
  // guard exists for: a class name nothing defines renders as unstyled flow content either way.
  { file: 'app/admin/marketing/_tabs/TrendChart.tsx', prefix: 'mk' },
];

describe('every marketing page loads a stylesheet', () => {
  it.each(PAGES)('$file imports one', ({ file }) => {
    const src = read(file);
    expect(/import\s+['"][^'"]*\.css['"]/.test(src), `${file} imports no stylesheet`).toBe(true);
  });
});

describe('every class name the pages use is actually defined', () => {
  it.each(PAGES)('$prefix__* classes all exist in CSS', ({ file, prefix }) => {
    const src = read(file);
    const used = new Set(
      [...src.matchAll(new RegExp(`\\b${prefix}__[a-z0-9-]+(?:--[a-z0-9-]+)?`, 'g'))].map((m) => m[0]),
    );
    expect(used.size, `no ${prefix}__ classes found — did the prefix change?`).toBeGreaterThan(3);

    const missing = [...used].filter((cls) => !ALL_CSS.includes(`.${cls}`));
    expect(
      missing,
      `these render unstyled because no rule defines them:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('the shared stylesheet behaves', () => {
  it('scopes every rule under a page root so nothing leaks into the admin shell', () => {
    // A bare `.panel` or `table {}` here would restyle screens this file has never heard of.
    //
    // Note `(__|\b)` rather than `\b` alone: an underscore IS a word character, so `\.mk\b` never
    // matches `.mk__title`. The first version of this assertion used `\b`, decided every rule in the
    // file was unscoped, and failed — a test wrong about the thing it was guarding.
    const withoutComments = SHARED.replace(/\/\*[\s\S]*?\*\//g, '');
    // `@keyframes` blocks are removed WHOLE before splitting. Their inner blocks are keyframe stops
    // — `0%`, `50%`, `from`, `to` — which look exactly like unscoped selectors to a split on '}' and
    // are nothing of the kind: a stop cannot match an element and cannot leak anywhere. Without
    // this, the guard rejects any animation in these pages, which is a rule it does not mean to
    // have. The nested-brace pattern is deliberate; `[\s\S]*?\}` would stop at the first inner one.
    const withoutKeyframes = withoutComments.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const selectors = withoutKeyframes
      .split('}')
      .map((block) => block.split('{')[0].trim())
      .filter((s) => s.length > 0 && !s.startsWith('@'));

    // `mkt` is listed FIRST and the separator class now includes `-`. Both matter, and neither is
    // cosmetic:
    //
    //   · A1 (2026-08-11) added the tabbed shell's `.mkt-shell` / `.mkt-tabs` / `.mkt-tab` classes.
    //     They ARE scoped — `mkt` is a distinct prefix — but the old pattern rejected them, so the
    //     guard would have forced a rename to satisfy a rule the new classes already obeyed.
    //   · Alternation is first-match: with `(mk|ms|mx|mkt)` the engine matches `mk` inside `.mkt-`,
    //     then demands a separator and finds `t`, and fails. `mkt` has to come before `mk`.
    //   · `-` joins the separator class because these use kebab-case rather than the older BEM
    //     `__`. Without it `.mkt-shell` reads as unscoped for the same reason.
    //
    // The rule being enforced is unchanged: no bare element or generic selector may sit in this
    // file and restyle screens it has never heard of.
    const unscoped = selectors.filter((s) => !/\.(mkt|mk|ms|mx)(__|[-\s,{:>])/.test(s));
    expect(unscoped, `unscoped selectors:\n  ${unscoped.join('\n  ')}`).toEqual([]);
  });

  it('lets wide tables scroll inside their own box', () => {
    // The page body must never scroll sideways.
    expect(SHARED).toMatch(/overflow-x:\s*auto/);
  });

  it('distinguishes an imported figure from a typed one', () => {
    // An estimate shown with the authority of a measurement is worse than no number at all.
    expect(SHARED).toMatch(/\.ms__tag--api/);
  });

  it('colours a warning amber rather than red', () => {
    // A manual-share note or a suspected duplicate is something to KNOW, not something that has gone
    // wrong. Red teaches people to dismiss the colour, and then the real errors go unread too.
    const warn = SHARED.slice(SHARED.indexOf('.mk__warn,\n.ms__warn {'));
    expect(warn).toMatch(/#fffbeb|#fde68a/);
  });

  it('stacks filter controls on a phone instead of squeezing them', () => {
    expect(SHARED).toMatch(/@media \(max-width: 767px\)/);
    expect(SHARED).toMatch(/flex-direction:\s*column/);
  });

  it('has a dark theme', () => {
    expect(SHARED).toMatch(/@media \(prefers-color-scheme: dark\)/);
  });
});

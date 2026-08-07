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
const UPLOADS = read('app/admin/marketing/uploads/MarketingUploads.css');
const ALL_CSS = `${SHARED}\n${UPLOADS}`;

const PAGES: Array<{ file: string; prefix: string }> = [
  { file: 'app/admin/marketing/page.tsx', prefix: 'mk' },
  { file: 'app/admin/marketing/spend/page.tsx', prefix: 'ms' },
  { file: 'app/admin/marketing/exports/page.tsx', prefix: 'mx' },
  { file: 'app/admin/marketing/uploads/page.tsx', prefix: 'mu' },
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
    const selectors = withoutComments
      .split('}')
      .map((block) => block.split('{')[0].trim())
      .filter((s) => s.length > 0 && !s.startsWith('@'));

    const unscoped = selectors.filter((s) => !/\.(mk|ms|mx)(__|[\s,{:>])/.test(s));
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

// __tests__/admin-styling/one-design-system.test.ts — a class is declared in one place.
//
// Phase X of docs/planning/completed/DESIGN_THEMES_2026-08-23.md.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// Twice in one codebase, the same accident: a fix was written into the file the author happened to
// be in, the older copy of the rule was left alone, and because the older copy lived in a
// route-scoped stylesheet that loads LAST, the fix reached everywhere except the pages it was
// written for.
//
//   `.admin-btn`      — the 2026-08-14 sizing fix landed in AdminLearn.css. Its own comment said it
//                       "fixes it in 45 files at once". Measured 2026-08-23: /admin/learn 40px,
//                       /admin/jobs 43.3px, /admin/employees 43.3px, /admin/research 43.3px beside
//                       a 40px field — the exact 3px mismatch the fix existed to remove.
//
//   `.research-tip`   — the 2026-06-20 portal slice moved the CSS to AdminLayout.css so tooltips
//                       would work on every admin page. AdminResearch.css kept the old copy and
//                       loads after it, so research routes still got the pre-fix size, the old
//                       inline-flex wrap, and the arrow nubs the new design had deliberately cut.
//
// Neither was caught by review, by 25,000 tests, or by looking at the page — the pages looked fine,
// they just looked fine in two different ways. Only measurement found them. So this gate is by
// measurement too: parse every stylesheet, and fail on any class declared in two files with
// different bodies that is not on the list below with a reason.
//
// ── ADDING TO THE LIST ──────────────────────────────────────────────────────────────────────────
//
// A new entry is a claim that two different definitions are intended. That is occasionally true.
// Write down which file wins and on which routes, because if you cannot state that, it is not a
// deliberate override — it is this bug again.

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { collectDeclarations, findRedefined, isFallbackPair } from '../../scripts/lib/css-conflicts.mjs';

const ROOT = process.cwd();

/** class -> why two definitions is correct, and which one wins where. */
const DELIBERATE: Record<string, string> = {
  // /admin/learn nests inside the admin layout, so AdminLearn.css always loads last and always
  // wins there. Learn has shipped a navy primary where the rest of admin uses the brand red. Left
  // alone deliberately rather than changed as a side effect of a CSS cleanup; three lines to delete
  // in AdminLearn.css if the answer is that learn should match everything else.
  'admin-btn--primary': 'learn skin: navy primary on /admin/learn, brand red everywhere else',
  'admin-btn--secondary': 'learn skin: outline secondary on /admin/learn, solid navy elsewhere',

  // AdminLearn.css ships a richer empty state (min-height, animated icon, softer border). It wins
  // on /admin/learn; AdminLayout.css's dashed card is what every other admin route shows.
  'admin-empty': 'learn ships a richer empty state; AdminLayout.css is the default elsewhere',
  'admin-empty__icon': 'part of the learn empty state above',
  'admin-empty__title': 'part of the learn empty state above',
  'admin-empty__desc': 'part of the learn empty state above',

  // AndrewAsh is a separate app in this repo. Its layouts nest, so the deeper sheet wins on the
  // deeper route — stated in comments at both declaration sites.
  vaGuideSources: 'AndrewAsh: guide.css wins on /studio/guide, studio.css on other studio routes',
  vaInvoiceTotals: 'AndrewAsh: studio.css 340px wins under /studio, voice.css 320px outside it',
};

const { declarations, duplicateProps } = collectDeclarations([path.join(ROOT, 'app')], ROOT);

describe('one class, one definition', () => {
  it('no class is declared in two stylesheets with different rules unless it is on the list', () => {
    const unexplained = findRedefined(declarations)
      .filter((r) => !DELIBERATE[r.cls])
      .map((r) => `.${r.cls}\n      ${r.places.map((p) => `${p.file}:${p.line}`).join('\n      ')}`);

    expect(
      unexplained,
      'These classes are declared in more than one stylesheet with different bodies. Whichever '
      + 'file loads last wins, which means the answer depends on the route. Consolidate them, or '
      + 'add them to DELIBERATE with the reason and which one wins where.\n\n  '
      + unexplained.join('\n\n  '),
    ).toEqual([]);
  });

  it('the list has not outlived its entries', () => {
    // An entry that no longer matches anything is a stale excuse, and stale excuses are how an
    // allow-list quietly turns into a place where real findings go to hide.
    const live = new Set(findRedefined(declarations).map((r) => r.cls));
    const stale = Object.keys(DELIBERATE).filter((cls) => !live.has(cls));
    expect(stale, `no longer redefined — drop from DELIBERATE: ${stale.join(', ')}`).toEqual([]);
  });
});

describe('no rule discards its own declaration', () => {
  it('a property is never set twice in one rule except as a fallback', () => {
    const found = duplicateProps.map(
      (d) => `${d.file}:${d.line}  ${d.selector} — ${d.prop}: ${d.first} then ${d.prop}: ${d.second}`,
    );
    expect(found, `the first value never renders:\n  ${found.join('\n  ')}`).toEqual([]);
  });

  it('recognises a progressive-enhancement fallback as deliberate', () => {
    // The guard on the guard. Nineteen of the first twenty-one findings were this pattern, and a
    // checker that calls correct CSS a bug teaches people to ignore it.
    expect(isFallbackPair('100vh', '100dvh')).toBe(true);
    expect(isFallbackPair('block', '-webkit-box')).toBe(true);
    expect(isFallbackPair('#fff', 'color-mix(in srgb, white 50%, black)')).toBe(true);
    // Not fallbacks: two plain values, or the newer one written first.
    expect(isFallbackPair('2rem 1rem', '1rem')).toBe(false);
    expect(isFallbackPair('100dvh', '100vh')).toBe(false);
  });
});

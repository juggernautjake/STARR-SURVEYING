// __tests__/research/rendered-classes-are-styled.test.ts — Phase A3.
//
// ── THE FAILURE THIS CATCHES ────────────────────────────────────────────────────────────────────
//
// A class the stylesheets have never heard of renders as unstyled markup in the middle of a screen.
// Nothing errors. Nothing logs. The component "works". `.address-autocomplete__*` lived in
// `AdminJobs.css`, which only `/admin/jobs` imports, so on `/admin/research` the suggestion list was
// a bare bulleted `<ul>` shoving the form down the page — and it survived that way until somebody
// looked at the screen.
//
// ── WHY THE OBVIOUS VERSION OF THIS TEST IS USELESS ─────────────────────────────────────────────
//
// A naive "is every rendered class in a .css file" scan reports 959 violations here, and a guard
// that cries wolf 959 times is a guard nobody runs. Measured, the 959 breaks down as:
//
//     591  Tailwind utilities        generated on demand, never authored in a sheet
//     191  the component's own <style>{`…`}</style> block   e.g. PipelineProgressPanel
//     534  genuinely unstyled
//
// So the scan excludes Tailwind, reads each component's embedded styles, and applies the STEM rule
// from the A1 audit — `foo--active` counts as styled when `.foo` exists, because modifier classes
// are composed at runtime in 62 files here and a literal-match scan cannot see them.
//
// ── WHY A BASELINE AND NOT ZERO ─────────────────────────────────────────────────────────────────
//
// 534 is real. `ResearchAnalysisPanel` alone renders 60 classes — `ra-panel`, `ra-panel__header`,
// `ra-panel__title` — that appear in NO stylesheet anywhere in the repo, and it is mounted by
// `[projectId]/page.tsx`, so that panel is genuinely unstyled on the screen the firm uses most.
// That is a finding for phases B–E to fix a slice at a time, not something to fix in the slice that
// discovers it.
//
// The baseline may only ever SHRINK. A new unstyled class fails immediately; fixing a file lowers
// the number and the constant comes down with it. Re-baselining upward is not a maintenance step —
// both times a ratchet was raised in this repo it was hiding a real bug.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** Stylesheets that actually load on a `/admin/research/**` route. */
const SHEETS = [
  'app/styles/globals.css', 'app/styles/tokens.css', 'app/styles/themes.css',
  'app/styles/density.css', 'app/styles/forms.css',
  'app/admin/styles/AdminLayout.css', 'app/admin/styles/AdminResponsive.css',
  'app/admin/styles/AdminDialog.css', 'app/admin/styles/AdminFieldWork.css',
  'app/admin/styles/AdminMessaging.css', 'app/admin/styles/AdminDiscussions.css',
  'app/admin/styles/AdminAssistant.css', 'app/admin/styles/AdminResearch.css',
  'app/admin/components/AddressAutocomplete.css',
  'app/admin/research/components/ui/primitives.css',
];

/**
 * Tailwind utilities. Generated from the markup at build time, so they are correctly absent from
 * every authored sheet. Listing prefixes rather than every class: the alternative is running
 * Tailwind's own resolver inside a unit test, which trades a maintained list for a slow dependency.
 */
const TAILWIND = /^(?:-?(?:m|p)[trblxy]?-|w-|h-|min-|max-|text-|bg-|border|rounded|flex|grid|gap-|items-|justify-|self-|space-|inset-|top-|right-|bottom-|left-|absolute$|relative$|fixed$|sticky$|block$|inline|hidden$|overflow-|z-|opacity-|shadow|font-|leading-|tracking-|cursor-|select-|pointer-|transition|duration-|ease-|transform$|scale-|rotate-|translate-|whitespace-|truncate$|break-|object-|aspect-|col-|row-|order-|basis-|grow|shrink|divide-|ring|outline|appearance-|resize|list-|align-|table|sr-only$|not-sr-only$|antialiased$|uppercase$|lowercase$|capitalize$|italic$|underline$|line-through$|no-underline$|placeholder-|caret-|accent-|fill-|stroke-|backdrop-|filter$|blur|brightness-|contrast-|grayscale|invert|saturate-|sepia|animate-|group$|peer$|container$)/;
const VARIANT = /^(?:sm|md|lg|xl|2xl|hover|focus|active|disabled|dark|group-hover|peer-focus):/;
const isTailwind = (c: string) => TAILWIND.test(c) || VARIANT.test(c);

function classesIn(css: string): Set<string> {
  const out = new Set<string>();
  for (const m of css.matchAll(/\.([a-zA-Z_][\w-]*)/g)) out.add(m[1]!);
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const routeSheets = SHEETS.filter((f) => fs.existsSync(path.join(ROOT, f)));
const defined = classesIn(routeSheets.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n'));

/** Every rendered class with no rule reachable from its own route, mapped to the file. */
function unstyled(): Map<string, string> {
  const missing = new Map<string, string>();

  for (const file of walk(path.join(ROOT, 'app/admin/research'))) {
    const src = fs.readFileSync(file, 'utf8');

    // Styles the component carries itself. TWO mechanisms, and missing either makes the guard
    // report a correctly-styled component as broken:
    //
    //   1. an embedded <style>{`…`}</style> block — PipelineProgressPanel defines ~107 that way
    //   2. a CO-LOCATED stylesheet it imports, e.g. `import './ResearchAnalysisPanel.css'`
    //
    // (2) was missing when this guard shipped, and it showed up immediately: styling that panel
    // produced no change in the count, because the guard only knew a hardcoded list of sheets.
    // A fixed list cannot describe a codebase where components are meant to bring their own
    // styles — which is the very convention A2 established.
    const own = new Set<string>();
    for (const block of src.matchAll(/<style[^>]*>\{`([\s\S]*?)`\}<\/style>/g)) {
      for (const c of classesIn(block[1]!)) own.add(c);
    }
    for (const imp of src.matchAll(/^import\s+['"](\.[^'"]+\.css)['"]/gm)) {
      const sheet = path.resolve(path.dirname(file), imp[1]!);
      if (fs.existsSync(sheet)) {
        for (const c of classesIn(fs.readFileSync(sheet, 'utf8'))) own.add(c);
      }
    }

    const rendered = new Set<string>();
    for (const m of src.matchAll(/className="([^"]+)"/g)) {
      for (const c of m[1]!.split(/\s+/)) if (c) rendered.add(c);
    }
    for (const m of src.matchAll(/className=\{`([^`]+)`\}/g)) {
      // `${expr}` is the composed half — drop it and judge the literal fragments.
      for (const c of m[1]!.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (c) rendered.add(c);
    }

    for (const c of rendered) {
      if (isTailwind(c)) continue;
      const stem = c.split('--')[0]!;          // the A1 stem rule
      if (defined.has(c) || defined.has(stem)) continue;
      if (own.has(c) || own.has(stem)) continue;
      if (!missing.has(c)) {
        missing.set(c, path.relative(ROOT, file).split(path.sep).join('/'));
      }
    }
  }
  return missing;
}

/**
 * MAY ONLY GO DOWN.
 *
 *   534  measured 2026-08-30 when this guard shipped
 *   461  after styling ResearchAnalysisPanel — the mounted, wholly unstyled panel the guard found
 *
 * Raising it is not a maintenance step. Both times a ratchet was re-baselined upward in this repo,
 * the breach turned out to be a real bug rather than debt. Lowering it as files are fixed is the
 * intended motion, and this constant coming down is what "the UI overhaul is progressing" looks
 * like as a number rather than as an impression.
 */
const UNSTYLED_BASELINE = 461;

describe('rendered classes resolve to a rule that loads on the route', () => {
  it('finds the sheets and the components — a broken scan would pass everything', () => {
    expect(routeSheets.length).toBeGreaterThanOrEqual(10);
    expect(defined.size).toBeGreaterThan(1000);
    expect(walk(path.join(ROOT, 'app/admin/research')).length).toBeGreaterThan(50);
  });

  it('does not exceed the baseline', () => {
    const found = unstyled();
    const worst = [...found.entries()]
      .reduce<Record<string, number>>((acc, [, f]) => ({ ...acc, [f]: (acc[f] ?? 0) + 1 }), {});
    const top = Object.entries(worst).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([f, n]) => `${n}  ${f}`).join('\n  ');

    expect(
      found.size,
      `Unstyled classes rose above the ${UNSTYLED_BASELINE} baseline. A class no sheet defines `
        + 'renders as unstyled markup with nothing erroring — this repo shipped that three times.\n'
        + `Worst files:\n  ${top}`,
    ).toBeLessThanOrEqual(UNSTYLED_BASELINE);
  });

  it('the A2 primitives are fully styled — the standard the rest is moving toward', () => {
    const offenders = [...unstyled().entries()].filter(([, f]) => f.includes('components/ui/'));
    expect(offenders.map(([c]) => c), 'the shared primitives must not add to the debt').toEqual([]);
  });

  it('Tailwind utilities are excluded, or this guard would be unrunnable', () => {
    // Control on the exclusion itself: `flex` and `h-full` are real Tailwind classes rendered in
    // this tree. If the matcher stopped recognising them the count would jump by ~591 and the
    // baseline assertion would fail for entirely the wrong reason.
    expect(isTailwind('flex')).toBe(true);
    expect(isTailwind('h-full')).toBe(true);
    expect(isTailwind('md:grid-cols-2')).toBe(true);
    // …and it must NOT swallow project classes, or the guard silently stops guarding.
    expect(isTailwind('ra-panel')).toBe(false);
    expect(isTailwind('research-modal__title')).toBe(false);
  });

  it('component-embedded <style> blocks count as styled', () => {
    // PipelineProgressPanel defines ~107 of its own classes inline. Treating those as unstyled
    // would report a self-contained component as broken.
    const found = unstyled();
    expect([...found.keys()]).not.toContain('ppanel__spinner');
  });
});

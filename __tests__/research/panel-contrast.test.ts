// Dark panels must set their own text colour on headings and labels.
//
// Found by finally driving these panels in a browser, which I had twice named as the remaining gap
// without attempting. The rotation panel's heading and BOTH radio labels rendered dark-on-dark —
// invisible against `bg-gray-900`. Every unit test passed, including the render tests: the markup
// was correct, the CSS cascade was not.
//
// The cause is two element rules in `app/styles/globals.css`:
//
//     h1, h2, h3, h4, h5, h6 { color: var(--brand-dark); }
//     label                  { color: var(--brand-dark); }
//
// An element selector beats an INHERITED value, always — so `text-gray-100` on the panel container
// never reaches an `<h2>` or a `<label>` inside it. Tailwind's class is on the wrong element to win.
//
// This is not a bug in those globals: they are right for the light admin pages that make up most of
// the app. It is a rule about writing a dark panel inside a light-themed application, and the only
// way to see it is to look.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** Does this tag set its own text colour — by Tailwind class OR inline style?
 *
 *  Both count. The first version demanded a Tailwind class and flagged a heading in the billing page
 *  that already sets its colour with `style={{ color: TIER_COLORS[...] }}`. That was a false
 *  accusation, and a check that forces redundant code is one people learn to work around. */
function hasColour(tag: string, src = ''): boolean {
  if (/\btext-(gray|slate|zinc|red|amber|blue|green|emerald)-\d{2,3}\b/.test(tag)
    || /\btext-white\b/.test(tag)
    || /style=\{\{[^}]*\bcolor\b/.test(tag)) return true;

  // `className={labelCls}` — resolve the variable and look there.
  //
  // An app-wide sweep for this bug reported 64 elements across 19 CAD files. Every one was a false
  // positive, and this was why for sixteen of them: the CAD editor defines `const labelCls = 'block
  // text-[11px] … text-gray-400 …'` once per file and reuses it. That is a better pattern than the
  // research pages had, and a check that cannot see it would have sent someone to "fix" nineteen
  // files that were already right.
  const ref = /className=\{(\w+)\}/.exec(tag);
  if (!ref || !src) return false;
  const decl = new RegExp(`\\b${ref[1]}\\s*=\\s*['"\`]([^'"\`]*)['"\`]`).exec(src);
  return decl ? hasColour(`className="${decl[1]}"`) : false;
}

/** Everything in the research area that renders on a dark surface and therefore cannot rely on
 *  inheritance.
 *
 *  Found by sweeping for `bg-gray-9xx` rather than by listing what I had touched. Two of these
 *  panels were mine; the four PAGES were pre-existing and had the same bug — including the Boundary
 *  Viewer, whose `<h1>` title has been invisible to every surveyor who has ever opened it.
 *
 *  ── THE LIST IS SWEPT, NOT TYPED ──────────────────────────────────────────────────────────────
 *
 *  It used to be six hardcoded paths, despite the paragraph above saying it came from a sweep. When
 *  `LibraryTab` was re-themed to light (E2b, 2026-08-31) the entry stayed, and the check demanded an
 *  explicit colour on an `<h1>` that now correctly inherits the global one — failing a file for
 *  being fixed. The opposite drift is the dangerous one: a NEW dark panel would never have been
 *  added to the list, and would have gone unchecked forever.
 *
 *  Comments are stripped first, so prose quoting `bg-gray-900` — this file's own explanation of the
 *  bug, and LibraryTab's — does not enrol a light file. */
function darkSurfaces(): string[] {
  const dirs = ['app/admin/research'];
  const found: string[] = [];

  const strip = (s: string) => s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ');

  const walk = (rel: string) => {
    const abs = path.join(process.cwd(), rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const next = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(next);
      else if (/\.tsx$/.test(e.name) && /\bbg-(gray|slate|zinc)-(8|9)\d{2}\b/.test(strip(read(next)))) {
        found.push(next);
      }
    }
  };

  for (const d of dirs) walk(d);
  return found.sort();
}

const DARK_SURFACES = darkSurfaces();

describe('the sweep for dark surfaces works', () => {
  it('finds some', () => {
    // Control. An empty list makes every check below vacuous, and vacuous is what this check looked
    // like the first time it silently stopped matching.
    expect(DARK_SURFACES.length).toBeGreaterThan(0);
  });

  it('still catches the panel this check was written for', () => {
    expect(DARK_SURFACES).toContain('app/admin/research/components/RotationPanel.tsx');
  });

  it('and does not enrol a file that only WRITES about dark utilities', () => {
    // LibraryTab is light now, but its header comment quotes `bg-gray-950` while explaining the
    // re-theme. Without stripping comments the sweep would put it straight back on the list.
    expect(DARK_SURFACES).not.toContain('app/admin/research/_tabs/LibraryTab.tsx');
  });

  it('found a file the hardcoded list had missed', () => {
    // The point of sweeping. This dark panel was never in the six typed paths, so its headings and
    // labels went unchecked for as long as the list was maintained by hand.
    expect(DARK_SURFACES).toContain('app/admin/research/components/InteractiveBoundaryViewer.tsx');
  });

  it('the heading matcher still matches headings somewhere in the corpus', () => {
    // Corpus-wide control, replacing a per-file one that failed a panel for legitimately having no
    // headings. If the regex breaks, every file reports zero and every check below passes on air.
    const total = DARK_SURFACES.reduce(
      (n, f) => n + [...read(f).matchAll(/<h[1-6]\s[^>]*>/g)].length, 0,
    );
    expect(total, 'no headings found in ANY dark surface — the matcher is broken').toBeGreaterThan(5);
  });
});

describe('the global rules that make this necessary still exist', () => {
  // If these ever change, this whole check can go — so it fails loudly rather than quietly guarding
  // nothing, which is how a stale test outlives its reason.
  const globals = read('app/styles/globals.css');

  it('headings are coloured by an element rule', () => {
    expect(globals).toMatch(/h1, h2, h3, h4, h5, h6 \{[^}]*color: var\(--brand-dark\)/);
  });

  it('labels are too', () => {
    expect(globals).toMatch(/label \{[^}]*color: var\(--brand-dark\)/);
  });
});

describe('every heading and label on a dark surface names its own colour', () => {
  for (const file of DARK_SURFACES) {
    const src = read(file);
    // The whole path in the test name: four of these are called `page.tsx`, and a failure reading
    // "page.tsx: headings" tells you nothing about which one.
    const label = file.replace('app/admin/research/', '');

    it(`${label} — headings`, () => {
      // Whole tag, not just the className, so an inline colour is visible to `hasColour`. Also
      // matches multi-line JSX, which a `className="…"`-only pattern misses — that is how the first
      // sweep of these files came back clean while two headings were still bare.
      const tags = [...src.matchAll(/<h[1-6]\s[^>]*>/g)].map((m) => m[0]);
      // A dark panel with no headings is fine — `InteractiveBoundaryViewer` is one, and the sweep
      // found it only because the hardcoded list this replaced had never included it. Demanding at
      // least one heading PER FILE failed it for a shape it is allowed to have. The control that
      // matters is corpus-wide and lives below: if the matcher stops working, no file has headings.
      const bare = tags.filter((t) => !hasColour(t, src));
      expect(bare, `these headings inherit a colour they will never receive:\n  ${bare.join('\n  ')}`)
        .toEqual([]);
    });

    it(`${label} — labels`, () => {
      const tags = [...src.matchAll(/<label\s[^>]*>/g)].map((m) => m[0]);
      // A page may legitimately contain no labels. Absence is not a failure — asserting otherwise
      // would force a meaningless label onto a page to satisfy a test.
      if (tags.length === 0) return;
      const bare = tags.filter((t) => !hasColour(t, src));
      expect(bare, `these labels render dark-on-dark:\n  ${bare.join('\n  ')}`).toEqual([]);
    });
  }
});

describe('the matcher itself', () => {
  it('accepts a Tailwind colour', () => {
    expect(hasColour('<h2 className="text-lg font-semibold text-gray-100">')).toBe(true);
  });

  it('accepts an inline colour', () => {
    expect(hasColour('<h2 className="text-2xl font-bold" style={{ color: TIER_COLORS[t] }}>')).toBe(true);
  });

  it('rejects a tag with no colour at all', () => {
    expect(hasColour('<h1 className="text-xl font-bold">')).toBe(false);
  });

  it('does not mistake a size class for a colour', () => {
    // `text-sm` and `text-2xl` are not colours; treating them as such would make the check pass on
    // exactly the tags it exists to catch.
    expect(hasColour('<label className="text-sm">')).toBe(false);
    expect(hasColour('<h1 className="text-2xl font-bold">')).toBe(false);
  });
});

describe('the harness can mount the panels, which is how this was found', () => {
  it('both are registered', () => {
    const harness = read('app/ux-harness/UxHarnessClient.tsx');
    expect(harness).toContain("'research-rotation'");
    expect(harness).toContain("'research-vendor-accounts'");
  });

  it('the mounts supply real props rather than faking the API', () => {
    // A panel that fetches shows its loading or error state here, which is worth seeing. Faking the
    // response would be testing the fake.
    const mount = read('app/ux-harness/ResearchPanelHarnessMount.tsx');
    expect(mount).toContain('do not fake API responses');
  });
});

describe('the sweep that found nothing, recorded so nobody repeats it', () => {
  // An app-wide sweep for this bug reported 64 elements across 19 files, all in the CAD editor.
  // EVERY ONE was a false positive, found by checking before editing:
  //
  //   · most were `<label className="block">` wrapping children that each set their own colour —
  //     the label has no bare text, so the global rule colours nothing visible;
  //   · the remaining sixteen used `className={labelCls}`, where the variable already carries
  //     `text-gray-400`.
  //
  // So the bug was confined to the research area, and the CAD editor avoided it by defining a label
  // class constant once per file — a better pattern than the research pages had. Recorded because
  // the alternative was editing nineteen files that were already correct, and because a future
  // widening of this check will hit the same two false-positive shapes.
  it('resolves a className variable rather than accusing it', () => {
    const src = "const labelCls = 'block text-[11px] font-semibold text-gray-400 mb-1';";
    expect(hasColour('<label className={labelCls}>', src)).toBe(true);
  });

  it('still flags a variable that genuinely has no colour', () => {
    const src = "const labelCls = 'block text-xs font-semibold mb-1';";
    expect(hasColour('<label className={labelCls}>', src)).toBe(false);
  });

  it('does not crash when the variable cannot be found', () => {
    expect(hasColour('<label className={somethingElse}>', '')).toBe(false);
  });
});

// __tests__/design/catalogue-drift.test.ts — the catalogue cannot quietly stop being true.
//
// Slice C10 of docs/planning/completed/DESIGN_STUDIO_2026-08-23.md.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// Every catalogue entry claims a provenance: *"this is `.admin-btn`, defined at
// `AdminLayout.css:596`"*. That claim is what makes the export useful — it is how a mockup says
// "build it with THIS class" instead of "make a navy button". And it is a claim that rots silently:
// stylesheets get reorganised, classes get renamed, rules move, and nothing tells you that the
// palette is now describing something that is not there.
//
// A catalogue that is trusted and wrong is worse than no catalogue. So the citations are checked:
//
//   1. every cited file exists;
//   2. every cited line is inside it;
//   3. for a CSS citation, the class the entry claims is actually declared AT or NEAR that line.
//
// Rule 3 is the one with teeth. A line number alone drifts by a few lines every time somebody adds
// a comment, which would make this test a nuisance that gets deleted; requiring the CLASS to be
// within a window of the cited line tolerates that movement and still fails loudly when the rule
// has been renamed, moved to another file, or deleted.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ENTRIES, EXCLUSIONS } from '@/lib/design/catalogue';
import { fingerprint } from '@/lib/design/catalogue/define';

const repoRoot = join(__dirname, '..', '..');

/** How far a cited line may drift before it counts as wrong. Generous on purpose: comments get
 *  added, and a test that fails on cosmetic movement is a test somebody deletes. */
const WINDOW = 60;

/**
 * Every stylesheet and component in the app, concatenated once, for "does this class exist at all"
 * questions. Read lazily and cached: the answer is the same for all forty entries.
 *
 * **`lib/design` is excluded, and that exclusion is the whole test.** The first version of this
 * walked `lib/` too and passed on a class that exists nowhere in the app — because
 * `lib/design/catalogue/curated/structure.ts` is where the entry NAMES it. A search that includes
 * the claim as evidence for the claim always succeeds; it was a green test proving nothing, which
 * is the same instrument-is-the-bug shape as the sweep that measured loading splashes.
 */
let sourceCache: string | null = null;
function allSourceText(): string {
  if (sourceCache !== null) return sourceCache;
  const parts: string[] = [];
  const designLib = join(repoRoot, 'lib', 'design');
  const walk = (dir: string) => {
    if (dir.startsWith(designLib)) return;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.name === 'node_modules' || item.name.startsWith('.')) continue;
      const full = join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else if (/\.(css|tsx|ts)$/.test(item.name)) parts.push(readFileSync(full, 'utf8'));
    }
  };
  walk(join(repoRoot, 'app'));
  walk(join(repoRoot, 'lib'));
  sourceCache = parts.join('\n');
  return sourceCache;
}

describe('every citation resolves', () => {
  it('cites files that exist', () => {
    for (const entry of ENTRIES) {
      for (const source of entry.source) {
        // A `<style jsx>` citation carries its position after a colon; strip it back to the file.
        const file = source.file.split(':<style jsx>')[0];
        expect(existsSync(join(repoRoot, file)), `${entry.id} cites ${file}, which does not exist`).toBe(true);
      }
    }
  });

  it('cites lines that are inside the file', () => {
    for (const entry of ENTRIES) {
      for (const source of entry.source) {
        const file = source.file.split(':<style jsx>')[0];
        const path = join(repoRoot, file);
        if (!existsSync(path)) continue;
        const lines = readFileSync(path, 'utf8').split('\n').length;
        expect(source.line, `${entry.id} cites ${file}:${source.line}, which has ${lines} lines`).toBeLessThanOrEqual(lines);
        expect(source.line, `${entry.id} cites a line before the start of ${file}`).toBeGreaterThan(0);
      }
    }
  });

  it('finds the class it claims, at or near the line it cites', () => {
    const problems: string[] = [];

    for (const entry of ENTRIES) {
      // Shapes are the studio's own primitives — they answer to no stylesheet in the app, and their
      // citation points at the file that DEFINES them rather than at a rule they were read from.
      if (entry.category === 'shape') continue;

      for (const source of entry.source) {
        if (source.kind !== 'css') continue;
        const path = join(repoRoot, source.file);
        if (!existsSync(path)) continue;
        const lines = readFileSync(path, 'utf8').split('\n');
        const from = Math.max(0, source.line - 1 - WINDOW);
        const to = Math.min(lines.length, source.line - 1 + WINDOW);
        const window = lines.slice(from, to).join('\n');

        // At least one of the entry's classes must be declared in the window. Not all of them: an
        // entry like the empty state cites the block's line and names four classes that sit within
        // a few lines of each other.
        const found = entry.classes.some((cls) => new RegExp(`\\.${cls.replace(/[-_]/g, '[-_]')}\\b`).test(window));
        if (!found) {
          problems.push(`${entry.id}: none of [${entry.classes.join(', ')}] is declared within ${WINDOW} lines of ${source.file}:${source.line}`);
        }
      }
    }

    expect(problems, `The catalogue has drifted from the code:\n  ${problems.join('\n  ')}`).toEqual([]);
  });

  // ── 2026-08-23: the check above passed while the thing it exists to prevent had happened ───────
  //
  // `nav.breadcrumb` rendered `<nav class="admin-page-header__crumbs">`. That class exists NOWHERE
  // in this repo — not in a stylesheet, not in a component. The app's breadcrumb trail is
  // `admin-page-header__trail`.
  //
  // It passed because the rule above is `entry.classes.some(...)`: at least ONE of an entry's
  // classes must be declared near the citation. `admin-page-header__crumb` (singular) is real, so
  // the entry's invented ROOT class was never questioned — and the root is the one that matters,
  // because it is what an exported mockup tells somebody to build with and what the importer
  // matches a real page against.
  //
  // It was found by the coverage sweep (C9) rather than by this test: 125 routes reported their
  // breadcrumb as an uncatalogued element while a catalogue entry for it sat right there. So the
  // rule is now "every class an entry names must exist somewhere in the app", which is a weaker
  // check per class but covers every class instead of one.
  it('names no class that does not exist anywhere in the app', () => {
    const haystack = allSourceText();
    const problems: string[] = [];

    for (const entry of ENTRIES) {
      if (entry.category === 'shape') continue;   // studio primitives, defined in the exporter
      const invented = [...new Set([...entry.classes, ...(entry.variants ?? []).flatMap((v) => v.classes)])]
        // `ds-*` is the studio's OWN prefix. Those primitives are deliberately not app classes:
        // they are shapes the app draws per page rather than from a shared class (a dialog, a
        // switch, a skeleton, written out separately in several files), catalogued so a mockup can
        // ask for the one version. They are defined in lib/design/export.ts, which the haystack
        // excludes for the reason above, so they are exempted by name rather than by accident.
        .filter((cls) => !cls.startsWith('ds-'))
        .filter((cls) => !new RegExp(`\\b${cls.replace(/[-_]/g, '[-_]')}\\b`).test(haystack));
      if (invented.length) problems.push(`${entry.id}: [${invented.join(', ')}] appear nowhere in app/ or lib/`);
    }

    expect(
      problems,
      `These entries name classes the app does not have. An export citing one tells somebody to `
      + `build with a class that will never match a stylesheet:\n  ${problems.join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('the fingerprint', () => {
  it('is stable for the same input and different for a changed one', () => {
    expect(fingerprint('a')).toBe(fingerprint('a'));
    expect(fingerprint('a')).not.toBe(fingerprint('b'));
    expect(fingerprint('.admin-btn')).not.toBe(fingerprint('.admin-btn '));
  });

  it('is 16 hex characters, and does not collide across the real catalogue', () => {
    const seen = new Map<string, string>();
    for (const entry of ENTRIES) {
      expect(entry.sourceHash).toMatch(/^[0-9a-f]{16}$/);
      const clash = seen.get(entry.sourceHash);
      expect(clash, `${entry.id} and ${clash} hash to the same value`).toBeUndefined();
      seen.set(entry.sourceHash, entry.id);
    }
  });

  it('runs in a browser as well as in node — no node: imports in the catalogue', () => {
    // The production build caught this once: `node:crypto` cannot be bundled for the client, and
    // `tsc` says nothing about it. Reading the source is the cheapest guard against it coming back.
    for (const file of [
      'lib/design/catalogue/define.ts',
      'lib/design/catalogue/index.ts',
      'lib/design/catalogue/types.ts',
      'lib/design/search/index.ts',
      'lib/design/snap.ts',
      'lib/design/document.ts',
      'lib/design/render.ts',
      'lib/design/export.ts',
    ]) {
      const src = readFileSync(join(repoRoot, file), 'utf8');
      expect(src, `${file} imports a node: builtin and is reachable from the browser`).not.toMatch(/from '(node:|fs|path|crypto)'/);
    }
  });
});

describe('curation is accountable', () => {
  it('every exclusion says why, and a duplicate names the entry that covers it', () => {
    for (const exclusion of EXCLUSIONS) {
      expect(exclusion.reason, `${exclusion.className} has no reason`).toBeTruthy();
      if (exclusion.reason === 'duplicate-of') {
        expect(exclusion.coveredBy, `${exclusion.className} is a duplicate of nothing`).toBeTruthy();
        expect(
          ENTRIES.some((e) => e.id === exclusion.coveredBy),
          `${exclusion.className} says it is covered by "${exclusion.coveredBy}", which is not an entry`,
        ).toBe(true);
      }
    }
  });

  it('nothing is both catalogued and excluded', () => {
    const catalogued = new Set(ENTRIES.flatMap((e) => e.classes));
    for (const exclusion of EXCLUSIONS) {
      expect(
        catalogued.has(exclusion.className),
        `.${exclusion.className} is excluded AND used by an entry`,
      ).toBe(false);
    }
  });
});

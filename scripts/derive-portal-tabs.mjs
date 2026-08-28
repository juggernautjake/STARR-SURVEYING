// scripts/derive-portal-tabs.mjs — every portal's tabs, for the things that cannot import a page.
//
//   node scripts/derive-portal-tabs.mjs            # rewrite lib/admin/portal/tabs.generated.json
//   node scripts/derive-portal-tabs.mjs --check    # exit 1 if the file is behind the pages
//
// T6 of §11 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// ── WHY THIS IS DERIVED AND NOT IMPORTED ────────────────────────────────────────────────────────
//
// Every portal declares its own `PORTAL: PortalSpec` inside its page, and every portal page is
// `'use client'`. A Route Handler that imports one gets a client-reference proxy: the object is not
// there, and nothing throws — C9 lost an afternoon to exactly that, with 26,194 tests green and a
// page that would not load. So `/api/admin/feature-toggles`, which is a Route Handler and needs the
// tab list to offer tab-level switches, cannot import the specs. It reads this.
//
// ── WHY IT IS NOT HAND-WRITTEN EITHER ───────────────────────────────────────────────────────────
//
// A second copy of a list is the defect this plan hit nine times running — the API bundle gate
// mirrors the page registry, and every slice that deleted a row broke it. The difference here is
// that this copy is GENERATED and a test regenerates it and compares, so drift fails the suite
// rather than waiting to be noticed.
//
// ── THE PARSE, AND THE TWO THINGS THAT MADE IT WRONG BEFORE ─────────────────────────────────────
//
// Comments are stripped FIRST, line comments before block comments. Both mattered:
//
//   · `/admin/messages` came out with `contacts` twice, because a comment in that page discusses
//     `id: 'contacts'` in prose. The parser was reading a sentence about the code as the code.
//   · `/admin/marketing` lost `uploads`, because that entry carries a comment BETWEEN its `id` and
//     its `label`, and the first attempt required them to be adjacent.
//
// So: strip comments, take each `id:`/`key:`, then the first `label:` that follows it. Duplicate ids
// within one portal are dropped and reported — a portal cannot have two tabs with one id, and if the
// parser produces one it is the parser that is wrong.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export const OUT = 'lib/admin/portal/tabs.generated.json';

/**
 * The human-readable half of a label, with any template interpolation removed.
 *
 * One label in this app is a template literal — `Recycle Bin${n > 0 ? ` (${n})` : ''}` — and taking
 * it raw stored it as `Recycle Bin${recycleBin.length > 0 ? `. That is not merely untidy: the design
 * system derives a state key by SLUGGING the label, so that tab's design was keyed
 * `recycle-bin-recyclebin-length-0`, which is a slug of nothing anybody will ever see. See §13.8.
 *
 * A backtick label is matched non-greedily up to the first backtick, so an interpolation truncates
 * it mid-expression rather than producing a balanced one. Cut at the first `${` and trim: what is
 * left is the fixed part, which is the part a person reads.
 */
function cleanLabel(raw) {
  const at = (raw ?? '').indexOf('${');
  return (at === -1 ? raw : raw.slice(0, at)).trim();
}

const strip = (s) => s.split('\r\n').join('\n')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Every portal in `app/admin`, with its tabs, sorted so the file is stable across machines. */
export function derivePortalTabs(cwd = process.cwd()) {
  const files = execSync('git ls-files app/admin', { cwd }).toString().trim().split('\n')
    .filter((f) => f.endsWith('page.tsx'));
  const portals = [];
  const problems = [];

  for (const f of files) {
    const raw = fs.readFileSync(path.join(cwd, f), 'utf8');
    // `allTabs` is `/admin/learn/manage`, which has a twelve-tab bar of its own rather than the
    // shared shell — C12d explains why it was not given a portal on top of the one it had.
    if (!/PortalSpec|allTabs/.test(raw)) continue;
    const s = strip(raw);
    const route = (s.match(/route: '(\/admin[^']*)'/) ?? [])[1]
      ?? '/' + f.replace(/^app\//, '').replace(/\/page\.tsx$/, '');

    const tabs = [];
    for (const m of s.matchAll(/\b(?:id|key): '([a-z0-9_-]+)'/g)) {
      const lab = s.slice(m.index).match(/label: (?:'([^']*)'|`([^`]*)`)/);
      if (lab) tabs.push({ id: m[1], label: cleanLabel(lab[1] ?? lab[2]) });
    }
    const seen = new Set();
    const uniq = tabs.filter((t) => !seen.has(t.id) && seen.add(t.id));
    if (uniq.length !== tabs.length) problems.push(`${route}: ${tabs.length - uniq.length} duplicate id(s)`);
    if (uniq.length) portals.push({ route, file: f, tabs: uniq });
  }

  portals.sort((a, b) => a.route.localeCompare(b.route));
  return { portals, problems };
}

if (import.meta.url === `file://${process.argv[1].split(path.sep).join('/')}`
    || process.argv[1]?.endsWith('derive-portal-tabs.mjs')) {
  const { portals, problems } = derivePortalTabs();
  for (const p of problems) console.error('  !! ' + p);
  const body = JSON.stringify({ portals }, null, 2) + '\n';
  const check = process.argv.includes('--check');
  const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

  // LINE ENDINGS ARE NOT CONTENT.
  //
  // `body` is built with \n. Git checks this file out with CRLF on Windows, so the raw comparison
  // below was ALWAYS unequal on a Windows clone regardless of what the file said — and the check
  // therefore reported "behind the portal pages" on a byte-identical file, every single run.
  //
  // A check that can never pass is worse than no check: it goes red, stays red, and everybody learns
  // to skip it. Found 2026-08-27 by regenerating the file and getting an EMPTY git diff, which is
  // the only thing that distinguishes "the file is stale" from "the comparison is broken".
  const normalise = (s) => s.split('\r\n').join('\n');

  if (check) {
    if (normalise(existing) !== normalise(body)) {
      console.error(`${OUT} is behind the portal pages — run: node scripts/derive-portal-tabs.mjs`);
      process.exit(1);
    }
    console.log(`${OUT} is current: ${portals.length} portals, ${portals.reduce((a, p) => a + p.tabs.length, 0)} tabs`);
  } else {
    fs.writeFileSync(OUT, body);
    console.log(`wrote ${OUT}: ${portals.length} portals, ${portals.reduce((a, p) => a + p.tabs.length, 0)} tabs`);
  }
  if (problems.length) process.exit(1);
}

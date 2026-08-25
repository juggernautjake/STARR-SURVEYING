// lib/design/staleness.ts — is the record older than the thing it records?
//
// S1 + S3 of docs/planning/in-progress/DESIGN_STUDIO_SERVES_PAGES_2026-08-24.md.
//
// Owner: *"we need all of the changes that we are making to be reflected there too."*
//
// The gap this answers is not "there is no record" — the page list already says that loudly, four
// different ways. It is **"the record is older than the page it describes"**, which looks completely
// fine until somebody relies on it. Every consolidation slice creates a few.
//
// ── ONE RULE, THREE CALLERS ─────────────────────────────────────────────────────────────────────
//
// The page list asks it to draw a chip; the tracer, the deriver and the conformance sweep ask it to
// decide what to re-run. If those disagreed, the queue would show work that the tool that empties it
// cannot see — and this repository has already paid for that shape twice: the design conformance
// check shipped with two signature rules, one at each end, and its score turned out to be measuring
// class-attribute order.
//
// ── WHY GIT AND NOT mtime ───────────────────────────────────────────────────────────────────────
//
// The first version of S3 used `fs.statSync().mtimeMs` and reported 50 of 138 admin routes stale
// within minutes of the defaults being traced. mtime records when the FILE was written, not when the
// page changed: a branch checkout, a rebase or a formatting pass rewrites it, and this repository
// does all three daily. A queue that is a third false is one people stop opening, which is worse
// than no queue — the real entries are still in there, now camouflaged.
//
// The last COMMIT that touched the file is the honest signal, and it costs one `git log` for the
// whole tree: measured at ~0.1s, against 138 `stat` calls for a worse answer.
//
// mtime survives as the FALLBACK, for a deployed container with no `.git`. Noisy beats absent here,
// and the fallback errs in the safe direction: it over-reports, and a page flagged stale that is not
// costs one re-trace, while a page silently stale costs a decision made on a wrong record.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface InventoryPageFile {
  route: string;
  /** The route's DIRECTORY, as recorded in `pages.generated.json`. */
  file: string;
}

/** Last commit that touched each file under `app/admin`, as epoch ms. Null when git is unavailable. */
export function lastCommitByFile(cwd: string = process.cwd()): Map<string, number> | null {
  try {
    // One pass. `--name-only` prints the commit date and then the files it touched, so the FIRST
    // time a path appears is its most recent change — git walks newest-first.
    const out = execFileSync(
      'git',
      ['log', '--format=%cI', '--name-only', '--', 'app/admin'],
      { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15_000 },
    );
    const byFile = new Map<string, number>();
    let when = 0;
    for (const line of out.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (/^\d{4}-\d{2}-\d{2}T/.test(t)) { when = Date.parse(t); continue; }
      if (!byFile.has(t) && Number.isFinite(when)) byFile.set(t, when);
    }
    return byFile.size ? byFile : null;
  } catch {
    return null;
  }
}

/** When did this route's page last change? Epoch ms, or null when it cannot be told. */
export function pageChangedAt(
  page: InventoryPageFile,
  commits: Map<string, number> | null,
  cwd: string = process.cwd(),
): number | null {
  const rel = `${page.file}/page.tsx`;
  const fromGit = commits?.get(rel);
  if (fromGit !== undefined) return fromGit;
  try {
    return fs.statSync(path.join(cwd, rel)).mtimeMs;
  } catch {
    // No page.tsx — a route group, or a file that moved. Not stale; not anything.
    return null;
  }
}

/**
 * Routes whose record predates their page.
 *
 * `recordedAt` maps route → ISO timestamp of whatever record you are asking about: `traced_at` for a
 * default, `derived_at` for a dossier, `measuredAt` for a conformance row. The rule is the same for
 * all three, which is why this takes a map rather than reading a table.
 */
export function staleRoutes(
  pages: readonly InventoryPageFile[],
  recordedAt: ReadonlyMap<string, string>,
  cwd: string = process.cwd(),
): Set<string> {
  const stale = new Set<string>();
  const commits = lastCommitByFile(cwd);
  for (const page of pages) {
    const recorded = recordedAt.get(page.route);
    if (!recorded) continue;
    const recordedMs = Date.parse(recorded);
    if (!Number.isFinite(recordedMs)) continue;
    const changedMs = pageChangedAt(page, commits, cwd);
    if (changedMs !== null && changedMs > recordedMs) stale.add(page.route);
  }
  return stale;
}

/**
 * Routes whose page changed after `ref` — the `--since` half of S1.
 *
 * Separate from `staleRoutes` on purpose. "What did I just touch?" and "what has fallen behind?" are
 * different questions: the first is answered by a commit range and is what you want in a hook right
 * after a slice; the second is answered by comparing against each record's own age and is what you
 * want when catching up. A tool that conflated them would re-run the whole backlog on every commit.
 */
export function routesChangedSince(
  pages: readonly InventoryPageFile[],
  ref: string,
  cwd: string = process.cwd(),
): Set<string> {
  let changed: Set<string>;
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${ref}...HEAD`, '--', 'app/admin'], {
      cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15_000,
    });
    changed = new Set(out.split('\n').map((l) => l.trim()).filter(Boolean));
  } catch {
    // An unknown ref is a typo, not an empty result. Returning "nothing changed" would silently do
    // nothing and report success, which is the worst answer available.
    throw new Error(`Could not diff against "${ref}". Is it a valid git ref?`);
  }
  const out = new Set<string>();
  for (const page of pages) {
    if (changed.has(`${page.file}/page.tsx`)) out.add(page.route);
  }
  return out;
}

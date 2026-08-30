// Every key the worker WARNS about must be a key the worker USES.
//
// ── THE BUG THIS EXISTS FOR ─────────────────────────────────────────────────────────────────────
//
// `configWarnings` warned `TAVILY_API_KEY missing — open-web research is inert; runs see county
// sources only`. The worker never read that key. Every consumer of `lib/research/open-web.ts` is an
// APP module — the four watches, lead enrichment, the CAD-URL guess in `boundary-fetch.service.ts` —
// and the deep research pipeline has no open-web step at all.
//
// So the worker was reading its OWN environment to report on a DIFFERENT process's configuration,
// which it cannot observe. That breaks in both directions:
//
//   · app has the key, worker does not  → warns falsely, and the operator "fixes" it by setting a
//     key on a machine that will never read it. This happened on 2026-08-29, to the person reading
//     the warning, who then reported it clearing as progress.
//   · worker has the key, app does not  → silent, while the thing it warns about is genuinely broken
//
// A health check is a claim about the process making it. The moment it claims something about a
// process it cannot see, it is guessing with authority — which is worse than not checking, because
// the output looks like a measurement.
//
// ── WHY A GUARD AND NOT JUST A FIX ──────────────────────────────────────────────────────────────
//
// Swept the whole file by hand when the bug was found: eighteen warned keys, seventeen genuinely
// used in worker code (Anthropic in 23 files, Supabase in 9, TexasFile in 3). Tavily was the only
// one. That is a good result and exactly the kind that decays — the next person adding a warning is
// reading the same warnings file that already contained this mistake.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const HEALTH = path.join(ROOT, 'src/infra/health.ts');

/** Env names that `health.ts` reads — i.e. things it may form an opinion about. */
function keysHealthChecks(): string[] {
  // Comments explain keys that were REMOVED for exactly this reason. Reading them would make the
  // test fail on its own documentation — `health.ts` now names TAVILY_API_KEY in the note recording
  // why the check went away.
  //
  // LINE COMMENTS FIRST, THEN BLOCK COMMENTS. The order matters, and the reason is written down in
  // `scripts/derive-portal-tabs.mjs`, which exports `stripComments` as the canonical copy. This is
  // the one place that cannot import it — the worker is a separate project with no shared module
  // boundary — so it is duplicated here knowingly rather than by accident.
  const src = fs.readFileSync(HEALTH, 'utf8')
    .split('\r\n').join('\n')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return [...new Set([...src.matchAll(/\benv\.([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]))];
}

/** Every `.ts` under src, excluding tests and health.ts itself. */
function workerSources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') workerSources(p, out);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && p !== HEALTH) {
      out.push(p);
    }
  }
  return out;
}

const SOURCES = workerSources(path.join(ROOT, 'src')).map((f) => fs.readFileSync(f, 'utf8'));
const CHECKED = keysHealthChecks();

/** Runtime-owned names the worker legitimately inspects without "using" in the product sense. */
const RUNTIME_OWNED = new Set(['NODE_ENV', 'TZ', 'PORT', 'HOSTNAME']);

describe('worker health warnings are about the worker', () => {
  it('finds a plausible number of checked keys — a broken scanner passes everything', () => {
    expect(CHECKED.length).toBeGreaterThan(10);
    expect(SOURCES.length).toBeGreaterThan(50);
  });

  it('every key health checks is read somewhere else in the worker', () => {
    const orphaned = CHECKED
      .filter((k) => !RUNTIME_OWNED.has(k))
      .filter((k) => !SOURCES.some((s) => s.includes(k)))
      .sort();
    expect(orphaned, 'health.ts forms an opinion about these, and no other worker file reads them. '
      + 'A health check is a claim about the process making it; warning about another process\'s '
      + 'configuration is guessing with authority, and the operator "fixes" it by setting a key on a '
      + `machine that ignores it:\n  ${orphaned.join('\n  ')}`).toEqual([]);
  });

  it('does not warn about TAVILY_API_KEY — the instance this guard was built from', () => {
    expect(CHECKED).not.toContain('TAVILY_API_KEY');
  });

  it('still checks the keys that ARE this process\'s business', () => {
    // Control. Without this the assertion above would pass just as well if `configWarnings` were
    // gutted, or if the scanner silently matched nothing.
    for (const k of ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'WORKER_API_KEY', 'TEXASFILE_USERNAME']) {
      expect(CHECKED).toContain(k);
    }
  });
});

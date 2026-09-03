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

// ── The same rule, applied to the OTHER place that makes health claims ───────────────────────────
//
// The guard above scans `infra/health.ts`. On 2026-08-30 the identical bug was found in the deep
// `/health` handler in `index.ts`, which the guard did not read:
//
//     checks.websocket_auth = process.env.WS_TICKET_SECRET
//       ? { status: 'ok',           detail: 'WS_TICKET_SECRET configured' }
//       : { status: 'unconfigured', detail: 'WS_TICKET_SECRET missing — /api/ws/ticket will return 503' }
//
// `/api/ws/ticket` is a Next.js route on Vercel reading its own environment. This process serves no
// WebSocket at all. So writing the TAVILY lesson down did not prevent the repeat — the guard was
// pointed at one file and the next mistake was made in another.
//
// ── WHY REACHABILITY, AND NOT "IS THE STRING ANYWHERE IN src/" ────────────────────────────────────
//
// The obvious rule — "some worker file reads this key" — is not enough, and this case proves it.
// `websocket/progress-server.ts` DOES read `WS_TICKET_SECRET`. It is also an orphan that nothing
// constructs, so the key is still not used by this process, and a substring rule would wave the bug
// straight through. What makes a key this process's business is that a module which actually RUNS
// reads it. So the entry point is walked.

/** Every .ts file under a directory, so "reachable" can be measured against "exists". */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listSourceFiles(full));
    else if (e.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Every worker module reachable from `src/index.ts` by following relative imports. */
function reachableFromEntry(): Set<string> {
  const seen = new Set<string>();
  const queue = [path.join(ROOT, 'src/index.ts')];

  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);

    const src = fs.readFileSync(file, 'utf8');
    // Relative specifiers only. A bare specifier is a node_module and cannot be one of ours.
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const spec = m[1]!;
      // The worker is ESM and imports compile targets: './x.js' is './x.ts' on disk.
      const base = path.resolve(path.dirname(file), spec).replace(/\.js$/, '');
      for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
        if (fs.existsSync(candidate)) { queue.push(candidate); break; }
      }
    }
  }
  return seen;
}

const REACHABLE = reachableFromEntry();
const ENTRY = path.join(ROOT, 'src/index.ts');

/** Env names the deep `/health` handler in index.ts forms an opinion about. */
function keysHealthClaims(): string[] {
  const src = fs.readFileSync(ENTRY, 'utf8')
    .split('\r\n').join('\n')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  // Scope to the handler, not the file. The first version of this filter took every line in
  // index.ts containing `process.env.` and immediately "found" ANALYTICS_DIR, BATCH_DIR, GIT_SHA
  // and GOVOS_CREDIT_CARD_TOKEN — none of which /healthz reports on. A scanner that over-reports
  // is as useless as one that under-reports: it trains you to ignore the failure.
  const start = src.indexOf("app.get('/health'");
  if (start === -1) throw new Error('the deep /health handler moved — this guard is now scanning nothing');
  // The handler ends at the next top-level `app.` registration.
  const rest = src.slice(start + 1);
  const endRel = rest.search(/\napp\.(get|post|put|use|delete)\(/);
  const body = endRel === -1 ? rest : rest.slice(0, endRel);

  return [...new Set(
    body.match(/process\.env\.([A-Z][A-Z0-9_]{2,})/g)?.map((s) => s.slice(12)) ?? [],
  )];
}

describe('the deep /health handler in index.ts is about the worker too', () => {
  it('reaches a plausible slice of the worker — a broken walk would excuse everything', () => {
    // If the import walk silently found nothing, every key below would look "unused" and the real
    // assertion would fail loudly rather than pass quietly. This pins the other direction: the walk
    // must actually be traversing the app.
    expect(REACHABLE.size).toBeGreaterThan(50);
    expect([...REACHABLE].some((f) => f.endsWith('run-budget.ts'))).toBe(true);
  });

  it('does NOT count a key that only an orphan reads', () => {
    // ── THIS NAMED THE ORPHAN, AND THE ORPHAN WAS DELETED ──────────────────────────────────
    //
    // It asserted that `src/websocket/progress-server.ts` EXISTS and is unreachable. That module
    // was a second, parallel WebSocket server for a protocol no client speaks; F5 merged its
    // heartbeat into `server/ws.ts` — the stack that does have a client and a ticket endpoint —
    // and deleted it. A guard that requires a dead file to keep existing turns "we removed dead
    // code" into a test failure, which is the wrong incentive.
    //
    // The property it exists for is not about that file: it is that the walk is a WALK, so a key
    // read only by something nothing imports is not counted as this process's business. Stated
    // against the walk itself now — there are unreachable files, and the walk excludes them —
    // which stays true whichever module happens to be orphaned this month.
    const allSrc = listSourceFiles(path.join(ROOT, 'src'));
    const unreachable = allSrc.filter((f) => !REACHABLE.has(f) && !f.includes('__tests__'));

    // CONTROL: if everything were reachable, the assertion below would be vacuous and the guard
    // would pass against a "walk" that simply returned every file.
    expect(unreachable.length, 'nothing in src/ is unreachable — the walk is not walking')
      .toBeGreaterThan(0);
    for (const f of unreachable) expect(REACHABLE.has(f)).toBe(false);
  });

  it('every key /health judges is read by a module that actually runs', () => {
    const reachableSrc = [...REACHABLE]
      .filter((f) => f !== ENTRY)
      .map((f) => fs.readFileSync(f, 'utf8'));

    const orphaned = keysHealthClaims()
      .filter((k) => !RUNTIME_OWNED.has(k))
      .filter((k) => !reachableSrc.some((s) => s.includes(k)))
      .sort();

    expect(orphaned, '/health reports on these, and no module reachable from index.ts reads them. '
      + 'A health check is a claim about the process making it. Reporting on another process\'s '
      + 'configuration is guessing with authority — the operator reads a green light, or "fixes" it '
      + 'by setting a key on a machine that ignores it:\n  ' + orphaned.join('\n  ')).toEqual([]);
  });

  it('does not judge WS_TICKET_SECRET — the instance this half of the guard was built from', () => {
    expect(keysHealthClaims()).not.toContain('WS_TICKET_SECRET');
  });

  it('still judges the keys that ARE the worker\'s business', () => {
    // Control, again: the assertion above passes trivially if the scanner matches nothing.
    const claimed = keysHealthClaims();
    for (const k of ['ANTHROPIC_API_KEY', 'REDIS_URL', 'STORAGE_BACKEND']) {
      expect(claimed).toContain(k);
    }
  });
});

describe('health.ts guard — control', () => {
  it('still checks the keys that ARE this process\'s business', () => {
    // Without this, the health.ts assertion above would pass just as well if `configWarnings` were
    // gutted, or if the scanner silently matched nothing.
    for (const k of ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'WORKER_API_KEY', 'TEXASFILE_USERNAME']) {
      expect(CHECKED).toContain(k);
    }
  });
});

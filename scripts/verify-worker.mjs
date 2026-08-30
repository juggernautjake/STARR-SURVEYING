// scripts/verify-worker.mjs — is the research worker reachable, from OUT HERE?
//
//   npm run verify:worker                       # uses WORKER_URL / WORKER_API_KEY from the env
//   npm run verify:worker -- https://host       # or an explicit base URL
//
// Exit 0 when the worker can take a deep run. Exit 1 otherwise. W5 of
// docs/planning/in-progress/RESEARCH_WORKER_REBUILD_AND_GROWTH_2026-08-26.md.
//
// ── WHY THIS EXISTS WHEN W4 ARGUED AGAINST A SCRIPT ─────────────────────────────────────────────
//
// W4 decided not to build one, and the reasoning was right: `/admin/research` already renders
// `WorkerStatusBanner`, which probes over the real hostname through the real TLS and names which of
// four situations you are in. A CLI that RE-DERIVED that judgement would be a second, worse copy —
// the failure mode this repo is most prone to.
//
// This is not that. It imports `interpretWorkerProbe` and renders its verdict. One brain, two
// callers: a browser needs an admin session, and the thing W5 actually asks for is
//
//     "Reboot the new box and curl /health from your own machine"
//
// which nobody can do from a browser at 3am, and which wants an EXIT CODE so it can live in a cron
// or a post-reboot check rather than in somebody's memory. The last worker died by silently never
// coming back, and this is the check that would have caught it.
//
// ── IT PROBES /healthz, NOT /health, AND THAT DISTINCTION HAS BITTEN BEFORE ──────────────────────
//
// A Dockerfile once polled `/healthz` while the worker served only `/health`. Both exist now, and
// `interpretWorkerProbe` reads the `/healthz` SHAPE — `browser.ok`, `queue`, `warnings` — so this
// must ask for the same one the interpreter was written against.
//
// ── UNAUTHENTICATED ON PURPOSE ──────────────────────────────────────────────────────────────────
//
// `/healthz` takes no key, which is what makes this runnable from a laptop that holds no secret. The
// authenticated surface is a separate question and a separate failure: a worker can be perfectly
// reachable and still reject the app's key. That is `degraded`-adjacent and belongs to the banner,
// which probes as the app.

import { interpretWorkerProbe } from '../lib/research/worker-status.ts';

const argUrl = process.argv.slice(2).find((a) => a.startsWith('http'));
const base = (argUrl ?? process.env.WORKER_URL ?? '').replace(/\/+$/, '');
const TIMEOUT_MS = 15_000;

/** Probe the worker. Never throws — a thrown error is a probe that reports nothing. */
async function probe() {
  if (!base) return { configured: false, httpStatus: null, body: null, latencyMs: 0 };

  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/healthz`, { signal: ac.signal });
    const body = await res.json().catch(() => null);
    return { configured: true, httpStatus: res.status, body, latencyMs: Date.now() - started };
  } catch (e) {
    // DNS, refused, TLS, timeout. `httpStatus: null` is what tells the interpreter this never
    // reached the server at all — distinct from reaching it and being told no.
    return {
      configured: true,
      httpStatus: null,
      body: null,
      transportError: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

const verdict = interpretWorkerProbe(await probe());

const MARK = { ok: '✓', degraded: '!', unreachable: '✗', not_configured: '·' };
console.log(`${MARK[verdict.state] ?? '?'} ${verdict.state.toUpperCase()}  ${base || '(no WORKER_URL)'}`);
console.log(`  ${verdict.headline}`);
if (verdict.hint) console.log(`  → ${verdict.hint}`);
if (verdict.version) {
  console.log(`  v${verdict.version}${verdict.buildSha ? ` (${verdict.buildSha})` : ''} · ${verdict.latencyMs}ms`
    + (verdict.activePipelines !== undefined ? ` · ${verdict.activePipelines} active` : ''));
}

// Warnings are the worker telling you what it CANNOT do while otherwise being fine. They are not
// failures and must not change the exit code — a missing TexasFile login is a real gap and not a
// reason for a post-reboot check to go red.
for (const w of verdict.warnings) console.log(`  ⚠ ${w}`);

// `degraded` exits 1 deliberately. It is worse than down because it looks up: the worker answers,
// accepts work, and fails it twenty minutes in.
process.exit(verdict.canRunDeep ? 0 : 1);

// scripts/verify-worker.mjs — is the research worker reachable, from OUT HERE?
//
//   npm run verify:worker                       # uses WORKER_URL / WORKER_API_KEY from the env
//   npm run verify:worker -- https://host       # or an explicit base URL
//
// Exit 0 when the worker can take a deep run. Exit 1 otherwise. W5 of
// docs/planning/completed/RESEARCH_WORKER_REBUILD_AND_GROWTH_2026-08-26.md.
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
// ── /healthz IS UNAUTHENTICATED, WHICH IS WHY THERE IS A SECOND CHECK ───────────────────────────
//
// `/healthz` takes no key, which is what makes the main check runnable from a laptop holding no
// secret. But it therefore cannot answer the question that actually breaks deployments: **do the
// app's key and the worker's key agree?**
//
// A worker can be perfectly healthy, publicly reachable, TLS-valid — and reject every request the
// app makes. Nothing in `/healthz` would show it. The two keys live in different places (Doppler →
// Vercel for the app; `/opt/starr/worker/.env` for the worker) and were typed on different days.
//
// So: when `WORKER_API_KEY` is present in the environment, this also calls an authenticated
// endpoint and reports whether that key is accepted.
//
//     doppler run --config prd -- npm run verify:worker
//
// `GET /research/active` is the right endpoint for it — authenticated, read-only, and it starts
// nothing and spends nothing. It returns the list of in-flight runs.
//
// The three outcomes are deliberately kept distinct, because two of them are 4xx and they mean
// opposite things:
//
//     200  the keys agree
//     403  reached the worker, key REJECTED — the app and the worker disagree
//     401  no Authorization header sent — a bug in THIS script, not in the deployment
//
// Absent `WORKER_API_KEY`, the check is skipped and says so. Skipping silently would let a laptop
// run look like a passing credential check.

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

/** Do the app's key and the worker's key agree? Only asked when we hold a key to ask with. */
async function checkCredentials() {
  const key = process.env.WORKER_API_KEY;
  if (!base) return null;
  if (!key) {
    console.log('  · key check SKIPPED — no WORKER_API_KEY in this environment.');
    console.log('    Run `doppler run --config prd -- npm run verify:worker` to check it.');
    return null;
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/research/active`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: ac.signal,
    });
    if (res.status === 200) {
      const body = await res.json().catch(() => ({}));
      console.log(`  ✓ WORKER_API_KEY accepted — ${body.count ?? 0} run(s) in flight.`);
      return true;
    }
    if (res.status === 403) {
      console.log('  ✗ WORKER_API_KEY REJECTED (403). The app and the worker hold DIFFERENT keys.');
      console.log('    Compare Doppler `prd` against /opt/starr/worker/.env — they must be identical.');
      return false;
    }
    // 401 means no header reached the worker, which would be a bug here rather than a deployment
    // problem. Saying which is the whole point of separating them.
    console.log(`  ? key check inconclusive — HTTP ${res.status}.`
      + (res.status === 401 ? ' No Authorization header arrived; that is a bug in this script.' : ''));
    return null;
  } catch (e) {
    console.log(`  ? key check could not run — ${e instanceof Error ? e.message : String(e)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const keysAgree = await checkCredentials();

// `degraded` exits 1 deliberately. It is worse than down because it looks up: the worker answers,
// accepts work, and fails it twenty minutes in.
//
// A REJECTED key also exits 1: a worker the app cannot authenticate to is, from the app's side,
// no worker at all. `null` — skipped or inconclusive — does not, because "we could not ask" must
// not read the same as "we asked and the answer was no". That distinction is the one this whole
// script exists to preserve.
process.exit(verdict.canRunDeep && keysAgree !== false ? 0 : 1);

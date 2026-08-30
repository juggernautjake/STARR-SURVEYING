// `npm run verify:worker` is a second CALLER, not a second copy.
//
// ── WHAT THIS IS DEFENDING ──────────────────────────────────────────────────────────────────────
//
// W4 of the rebuild plan decided against a CLI worker check, and the reasoning was sound:
// `/admin/research` already renders `WorkerStatusBanner`, which probes over the real hostname
// through real TLS and names which of four states you are in. A CLI that RE-DERIVED that judgement
// would be a second, worse copy — and a second copy of a list or a rule is the defect this repo has
// hit more than any other.
//
// The script exists anyway because W5 asks for something a browser cannot give: an EXIT CODE, after
// a reboot, with no admin session. The way to have both is for the script to import
// `interpretWorkerProbe` and render its verdict — one brain, two callers.
//
// That distinction is invisible to a reader six months from now, and the cheapest way to lose it is
// for somebody to "simplify" the script by inlining a couple of status checks. So it is asserted.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPT = 'scripts/verify-worker.mjs';
const src = fs.readFileSync(path.join(ROOT, SCRIPT), 'utf8');

describe('verify-worker reuses the interpreter rather than reimplementing it', () => {
  it('imports interpretWorkerProbe from the module the banner uses', () => {
    expect(src).toMatch(/import \{ interpretWorkerProbe \} from '.*worker-status/);
  });

  it('does not derive a state of its own', () => {
    // The four state names may only APPEAR as output formatting (the MARK table). What must not
    // appear is the script deciding which one applies — a comparison or assignment against them.
    for (const state of ['degraded', 'unreachable', 'not_configured']) {
      expect(src).not.toMatch(new RegExp(`state\\s*[=:]==?\\s*['"]${state}['"]`));
      expect(src).not.toMatch(new RegExp(`===\\s*['"]${state}['"]`));
    }
  });

  it('gates the exit code on canRunDeep, the interpreter\'s own answer', () => {
    // Not on `state === 'ok'`, which would silently disagree the day a fifth state is added.
    // The key check is ANDed in, so this matches the property rather than one exact string — an
    // earlier version pinned the literal line and went red the moment the key check was added,
    // which is a test asserting its own history rather than the rule it cares about.
    expect(src).toMatch(/process\.exit\(\s*verdict\.canRunDeep\b/);
    expect(src).not.toMatch(/process\.exit\([^)]*state === 'ok'/);
  });

  it('probes /healthz, the endpoint the interpreter was written against', () => {
    // A Dockerfile once polled /healthz while the worker served only /health. Both exist now, and
    // interpretWorkerProbe reads the /healthz SHAPE — browser.ok, queue, warnings.
    expect(src).toContain('/healthz');
  });

  it('treats a transport failure as httpStatus null, not as a thrown error', () => {
    // A probe that throws reports nothing. `httpStatus: null` is what tells the interpreter the
    // request never reached the server — distinct from reaching it and being refused.
    expect(src).toMatch(/httpStatus:\s*null/);
    expect(src).toMatch(/transportError:/);
  });

  it('checks whether the app and worker keys AGREE, which /healthz cannot answer', () => {
    // `/healthz` is unauthenticated, so a worker can be healthy, reachable and TLS-valid while
    // rejecting every request the app makes. The two keys live in different places and were typed
    // on different days.
    expect(src).toContain('/research/active');
    expect(src).toMatch(/Authorization.*Bearer/);
  });

  it('distinguishes a rejected key (403) from a missing header (401)', () => {
    // Both are 4xx and they mean opposite things: 403 is a deployment problem, 401 would be a bug
    // in this script. Collapsing them is how somebody spends an afternoon on the wrong one.
    expect(src).toMatch(/res\.status === 403/);
    expect(src).toMatch(/401/);
  });

  it('a SKIPPED key check does not fail the run, but a REJECTED one does', () => {
    // "We could not ask" must not read the same as "we asked and the answer was no". Hence the
    // explicit `!== false` — null means unknown and only false means disagreement.
    expect(src).toMatch(/keysAgree !== false/);
    expect(src).toContain('key check SKIPPED');
  });

  it('does not let warnings change the exit code', () => {
    // Warnings are the worker saying what it CANNOT do while otherwise being fine. A missing
    // TexasFile login is a real gap and not a reason for a post-reboot check to go red.
    const exitLines = src.split('\n').filter((l) => l.includes('process.exit'));
    expect(exitLines).toHaveLength(1);
    expect(exitLines[0]).not.toContain('warnings');
  });
});

describe('verify-worker is actually runnable', () => {
  it('package.json wires the script, with type-stripping for the .ts import', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const cmd = pkg.scripts['verify:worker'];
    expect(cmd).toBeTruthy();
    expect(cmd).toContain(SCRIPT);
    // It imports a TypeScript module directly; without this flag the script fails at import time
    // and every run reports a broken worker regardless of the worker.
    expect(cmd).toContain('--experimental-strip-types');
  });
});

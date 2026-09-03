// worker/src/__tests__/auto-update-health-gate.test.ts
//
// ── THE GATE THAT WOULD HAVE REVERTED EVERY GOOD DEPLOY ─────────────────────────────────────────
//
// `auto-update.sh` rebuilds the worker, then waits for the new container to report healthy ON ITS
// OWN BUILD before accepting the deploy. That second half is the important one — a container that
// failed to restart keeps answering on the OLD build, and a check that only asks "are you healthy?"
// reads that as success.
//
// The gate required `"status":"healthy"`. `HEALTH_URL` defaults to **/healthz**, which answers
// `"status":"ok"`; only the deeper **/health** ever says `"healthy"`. So it could never match:
// every deploy would be judged unhealthy, rolled back, and logged as *"investigate before merging
// further"* — about a build that was fine.
//
// Nothing in the script looked wrong on its own, and nothing in the worker looked wrong either. The
// defect existed only BETWEEN them, which is why this file tests the script's patterns against the
// worker's actual response shapes rather than either in isolation. Same shape as the `skipped_work`
// `{ step }` vs `{ what }` mismatch found the same week.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT = fs.readFileSync(
  path.join(process.cwd(), 'deploy/auto-update.sh'),
  'utf8',
);

/** The status regex the script greps for, extracted from the script itself. */
function statusPattern(): RegExp {
  const m = SCRIPT.match(/grep -qE '"status"\[\[:space:\]\]\*:\[\[:space:\]\]\*"\(([a-z|]+)\)"'/);
  expect(m, 'the status gate should still be a grep -qE alternation').not.toBeNull();
  // `[[:space:]]*` in POSIX ERE is `\s*` here; the alternation is what this file is about.
  return new RegExp(`"status"\s*:\s*"(${m![1]})"`);
}

/** Exactly what the live worker returned on 2026-08-31, kept verbatim. */
const HEALTHZ_OK = '{"status":"ok","version":"5.1.0","buildSha":"555f43104","uptimeSeconds":94,"browser":{"backend":"local","browserbaseAdapters":["cad"]},"warnings":[]}';

/** What the deeper /health endpoint returns — worker/src/index.ts:932. */
const HEALTH_HEALTHY = '{"status":"healthy","version":"5.1.0","uptime":94,"checks":{}}';
const HEALTH_DEGRADED = '{"status":"degraded","version":"5.1.0","uptime":94,"checks":{}}';

describe('the health gate matches what the worker actually says', () => {
  it('accepts /healthz — the endpoint HEALTH_URL defaults to', () => {
    // The assertion that would have failed before the fix, using a real captured response.
    expect(statusPattern().test(HEALTHZ_OK), '/healthz says "ok", not "healthy"').toBe(true);
  });

  it('accepts /health for anyone who points HEALTH_URL at the deeper check', () => {
    expect(statusPattern().test(HEALTH_HEALTHY)).toBe(true);
  });

  it('still REJECTS a degraded worker', () => {
    // Widening the alternation must not widen it into "accept anything". A degraded build is
    // exactly what the rollback exists for.
    expect(statusPattern().test(HEALTH_DEGRADED)).toBe(false);
  });

  it('HEALTH_URL really does default to /healthz', () => {
    // If this default ever changes to /health, the alternation above still covers it — but the
    // pairing is the thing that broke, so it is worth pinning that they are checked together.
    expect(SCRIPT).toMatch(/HEALTH_URL="\$\{HEALTH_URL:-[^"]*\/healthz\}"/);
  });
});

describe('the rest of the deploy gate', () => {
  it('requires the NEW sha, not merely a healthy answer', () => {
    // A container that failed to restart keeps serving the old build and answering healthily.
    // Asserted by LINE rather than by an escaped literal: the script's own text is full of
    // backslashes and bracket expressions, and a test that has to re-escape them tests the escaping
    // rather than the behaviour.
    const gate = SCRIPT.split('\n').filter((l) => l.includes('grep -q') && l.includes('buildSha'));
    expect(gate.length, 'the sha check should be exactly one grep').toBe(1);
    expect(gate[0], 'it must compare against the sha we just built').toContain('WANT_SHA');
  });

  it('passes BUILD_SHA into the build, or buildSha can never match', () => {
    // The Dockerfile takes `ARG BUILD_SHA=unknown`. Without this the container reports "unknown",
    // the sha check never matches, and the gate rolls back every deploy for a second reason.
    expect(SCRIPT).toMatch(/BUILD_SHA="\$\(git rev-parse --short HEAD\)" docker compose up -d --build/);
  });

  it('rolls back on failure and shouts if the rollback also fails', () => {
    expect(SCRIPT).toContain('ROLLBACK ALSO FAILED');
  });

  it('refuses to deploy over a run in flight', () => {
    // A research run takes 20-30 minutes and may have spent money.
    expect(SCRIPT).toContain('research run(s) in flight');
  });

  it('only ever deploys main', () => {
    expect(SCRIPT).toContain('git pull --ff-only --quiet origin main');
  });
});

// ── A FAILED PULL IS NOT AUTOMATICALLY A HISTORY PROBLEM ────────────────────────────────────────
//
// Measured on the live box, 2026-09-02. The GitHub credential expired; `git pull` failed with
// `could not read Username for 'https://github.com'`; and the journal said:
//
//     ERROR: git pull is not a fast-forward — the box has local commits or a rewritten history;
//            fix by hand
//
// The box had no local commits. The script asserted a cause it had never checked, and the one
// genuinely diagnostic line — git's own, two lines above — was easy to miss under a confident wrong
// conclusion. In an unattended log a wrong diagnosis is worse than none, because it gets acted on.
//
// `git fetch` has already succeeded by the time the pull runs, so the fast-forward question is
// ANSWERABLE rather than guessable.

describe('the pull failure explains itself honestly', () => {
  it('asks whether HEAD really is an ancestor before blaming history', () => {
    expect(SCRIPT).toContain('git merge-base --is-ancestor HEAD origin/main');
  });

  it('names the credential case, which is what actually happened', () => {
    // The error text git itself prints, so a reader can match the journal line to this branch.
    expect(SCRIPT).toContain("could not read Username");
    expect(SCRIPT).toMatch(/NOT a history problem/);
  });

  it('still reports a genuine non-fast-forward as one', () => {
    // The original message was right for the case it was written for. Losing that would trade
    // one wrong diagnosis for another.
    expect(SCRIPT).toMatch(/is not an ancestor of origin\/main/);
    expect(SCRIPT).toMatch(/local commits or the history was rewritten/);
  });

  it('CONTROL: the bare unconditional claim is gone', () => {
    // Read with SHELL COMMENTS STRIPPED. The fix's own comment quotes the old line verbatim so a
    // future reader can see what changed — and this probe matched that prose on its first run,
    // reporting the old code as still present. Same failure as the JSX-comment and Accept-header
    // cases elsewhere in this repo: a probe that cannot tell code from a description of code.
    const CODE = SCRIPT.replace(/^[ \t]*#[^\n\r]*/gm, '');
    // CONTROL for the control: if stripping ate the script the assertion below would pass for
    // the wrong reason.
    expect(CODE.includes('die '), 'comment stripping destroyed the script').toBe(true);

    // The exact old line. If someone restores it this fails, rather than quietly passing because
    // the new strings happen to exist elsewhere in the file.
    expect(CODE).not.toMatch(
      /\|\|\s*die "git pull is not a fast-forward — the box has local commits/,
    );
  });
});

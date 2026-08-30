// The watchdog ROUTE — the half its policy tests could not see.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────
//
// `worker-watchdog.test.ts` covers the alerting policy exhaustively: every (previous, current) pair,
// every escalation level. All of it passed while the route queried `from('users')` — a table this
// system does not have. The policy was perfect and would never have been handed a recipient.
//
// A watchdog that queries a non-existent table gets nothing back, notifies nobody, and returns 200.
// That is the precise failure the watchdog was written to prevent, reproduced inside it, and the
// only thing that caught it was `schema-coverage.test.ts` in a full-suite run — a global check that
// happens to cover every route, not anything specific to this one.
//
// So: assert the things a pure-function test structurally cannot. Which table, which filter, and
// that the state is persisted on every tick rather than only when an alert fires.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raw = fs.readFileSync(path.join(process.cwd(), 'app/api/cron/worker-health/route.ts'), 'utf8');

/** The file with comments removed — line comments first, then block comments.
 *
 *  Not fastidiousness. The first version of this test scanned the raw source and failed its own
 *  `not.toMatch(/from\('users'\)/)` assertion — because the comment explaining that bug QUOTES
 *  `from('users')` while describing it. The test was reading a sentence about the code as the code.
 *
 *  `scripts/derive-portal-tabs.mjs` has the same guard for the same reason, and its header records
 *  the same shape: `/admin/messages` derived a duplicate tab because a comment discussed `id:
 *  'contacts'` in prose. Any assertion of the form "this string must NOT appear" is unsafe on a
 *  codebase whose comments explain what used to be there. */
const src = raw
  .split('\r\n').join('\n')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('worker-health route — recipients', () => {
  it('reads registered_users, the table that exists', () => {
    expect(src).toContain("from('registered_users')");
    // The original bug, pinned by name. `users` is not a table in this system, and this route was
    // the only place in the repo that said otherwise.
    expect(src).not.toMatch(/from\('users'\)/);
  });

  it('filters admins in Postgres, the way every other admin lookup here does', () => {
    // Also sidesteps the `roles: []` trap: an empty array means NO roles, not every role, and
    // reading it back to filter in JS is where that has been got wrong before.
    expect(src).toContain('roles.cs.{admin}');
  });

  it('excludes banned accounts using the column that exists', () => {
    // `registered_users` has `is_banned boolean`. It has no `status` column, so an
    // `.eq('status', 'active')` would return nothing even against the right table — which is what
    // the first version did, giving two independent reasons for the same silent nothing.
    expect(src).toContain('is_banned');
    expect(src).not.toMatch(/\.eq\('status'/);
  });
});

describe('worker-health route — the parts that are easy to get backwards', () => {
  it('persists the observed state OUTSIDE the notify branch', () => {
    // Written only on an alert, a deliberately-quiet recovery would leave `unreachable` on disk and
    // the NEXT genuine outage would compare bad-to-bad and say nothing at all. The stored value is
    // a record of what was last OBSERVED, not of what was last announced.
    // Indentation IS the assertion here, and stated plainly rather than sliced out of the string:
    // at exactly two spaces the upsert is at function scope, so it runs on every tick. Nested
    // inside `if (decision.notify) { … }` it would be indented four or more.
    expect(src).toMatch(/^ {2}await supabaseAdmin\.from\('app_settings'\)\.upsert\(/m);
    // And it must come after the notify block, not before — writing the new state first would make
    // `previous` read as the current one and no transition would ever be detected.
    expect(src.indexOf("from('app_settings').upsert"))
      .toBeGreaterThan(src.indexOf('if (decision.notify)'));
  });

  it('is authenticated with CRON_SECRET and refuses without it', () => {
    expect(src).toContain('CRON_SECRET');
    expect(src).toMatch(/status:\s*401/);
    // A missing secret must be a 500, not an open door.
    expect(src).toMatch(/status:\s*500/);
  });

  it('probes /healthz and never throws out of the probe', () => {
    // A probe that throws reports nothing, and "reports nothing" is indistinguishable from "the
    // worker is fine" to everything downstream.
    expect(src).toContain('/healthz');
    expect(src).toMatch(/catch \(e\)/);
    expect(src).toMatch(/httpStatus:\s*null/);
  });

  it('delegates the verdict rather than deciding one', () => {
    // Three callers, one brain: the admin banner, `npm run verify:worker`, and this.
    expect(src).toContain('interpretWorkerProbe');
    expect(src).toContain('decideWatchdogAlert');
    expect(src).not.toMatch(/===\s*'degraded'/);
  });
});

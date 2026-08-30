// Every outbound sender must say when it cannot send.
//
// ── WHAT THIS TURNS INTO A STANDING GUARANTEE ───────────────────────────────────────────────────
//
// On 2026-08-29 a sweep of every direct Resend/Twilio caller found four that reported success for
// messages they never sent, and five that were already honest. The four were fixed. This test exists
// so the eighth sender cannot quietly repeat it — the sweep was manual, and a manual sweep protects
// only the day it was run.
//
// The failure mode is specific and it is not "the send failed". It is:
//
//     if (!API_KEY) { console.info('DEV mode — would send'); return true; }
//
// with no environment check. In production that is a message which could not possibly be delivered,
// logged at the one severity nobody greps, using the one word that tells a reader it does not apply
// to them, returning a value that says it worked. One of these ran for seven months. Another wrote
// `WEEKLY_REPORT_SENT` into the audit log. A third told a customer to "check server logs".
//
// ── THE RULE, AND WHY IT IS SHAPED THIS WAY ─────────────────────────────────────────────────────
//
// A file that talks to a delivery provider must, somewhere, do ONE of:
//
//   · branch on `NODE_ENV === 'production'` — the fixed shape: error, name the variable, return false
//   · capture a `sendError` / `send_error` and hand it back to its caller — the shape the five
//     already-correct routes use, and just as good: the caller learns the truth either way
//
// This is deliberately a check for "reports failure SOMEHOW", not for one blessed implementation.
// Forcing five honest routes to be rewritten in the fourth one's style would be churn, and a lint
// rule that mandates a single shape is how a good pattern becomes a ritual.
//
// ── IT RATCHETS ON A LIST, NOT A COUNT ──────────────────────────────────────────────────────────
//
// Unlike the orphan guard, the set here is small and each member is nameable, so the test names them.
// A new sender is a deliberate addition to this list plus a decision about how it reports failure —
// which is exactly the moment to make that decision, rather than six months later in an incident.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

/** Files that POST to a delivery provider. Found rather than hard-coded, so a new one shows up. */
function senderFiles(): string[] {
  const tracked = execSync('git ls-files lib app', { cwd: ROOT }).toString().trim().split('\n');
  return tracked.filter((f) => {
    if (!f.endsWith('.ts') || f.includes('__tests__')) return false;
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    return /api\.resend\.com|api\.twilio\.com/.test(src);
  });
}

/** Does this file report a delivery failure to somebody, in either accepted shape? */
function reportsFailure(src: string): boolean {
  const gatesOnProduction = /NODE_ENV === 'production'/.test(src)
    && /console\.error/.test(src);
  // Deliberately broad on the NAME. The first version matched only `sendError`/`send_error`, and so
  // read `public/invoice/…/attempt` — which calls its variable `pledgeEmailError` — as honest,
  // exactly as the manual sweep had. That route was in fact claiming `pledgeEmailSent = true` with
  // no key. A guard whose vocabulary is narrower than the codebase's is a guard that agrees with
  // whoever wrote it.
  const surfacesSendError = /\b\w*(sendError|send_error|EmailError|email_error)\b/.test(src);
  return gatesOnProduction || surfacesSendError;
}

const FILES = senderFiles();

describe('outbound senders report failure', () => {
  it('found a plausible number of senders — a broken scanner is worse than no scanner', () => {
    // If this collapses to zero, every assertion below passes vacuously and the guard is decorative.
    // Nine at the time of writing: two adapters and seven direct callers.
    expect(FILES.length).toBeGreaterThanOrEqual(7);
  });

  it('every sender reports a delivery failure to somebody', () => {
    const silent = FILES.filter((f) => !reportsFailure(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(silent, 'these talk to a delivery provider but have no path that reports a failure — '
      + 'either branch on NODE_ENV === "production" with a console.error naming the missing '
      + `variable, or capture a sendError and return it:\n  ${silent.join('\n  ')}`).toEqual([]);
  });

  it('no sender says "DEV mode" without first excluding production', () => {
    // The exact string that hid this for seven months. It is fine — useful, even — in a local clone.
    // What is not fine is reaching it in production.
    const offenders = FILES.filter((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      // Either gate is fine — `=== 'production'` (take the error path) or `!== 'production'` (skip
      // the log). The rule is that the environment is consulted at all, not which way the branch
      // reads. Written as `===` only at first, which failed the two routes gated with `!==`: the
      // check was narrower than the correct fix, which is its own small version of this bug.
      return /DEV mode|DEV —/i.test(src) && !/NODE_ENV [!=]== 'production'/.test(src);
    });
    expect(offenders, 'these log "DEV mode" on a path production can reach:\n  '
      + offenders.join('\n  ')).toEqual([]);
  });

  it('the two notification adapters are among the files scanned', () => {
    // A control on the finder itself. If the scan silently stopped matching — a changed endpoint
    // constant, a moved file — the assertions above would go green by finding nothing.
    expect(FILES).toContain('lib/saas/notifications/email.ts');
    expect(FILES).toContain('lib/saas/notifications/sms.ts');
  });
});

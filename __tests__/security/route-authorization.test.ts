// __tests__/security/route-authorization.test.ts — the sweep, pinned (B1-1 … B1-4).
//
// The surveying analysis opens with a near-miss: a first sweep reported 328 of 340 admin routes as
// unauthenticated because it grepped for `getServerSession` and this repo uses `auth()`. **The same thing
// happened again while building this**, with a different wrong predicate — `/\b(auth\(\)|…)\b/`, where the
// trailing `\b` cannot match after `)`. It reported 246 of 613 admin handlers as ungated.
//
// So the rule that matters is the one that caught it both times: **check the tool before believing the
// measurement.** `scripts/audit-route-auth.mjs` prints its predicates with every run for exactly that
// reason, and this file asserts the predicates recognise the gates this codebase actually uses — because
// a predicate that stops matching does not fail loudly, it quietly grows the hole list until someone
// decides the list is normal.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'audit-route-auth.mjs');
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function runSweep(): { output: string; code: number } {
  try {
    return { output: execFileSync('node', [SCRIPT], { encoding: 'utf8' }), code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { output: err.stdout ?? '', code: err.status ?? 1 };
  }
}

describe('B1-1 — every handler is gated, or says in writing why it is not', () => {
  const { output, code } = runSweep();

  it('leaves no handler both ungated and unexplained', () => {
    // The ratchet. Adding an unauthenticated endpoint requires writing down why it is one, and "nobody
    // got round to it" cannot be written down.
    expect(output, 'the sweep reported ungated handlers').toContain('No ungated handlers');
    expect(code, 'the sweep exits non-zero when a handler is ungated and unexplained').toBe(0);
  });

  it('sweeps HANDLERS, not files', () => {
    // A file whose GET is public and whose DELETE is not gated is not a "gated route", and per-file
    // counting is exactly how a hole hides inside a mostly-safe file.
    expect(output).toMatch(/HANDLERS \(not files\)/);
    const total = Number(output.match(/Total handlers: (\d+)/)?.[1] ?? 0);
    expect(total, 'far more handlers than route files — one file can export five').toBeGreaterThan(700);
  });

  it('still finds the admin surface fully gated, which is what the analysis claimed', () => {
    expect(output).toMatch(/admin\s+total\s+\d+\s+gated\s+\d+\s+public-by-design 0\s+UNGATED 0/);
  });
});

describe('the predicates themselves, because a wrong one shrinks the count silently', () => {
  const SRC = read('scripts/audit-route-auth.mjs');

  it('prints them with every run', () => {
    const { output } = runSweep();
    expect(output).toMatch(/Predicates used/);
  });

  it('recognises the gates this codebase actually uses', () => {
    // Each of these was found by opening a route the sweep had called ungated. If one is removed, the
    // sweep starts reporting real routes as holes — which is survivable — or, worse, a rename makes it
    // stop matching and the hole list grows until somebody decides the list is normal.
    for (const gate of ['auth\\(\\)', 'isAdmin', 'getCampaignRole', 'getCharacterAccess', 'getDndSession']) {
      expect(SRC, `${gate} must be a recognised gate`).toMatch(new RegExp(gate));
    }
  });

  it('does NOT put a word boundary after `auth()`', () => {
    // The bug this file exists to remember. `\b` after `)` cannot match — the next character is `;` or a
    // newline, both non-word — so the predicate matched nothing and 246 gated handlers looked like holes.
    expect(SRC).not.toMatch(/auth\\\(\\\)[^|]*\\b\)/);
    expect(SRC).toMatch(/\\bauth\\\(\\\)\|/);
  });
});

describe('B1-2 — the destructive handlers, specifically', () => {
  it('none is ungated', () => {
    // "Signed in" is never sufficient for a DELETE: the question is always WHOSE it is. This asserts the
    // weaker property the sweep can see — that none is reachable with no gate at all.
    const { output } = runSweep();
    expect(output).toMatch(/ungated destructive: 0/);
  });
});

describe('B1-3 — the webhooks verify more than a signature', () => {
  const STRIPE = read('app/api/webhooks/stripe/route.ts');
  const INBOUND = read('app/api/webhooks/email-inbound/route.ts');

  it('Stripe checks the signature in constant time', () => {
    expect(STRIPE).toMatch(/timingSafeEqual/);
  });

  it('Stripe rejects a REPLAY, not just a forgery', () => {
    // A valid signature is valid forever without this — an attacker who captures one request can send it
    // again tomorrow. Stripe's own tolerance is five minutes.
    expect(STRIPE).toMatch(/tolerance/);
    expect(STRIPE).toMatch(/is too old|timestamp/);
  });

  it('Stripe de-duplicates a redelivered event', () => {
    // Different from replay: Stripe itself retries, legitimately and with a valid signature. Processing a
    // payment event twice is a money bug, not a security one, and the dedup ledger is what stops it.
    expect(STRIPE).toMatch(/processed_webhook_events/);
  });

  it('the inbound-email webhook compares its secret in constant time too', () => {
    // It did not, and the difference from the Stripe route beside it was not a decision anyone made.
    // `!==` short-circuits at the first differing character, which leaks how much of the secret a caller
    // has right — only worth exploiting against an endpoint anyone may call repeatedly, i.e. a webhook.
    expect(INBOUND).toMatch(/timingSafeEqualStr/);
    // Comments stripped: the file EXPLAINS why `provided !== secret` was wrong, and the explanation is
    // the reason the fix survives. Asserting against the raw text would forbid writing it down.
    const statements = INBOUND.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
    expect(statements).not.toMatch(/provided !== secret/);
  });

  it('and de-duplicates its retries', () => {
    expect(INBOUND).toMatch(/inbound_message_id|23505/);
  });
});

describe('B1-4 — the service role bypasses RLS, so the handler is the only check', () => {
  it('no handler uses supabaseAdmin without a gate', () => {
    // `supabaseAdmin` ignores row-level security entirely. On an ungated route that is not "a missing
    // login", it is direct table access for anyone who finds the URL.
    const { output } = runSweep();
    expect(output).toMatch(/ungated service-role: 0/);
  });

  it('the sweep counts and reports them, so the number cannot drift unnoticed', () => {
    const { output } = runSweep();
    const n = Number(output.match(/Service-role handlers: (\d+)/)?.[1] ?? 0);
    expect(n).toBeGreaterThan(500);
  });
});

// "What is still missing before real money can move?"
//
// The failure this guards: `sk_test_` and `sk_live_` differ by four characters, Stripe issues both
// from the same screen, and a card charged against a test key returns a perfectly successful
// response. The customer sees a receipt; the money does not exist; nothing downstream can tell.

import { describe, it, expect } from 'vitest';
import { classifyStripeKey, paymentsReadiness, readinessSummary } from '@/lib/payments/readiness';

const LIVE = {
  STRIPE_SECRET_KEY: 'sk_live_abc123',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_abc123',
  STRIPE_WEBHOOK_SECRET: 'whsec_abc123',
  NODE_ENV: 'test',
} as NodeJS.ProcessEnv;

const find = (env: NodeJS.ProcessEnv, id: string, companyCards = 1) =>
  paymentsReadiness({ env, companyCards }).find((c) => c.id === id)!;

describe('classifyStripeKey', () => {
  it('tells live from test', () => {
    expect(classifyStripeKey('sk_live_x', 'sk')).toBe('live');
    expect(classifyStripeKey('sk_test_x', 'sk')).toBe('test');
    expect(classifyStripeKey('pk_live_x', 'pk')).toBe('live');
    expect(classifyStripeKey('pk_test_x', 'pk')).toBe('test');
  });

  it('rejects a key of the WRONG FAMILY, which is the dangerous mix-up', () => {
    // A secret key pasted into the publishable variable publishes a secret to every visitor.
    expect(classifyStripeKey('sk_live_x', 'pk')).toBe('malformed');
    expect(classifyStripeKey('pk_live_x', 'sk')).toBe('malformed');
  });

  it('handles the webhook secret, which has its own prefix', () => {
    expect(classifyStripeKey('whsec_x', 'whsec')).toBe('live');
    expect(classifyStripeKey('sk_live_x', 'whsec')).toBe('malformed');
  });

  it('treats absent and whitespace as missing rather than malformed', () => {
    for (const v of [undefined, null, '', '   ']) expect(classifyStripeKey(v, 'sk')).toBe('missing');
  });
});

describe('a test key is a blocker, not a warning', () => {
  it('says the money would not arrive', () => {
    const c = find({ ...LIVE, STRIPE_SECRET_KEY: 'sk_test_x' }, 'stripe_secret');
    expect(c.status).toBe('blocker');
    expect(c.detail).toMatch(/TEST key/);
    expect(c.detail).toMatch(/no money would arrive/i);
  });

  it('and a missing publishable key blocks too — the card form cannot render', () => {
    const env = { ...LIVE };
    delete env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    expect(find(env, 'stripe_publishable').status).toBe('blocker');
  });
});

describe('the mixed-mode pair gets its own line', () => {
  it('flags a live secret with a test publishable key', () => {
    const checks = paymentsReadiness({ env: { ...LIVE, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_x' }, companyCards: 1 });
    const mismatch = checks.find((c) => c.id === 'stripe_mode_mismatch');
    expect(mismatch?.status).toBe('blocker');
    expect(mismatch?.detail).toMatch(/View test data/);
  });

  it('and the reverse', () => {
    const checks = paymentsReadiness({ env: { ...LIVE, STRIPE_SECRET_KEY: 'sk_test_x' }, companyCards: 1 });
    expect(checks.some((c) => c.id === 'stripe_mode_mismatch')).toBe(true);
  });

  it('but not when both agree', () => {
    expect(paymentsReadiness({ env: LIVE, companyCards: 1 }).some((c) => c.id === 'stripe_mode_mismatch')).toBe(false);
  });
});

describe('the webhook secret', () => {
  it('blocks when absent — nothing would ever be marked paid', () => {
    const env = { ...LIVE };
    delete env.STRIPE_WEBHOOK_SECRET;
    const c = find(env, 'stripe_webhook');
    expect(c.status).toBe('blocker');
    expect(c.detail).toMatch(/never be marked paid/);
  });

  it('and still says to confirm the endpoint exists when it IS set', () => {
    // A secret from a deleted endpoint verifies nothing, and no env check can see that.
    expect(find(LIVE, 'stripe_webhook').detail).toMatch(/deleted endpoint/);
  });
});

describe('the hard-coded handles', () => {
  it('are a WARN naming what to check, not an ok', () => {
    // Nothing here can tell whether @StarrSurveying is really theirs. A customer paying the wrong
    // handle gets no error and the invoice just stays unpaid.
    const c = find(LIVE, 'handles');
    expect(c.status).toBe('warn');
    expect(c.detail).toMatch(/gets no error/);
    expect(c.detail).toMatch(/@StarrSurveying/);
  });
});

describe('company cards', () => {
  it('warns when none are registered', () => {
    expect(find(LIVE, 'cards', 0).status).toBe('warn');
  });

  it('and counts them when they are', () => {
    expect(find(LIVE, 'cards', 3).detail).toMatch(/3 company cards/);
  });
});

describe('PAYMENTS_LIVE', () => {
  it('off is a warn — the portal shows but cannot charge', () => {
    expect(find(LIVE, 'payments_live').status).toBe('warn');
  });

  it('on with everything clear is ok', () => {
    expect(find({ ...LIVE, PAYMENTS_LIVE: 'true' }, 'payments_live').status).toBe('ok');
  });

  it('ON WITH BLOCKERS is the worst state on the page, and says customers can be charged now', () => {
    // The only combination where somebody can be charged while something is known to be wrong.
    const c = find({ ...LIVE, STRIPE_SECRET_KEY: 'sk_test_x', PAYMENTS_LIVE: 'true' }, 'payments_live');
    expect(c.status).toBe('blocker');
    expect(c.detail).toMatch(/can be charged right now/);
  });

  it('only the literal string "true" counts', () => {
    for (const v of ['TRUE', '1', 'yes', '']) {
      expect(find({ ...LIVE, PAYMENTS_LIVE: v }, 'payments_live').status).toBe('warn');
    }
  });
});

describe('ordering and summary', () => {
  it('puts blockers first, because people read the top', () => {
    const checks = paymentsReadiness({ env: { ...LIVE, STRIPE_SECRET_KEY: 'sk_test_x' }, companyCards: 0 });
    expect(checks[0].status).toBe('blocker');
    const statuses = checks.map((c) => c.status);
    expect(statuses.indexOf('ok') === -1 || statuses.lastIndexOf('warn') < statuses.indexOf('ok')).toBe(true);
  });

  it('summarises without needing the list read', () => {
    expect(readinessSummary(paymentsReadiness({ env: { ...LIVE, STRIPE_SECRET_KEY: 'sk_test_x' }, companyCards: 1 })).status).toBe('blocker');
    expect(readinessSummary(paymentsReadiness({ env: LIVE, companyCards: 1 })).status).toBe('warn');
  });

  it('never returns a key value anywhere', () => {
    // This feeds a screen. A readiness page that prints the secret it is checking is a worse problem
    // than the one it solves.
    const env = { ...LIVE, STRIPE_SECRET_KEY: 'sk_live_SUPERSECRETVALUE', PAYMENTS_LIVE: 'true' };
    const blob = JSON.stringify(paymentsReadiness({ env, companyCards: 1 }));
    expect(blob).not.toContain('SUPERSECRETVALUE');
    expect(blob).not.toContain('sk_live_');
  });
});

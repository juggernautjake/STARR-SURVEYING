// PWA plan W4 — one Web Push transport for all three scoped PWAs.
//
// Before this there were three PWAs (/admin/, /dnd/, /AndrewAsh/) and one push sender, living inside
// lib/voice/notifications.ts: wired to the va_push_subscriptions table, defaulting its href to
// /AndrewAsh/studio, reading VOICE_VAPID_*. Good code that only one of the three could use.
//
// The design question is what to share. VAPID keys, yes — they identify the application SERVER to
// the push service, not the application, so one pair legitimately serves every scope and three would
// mean three secrets to rotate for no isolation. Subscription STORAGE, no — each area keeps its own
// table and its own disable policy. The studio's three-strike rule is its own decision, not a
// property of Web Push, and a transport that wrote to a table would have to know which table, which
// is exactly what made the original impossible to reuse.
//
// These tests are mostly about the boundary cases that decide whether a real device keeps working:
// an unconfigured environment must be distinguishable from total failure, and a transient outage
// must not be mistaken for a dead endpoint.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isGone,
  pushConfigured,
  vapidPublicKey,
  vapidSubject,
  sendPush,
  sendPushWith,
  type WebPushModule,
} from '@/lib/push/web-push';

const VAPID_ENV = [
  'PUSH_VAPID_PUBLIC_KEY', 'PUSH_VAPID_PRIVATE_KEY', 'PUSH_VAPID_SUBJECT', 'NEXT_PUBLIC_PUSH_VAPID_KEY',
  'VOICE_VAPID_PUBLIC_KEY', 'VOICE_VAPID_PRIVATE_KEY', 'VOICE_VAPID_SUBJECT', 'NEXT_PUBLIC_VOICE_VAPID_KEY',
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of VAPID_ENV) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of VAPID_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const sub = (endpoint: string) => ({ endpoint, p256dh: 'p', auth: 'a' });

function fakeWebPush(behaviour: (endpoint: string) => void | never): WebPushModule {
  return {
    setVapidDetails: () => {},
    sendNotification: async (s) => behaviour((s as { endpoint: string }).endpoint),
  };
}

describe('configuration', () => {
  it('is not configured with no keys at all', () => {
    expect(pushConfigured()).toBe(false);
  });

  it('is configured by the shared PUSH_ keys', () => {
    process.env.PUSH_VAPID_PUBLIC_KEY = 'pub';
    process.env.PUSH_VAPID_PRIVATE_KEY = 'priv';
    expect(pushConfigured()).toBe(true);
  });

  it('still accepts the original VOICE_ keys', () => {
    // The studio's keys are already set in the deployment. A rename that silently turned push off
    // for the one area currently using it would be a poor way to "unify" anything.
    process.env.VOICE_VAPID_PUBLIC_KEY = 'pub';
    process.env.VOICE_VAPID_PRIVATE_KEY = 'priv';
    expect(pushConfigured()).toBe(true);
  });

  it('is NOT configured with only half a key pair', () => {
    // Checking one key is how you get a sender that believes it is configured and fails every send.
    process.env.PUSH_VAPID_PRIVATE_KEY = 'priv';
    expect(pushConfigured()).toBe(false);
  });

  it('prefers the shared public key but falls back through to VOICE_', () => {
    process.env.VOICE_VAPID_PUBLIC_KEY = 'voice';
    expect(vapidPublicKey()).toBe('voice');
    process.env.PUSH_VAPID_PUBLIC_KEY = 'shared';
    expect(vapidPublicKey()).toBe('shared');
    process.env.NEXT_PUBLIC_PUSH_VAPID_KEY = 'client';
    expect(vapidPublicKey()).toBe('client');
  });

  it('has a subject fallback so setVapidDetails never receives undefined', () => {
    expect(vapidSubject()).toMatch(/^mailto:/);
    process.env.PUSH_VAPID_SUBJECT = 'mailto:ops@example.com';
    expect(vapidSubject()).toBe('mailto:ops@example.com');
  });
});

describe('failure classification decides whether a device is dropped', () => {
  it('treats 404 and 410 as gone for good', () => {
    expect(isGone({ statusCode: 404 })).toBe(true);
    expect(isGone({ statusCode: 410 })).toBe(true);
  });

  it('treats a server error as transient, NOT gone', () => {
    // The distinction that stops an outage from unsubscribing every device at once.
    expect(isGone({ statusCode: 500 })).toBe(false);
    expect(isGone({ statusCode: 429 })).toBe(false);
    expect(isGone(new Error('socket hang up'))).toBe(false);
  });
});

describe('sending', () => {
  it('reports one result per subscription, in input order', () => {
    // Callers pair results back to their own rows positionally; returning only failures would make
    // every call site re-derive which succeeded.
    const wp = fakeWebPush((e) => { if (e === 'b') throw { statusCode: 410 }; });
    return sendPushWith(wp, [sub('a'), sub('b'), sub('c')], '{}').then((results) => {
      expect(results.map((r) => r.sub.endpoint)).toEqual(['a', 'b', 'c']);
      expect(results[0].result).toEqual({ ok: true });
      expect(results[1].result).toMatchObject({ ok: false, gone: true, status: 410 });
      expect(results[2].result).toEqual({ ok: true });
    });
  });

  it('does not let one dead endpoint stop the others', async () => {
    const seen: string[] = [];
    const wp = fakeWebPush((e) => { seen.push(e); if (e === 'a') throw { statusCode: 410 }; });
    await sendPushWith(wp, [sub('a'), sub('b')], '{}');
    expect(seen).toContain('b');
  });

  it('marks a transient failure as not-gone so the caller can retry it', async () => {
    const wp = fakeWebPush(() => { throw { statusCode: 503 }; });
    const [only] = await sendPushWith(wp, [sub('a')], '{}');
    expect(only.result).toMatchObject({ ok: false, gone: false, status: 503 });
  });

  it('returns [] when push is unconfigured — distinct from "everything failed"', async () => {
    // An empty array means nothing was ATTEMPTED. If this returned failures instead, a caller would
    // disable every subscription in an environment that simply has no keys set.
    expect(await sendPush([sub('a')], '{}')).toEqual([]);
  });

  it('returns [] for an empty subscription list without loading anything', async () => {
    process.env.PUSH_VAPID_PUBLIC_KEY = 'pub';
    process.env.PUSH_VAPID_PRIVATE_KEY = 'priv';
    expect(await sendPush([], '{}')).toEqual([]);
  });
});

describe('the studio sender now uses the shared transport', () => {
  // W4 is only real if the existing caller was rewired. An extracted module with no caller is the
  // defect this codebase produces most often.
  const src = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'lib/voice/notifications.ts'), 'utf8');

  it('imports sendPush rather than re-implementing it', () => {
    expect(src).toContain("from '@/lib/push/web-push'");
    expect(src).toContain('sendPush(');
  });

  it('no longer carries its own copy of the bundler-opaque require', () => {
    expect(src).not.toContain("load('web-push')");
  });

  it('keeps its OWN three-strike disable policy, which is not the transport\'s business', () => {
    expect(src).toContain('failures >= 3');
    expect(src).toContain('va_push_subscriptions');
  });
});

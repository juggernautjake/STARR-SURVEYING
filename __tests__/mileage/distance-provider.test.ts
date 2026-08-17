// C0b1 — the address→address distance adapter.
//
// ── WHY THE OUTCOMES ARE THE TEST ───────────────────────────────────────────────────────────────
//
// C44e's headline finding in this same document is that *a webhook that is not configured returns
// `ok: true`*. This adapter is the next place that mistake would be made, because its three failure
// modes are indistinguishable at the call site and mean completely different things to the person
// standing in front of the form:
//
//   NOT_CONFIGURED — nobody set a key. Nothing the surveyor can do; type the distance.
//   NO_ROUTE       — the provider answered and there is no route. Usually a typo; re-read it.
//   PROVIDER_ERROR — the provider failed. Retrying is reasonable.
//
// Collapsing them into `null` would make "we never asked" indistinguishable from "we asked and the
// answer is no" — the distinction C0d spent a whole slice restoring to the job manifest.
//
// The provider is injected, so none of this touches the network or spends a cent of the firm's
// Routes quota.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { lookupDrivingDistance, isDistanceLookupConfigured } from '@/lib/mileage/distance-provider';

const KEY = 'GOOGLE_MAPS_SERVER_KEY';
let saved: string | undefined;

beforeEach(() => { saved = process.env[KEY]; });
afterEach(() => {
  if (saved === undefined) delete process.env[KEY];
  else process.env[KEY] = saved;
});

/** A fetch that returns one canned response, and records what it was called with. */
function fakeFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, reqInit: RequestInit) => {
    calls.push({ url: String(url), init: reqInit });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => JSON.parse(text),
      text: async () => text,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('not configured', () => {
  it('says so, and names the variable to set', () => {
    // The person who reads this message is the person who can fix it. "Lookup unavailable" would
    // send them hunting for a bug that does not exist.
    delete process.env[KEY];
    expect(isDistanceLookupConfigured()).toBe(false);
  });

  it('never calls the provider when there is no key', async () => {
    delete process.env[KEY];
    const { impl, calls } = fakeFetch({});
    const r = await lookupDrivingDistance('A', 'B', { fetchImpl: impl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('NOT_CONFIGURED');
    expect(r.detail).toContain('GOOGLE_MAPS_SERVER_KEY');
    expect(calls, 'an unconfigured lookup must not hit the network').toHaveLength(0);
  });

  it('treats a referrer-blocked key as configuration, not as a provider outage', async () => {
    // This is the project's ACTUAL state on 2026-08-16: the Routes API is enabled and billed, and
    // the only key present is a browser key restricted by HTTP referrer. Reporting it as a provider
    // error would send somebody looking for an outage instead of replacing a key.
    process.env[KEY] = 'browser-key';
    const { impl } = fakeFetch(
      { error: { status: 'PERMISSION_DENIED', details: [{ reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] } },
      { ok: false, status: 403 },
    );
    const r = await lookupDrivingDistance('A', 'B', { fetchImpl: impl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('NOT_CONFIGURED');
    expect(r.detail).toMatch(/referrer/i);
  });

  it('treats a disabled API as configuration too', async () => {
    process.env[KEY] = 'k';
    const { impl } = fakeFetch({ error: { message: 'You’re calling a legacy API, which is not enabled' } }, { ok: false, status: 403 });
    const r = await lookupDrivingDistance('A', 'B', { fetchImpl: impl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('NOT_CONFIGURED');
  });
});

describe('a real answer', () => {
  beforeEach(() => { process.env[KEY] = 'k'; });

  it('converts metres to miles', async () => {
    // 100 miles exactly, in metres.
    const { impl } = fakeFetch({ routes: [{ distanceMeters: 160934 }] });
    const r = await lookupDrivingDistance('Las Cruces, NM', 'Alamogordo, NM', { fetchImpl: impl });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.miles).toBeCloseTo(100, 1);
    expect(r.provider).toBe('google-routes');
  });

  it('asks for only the distance field', async () => {
    // Routes bills by the fields requested, so the field mask is a cost decision as much as a
    // correctness one — and a widened mask would raise the bill silently.
    const { impl, calls } = fakeFetch({ routes: [{ distanceMeters: 1000 }] });
    await lookupDrivingDistance('A', 'B', { fetchImpl: impl });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['X-Goog-FieldMask']).toBe('routes.distanceMeters');
    expect(headers['X-Goog-Api-Key']).toBe('k');
  });

  it('allows a zero-mile trip', async () => {
    // The same address twice is a real answer to a silly question. Refusing it would be the tool
    // arguing with a surveyor who knows what they meant.
    const { impl } = fakeFetch({ routes: [{ distanceMeters: 0 }] });
    const r = await lookupDrivingDistance('A', 'A', { fetchImpl: impl });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.miles).toBe(0);
  });
});

describe('no route', () => {
  beforeEach(() => { process.env[KEY] = 'k'; });

  it('an empty routes array at HTTP 200 is NOT a success', async () => {
    // The exact shape that makes "no answer" look like a successful call, and the reason this file
    // exists. Two addresses on different continents land here, and so does a mistyped street.
    const { impl } = fakeFetch({ routes: [] });
    const r = await lookupDrivingDistance('Las Cruces, NM', 'Ulaanbaatar', { fetchImpl: impl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('NO_ROUTE');
    expect(r.detail).toMatch(/typo|route/i);
  });

  it('a missing address is asked for, not sent to the provider', async () => {
    const { impl, calls } = fakeFetch({ routes: [{ distanceMeters: 1 }] });
    const r = await lookupDrivingDistance('  ', 'Somewhere', { fetchImpl: impl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('NO_ROUTE');
    expect(calls).toHaveLength(0);
  });
});

describe('provider error', () => {
  beforeEach(() => { process.env[KEY] = 'k'; });

  it('a thrown fetch is a provider error, not a missing key', async () => {
    const impl = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
    const r = await lookupDrivingDistance('A', 'B', { fetchImpl: impl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('PROVIDER_ERROR');
  });

  it('an unreadable body is a provider error, not a zero distance', async () => {
    // Returning 0 miles here would put a free trip in the ledger and nothing would look wrong.
    const { impl } = fakeFetch('<html>502 Bad Gateway</html>');
    const r = await lookupDrivingDistance('A', 'B', { fetchImpl: impl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('PROVIDER_ERROR');
  });

  it('a 500 is a provider error and is retryable in the message', async () => {
    const { impl } = fakeFetch({ error: 'boom' }, { ok: false, status: 500 });
    const r = await lookupDrivingDistance('A', 'B', { fetchImpl: impl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('PROVIDER_ERROR');
  });
});

describe('the browser key is never used server-side', () => {
  it('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY does not satisfy the adapter', async () => {
    // It is referrer-restricted, so it cannot work here — and it ships to every visitor, so using
    // it for a billed server API would put the firm's quota behind a value anyone can read out of
    // the page source. Falling back to it would also turn a clear "not configured" into a
    // confusing PERMISSION_DENIED on every lookup.
    delete process.env[KEY];
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'browser-key-in-the-page-source';
    expect(isDistanceLookupConfigured()).toBe(false);
    const { impl, calls } = fakeFetch({ routes: [{ distanceMeters: 1 }] });
    const r = await lookupDrivingDistance('A', 'B', { fetchImpl: impl });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

// ── THE KEY THAT WAS ALREADY THERE (2026-08-17) ─────────────────────────────────────────────────
//
// `GOOGLE_MAPS_SERVER_KEY` was a name this file invented and nobody ever created. Auditing Vercel
// production found a server-side maps key had existed for 115 days as `GOOGLE_MAPS_API_KEY`, used
// server-side by four research services for Static Maps and geocoding — so it is not referrer-locked.
// The owner was being told to create a second server key beside one they already had, purely because
// two parts of the codebase named the same idea differently.

describe('which environment variable supplies the key', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('prefers GOOGLE_MAPS_SERVER_KEY when it is set', () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = 'specific-key';
    process.env.GOOGLE_MAPS_API_KEY = 'general-key';
    expect(isDistanceLookupConfigured()).toBe(true);
  });

  it('falls back to GOOGLE_MAPS_API_KEY, which production already has', () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'general-key';
    expect(isDistanceLookupConfigured()).toBe(true);
  });

  it('still does NOT fall back to the public browser key', () => {
    // It is referrer-restricted, so a server call is rejected — and being NEXT_PUBLIC_ it ships to
    // every visitor, which would put the firm's billed quota behind a value anyone can read.
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'browser-key';
    expect(isDistanceLookupConfigured()).toBe(false);
  });

  it('treats whitespace and stray quotes as unset rather than as a key', () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    process.env.GOOGLE_MAPS_API_KEY = '   ';
    expect(isDistanceLookupConfigured()).toBe(false);
  });
});

// PWA plan W3 — knowing what is cached, and destroying it on sign-out.
//
// The packet PAYLOAD was already cached in localStorage with honest freshness rules
// (`resolveOffline`: live / offline / stale / refused, and "none" distinct from "not recorded").
// What was missing is either side of that: nothing could enumerate the cache, so an offline crew
// member got a bare "no connection" with no way to know what they had; and nothing ever cleared it,
// so a customer's parcel research outlived the session on a shared tablet.
//
// These functions report WHEN a copy was taken and never what it means. live/stale/refused and their
// thresholds stay in one module — a second copy of those numbers is exactly the defect
// `survey-primitives-are-not-duplicated` exists to catch.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  cacheKey, writeCache, listCachedPackets, clearAllPacketCaches, STALE_AFTER_MS, REFUSE_AFTER_MS,
} from '@/lib/research/packet-offline';

/** A Storage double, because the interesting cases are the ways real storage misbehaves. */
function makeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
  } as Storage;
}

let storage: Storage;
beforeEach(() => { storage = makeStorage(); });

describe('listing what is cached', () => {
  it('is empty with no storage at all', () => {
    expect(listCachedPackets(null)).toEqual([]);
    expect(listCachedPackets(undefined)).toEqual([]);
  });

  it('finds packets that were written', () => {
    writeCache('job-a', { x: 1 }, 1_000, storage);
    writeCache('job-b', { x: 2 }, 2_000, storage);
    expect(listCachedPackets(storage).map((p) => p.jobId).sort()).toEqual(['job-a', 'job-b']);
  });

  it('returns newest first, because that is the order a crew reads it in', () => {
    writeCache('older', {}, 1_000, storage);
    writeCache('newest', {}, 9_000, storage);
    writeCache('middle', {}, 5_000, storage);
    expect(listCachedPackets(storage).map((p) => p.jobId)).toEqual(['newest', 'middle', 'older']);
  });

  it('ignores unrelated keys sharing the origin', () => {
    storage.setItem('theme', 'dark');
    storage.setItem('starr.something-else', '{}');
    writeCache('job-a', {}, 1_000, storage);
    expect(listCachedPackets(storage)).toHaveLength(1);
  });

  it('skips a half-written entry rather than claiming a packet that is not there', () => {
    // Storage disappointing us must never become a crash, and must never become a false promise —
    // a crew member told they have a packet they cannot open is worse off than one told nothing.
    storage.setItem(cacheKey('broken'), '{not json');
    storage.setItem(cacheKey('partial'), JSON.stringify({ jobId: 'partial' })); // no fetchedAt
    writeCache('good', {}, 1_000, storage);
    expect(listCachedPackets(storage).map((p) => p.jobId)).toEqual(['good']);
  });

  it('returns metadata only — never the payload', () => {
    writeCache('job-a', { secret: 'parcel research' }, 1_000, storage);
    expect(JSON.stringify(listCachedPackets(storage))).not.toContain('parcel research');
  });
});

describe('clearing on sign-out', () => {
  it('removes every packet and reports the count', () => {
    writeCache('a', {}, 1, storage);
    writeCache('b', {}, 2, storage);
    writeCache('c', {}, 3, storage);
    expect(clearAllPacketCaches(storage)).toBe(3);
    expect(listCachedPackets(storage)).toEqual([]);
  });

  it('removes ALL of them, not every other one', () => {
    // The bug this guards: deleting while walking storage.key(i) shifts the indices and silently
    // skips half the entries — and it looks like it worked, which is the worst kind of leak.
    for (let i = 0; i < 10; i++) writeCache(`job-${i}`, {}, i, storage);
    clearAllPacketCaches(storage);
    expect(listCachedPackets(storage)).toEqual([]);
    expect(storage.length).toBe(0);
  });

  it('leaves unrelated keys alone', () => {
    storage.setItem('theme', 'dark');
    writeCache('a', {}, 1, storage);
    clearAllPacketCaches(storage);
    expect(storage.getItem('theme')).toBe('dark');
  });

  it('is a no-op without storage', () => {
    expect(clearAllPacketCaches(null)).toBe(0);
  });
});

describe('it is actually wired', () => {
  const read = (p: string) => require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), p), 'utf8');

  it('sign-out clears the packet cache', () => {
    // A clear function nobody calls leaves the customer research on the shared tablet exactly as
    // before — the defect this codebase produces most often, in a place where it has a privacy cost.
    const bar = read('app/admin/components/AdminTopBar.tsx');
    expect(bar).toContain('clearAllPacketCaches');
    expect(bar).toContain('signOut(');
  });

  it('the offline page reads the same cache key prefix the writer uses', () => {
    // The offline page is plain HTML served by the service worker and cannot import the module, so
    // this is the one thing that could silently drift. If CACHE_VERSION is bumped, this fails.
    //
    // Asserted against the DERIVED prefix, not a literal. The first version of this test wrote
    // `cacheKey('').slice(0, -0)` — which is `slice(0, 0)`, i.e. the empty string, so it asserted
    // nothing at all — and then checked a hardcoded 'v1' literal that would still match after a
    // version bump. It would have passed in exactly the situation it exists to catch.
    const html = read('public/admin/offline.html');
    const prefix = cacheKey('');
    expect(prefix.length).toBeGreaterThan(10);
    expect(html, `offline.html must read the current cache prefix (${prefix})`).toContain(prefix);
  });

  it('the offline page does NOT restate the freshness thresholds', () => {
    // It reports when a copy was taken. What that means stays in packet-offline.ts.
    //
    // Tests for the NUMBERS, not for the words. A first version asserted the page never contains
    // "refused" and failed against the comment explaining why it does not compute one — the same
    // code-versus-prose confusion that bit the CAD call-site check earlier today. Prose naming a
    // concept is not an implementation of it; duplicated thresholds are, and these are the values
    // that would drift.
    const html = read('public/admin/offline.html');
    for (const threshold of [
      String(STALE_AFTER_MS), String(REFUSE_AFTER_MS),
      '12 * 60 * 60 * 1000', '30 * 24 * 60 * 60 * 1000',
    ]) {
      expect(html, `offline.html restates a freshness threshold (${threshold})`).not.toContain(threshold);
    }
  });
});

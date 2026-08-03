// A truck with no signal, and the rule about what a stored packet may claim (plan R26).
//
// R26 shipped the crew view and said why it reads the approved snapshot rather than the live tables:
// "being a single object is what will make it cacheable for a truck with no signal." The caching was
// never built, so a crew out of signal saw the failure panel — honest, and useless.
//
// The hazard is not storage. It is that R26's own rule says superseded packets are NEVER offered,
// and a cache breaks that rule by construction: the moment a copy lives on a device, that device can
// show a version the office has replaced, and a cached packet looks exactly like a live one.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveOffline, readCache, writeCache, cacheKey, describeAge,
  STALE_AFTER_MS, REFUSE_AFTER_MS,
} from '@/lib/research/packet-offline';

const NOW = 1_800_000_000_000;
const packet = { state: 'approved', headline: 'Approved packet' };
const cached = (agoMs: number, jobId = 'job-1') =>
  ({ payload: packet, fetchedAt: NOW - agoMs, jobId });

/** A localStorage stand-in, including the ways real storage disappoints. */
function fakeStorage(opts: { throwOnSet?: boolean } = {}): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (opts.throwOnSet) throw new DOMException('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as unknown as Storage;
}

describe('a live answer needs no explanation', () => {
  it('says nothing extra when the server answered', () => {
    const v = resolveOffline('job-1', packet, cached(0), NOW);
    expect(v.freshness).toBe('live');
    expect(v.statement).toBe('');
    expect(v.needsRecheck).toBe(false);
  });

  it('prefers the live answer over a cached one', () => {
    const v = resolveOffline('job-1', { state: 'approved', headline: 'NEWER' }, cached(0), NOW);
    expect((v.payload as typeof packet).headline).toBe('NEWER');
  });
});

describe('a cached copy always says it is one', () => {
  it('shows the packet and says it could not be re-checked', () => {
    const v = resolveOffline('job-1', null, cached(60_000), NOW);
    expect(v.freshness).toBe('offline');
    expect(v.payload).toEqual(packet);
    expect(v.statement).toContain('OFFLINE COPY');
    expect(v.statement).toContain('may have been superseded');
  });

  it('does not flag the ordinary case — cached last night, opened this morning', () => {
    // Flagging that would train people to ignore the flag, which is the flag that matters.
    const v = resolveOffline('job-1', null, cached(10 * 60 * 60 * 1000), NOW);
    expect(v.freshness).toBe('offline');
    expect(v.needsRecheck).toBe(false);
  });

  it('escalates once the copy is old enough to have missed something', () => {
    // A packet gets superseded when somebody finds a new plat, a conflict or a corrected bearing —
    // exactly the update a crew must not miss.
    const v = resolveOffline('job-1', null, cached(STALE_AFTER_MS + 1), NOW);
    expect(v.freshness).toBe('stale');
    expect(v.needsRecheck).toBe(true);
    expect(v.statement).toContain('Do not work from this without re-checking');
  });

  it('names the specific things that supersede a packet, not just "it is old"', () => {
    const v = resolveOffline('job-1', null, cached(STALE_AFTER_MS + 1), NOW);
    expect(v.statement).toMatch(/new plat, a conflict or a corrected bearing/);
  });
});

describe('the copy that is too old to work from', () => {
  it('is withheld rather than shown', () => {
    const v = resolveOffline('job-1', null, cached(REFUSE_AFTER_MS + 1), NOW);
    expect(v.freshness).toBe('refused');
    expect(v.payload).toBeNull();
  });

  it('says a copy EXISTS, so this is not confused with "no research"', () => {
    // The distinction R26's four states were built to protect: an empty panel reads as "there is
    // nothing", and a crew that concludes that drives out and repeats somebody's work.
    const v = resolveOffline('job-1', null, cached(REFUSE_AFTER_MS + 1), NOW);
    expect(v.statement).toContain('is stored on this device');
    expect(v.statement).toContain('too long ago to work from');
  });
});

describe('nothing is ever deleted for being old', () => {
  it('downgrades the claim instead of dropping the copy', () => {
    // A crew in a canyon with a three-week-old packet is better served by a labelled three-week-old
    // packet than by an empty panel.
    const storage = fakeStorage();
    writeCache('job-1', packet, NOW - REFUSE_AFTER_MS - 1, storage);
    expect(readCache('job-1', storage)).not.toBeNull();
    expect(resolveOffline('job-1', null, readCache('job-1', storage), NOW).freshness).toBe('refused');
  });
});

describe('a cache cannot answer for a different job', () => {
  it('ignores a copy stored under another job', () => {
    // A component remounted on a different job before its fetch resolves would otherwise show one
    // job's research on another job's screen — and nobody re-reads a packet's header.
    const v = resolveOffline('job-2', null, cached(60_000, 'job-1'), NOW);
    expect(v.freshness).toBe('none');
    expect(v.payload).toBeNull();
  });

  it('keys storage per job', () => {
    expect(cacheKey('a')).not.toBe(cacheKey('b'));
  });

  it('rejects a stored object whose jobId does not match its key', () => {
    const storage = fakeStorage();
    storage.setItem(cacheKey('job-1'), JSON.stringify({ payload: packet, fetchedAt: NOW, jobId: 'job-9' }));
    expect(readCache('job-1', storage)).toBeNull();
  });
});

describe('with nothing cached at all', () => {
  it('keeps R26\'s original sentence — this is NOT "there is none"', () => {
    const v = resolveOffline('job-1', null, null, NOW);
    expect(v.freshness).toBe('none');
    expect(v.statement).toContain('NOT the same as there being none');
  });
});

describe('storage disappoints in several ways, none of which may crash a job page', () => {
  it('survives having no storage at all', () => {
    expect(readCache('job-1', null)).toBeNull();
    expect(writeCache('job-1', packet, NOW, null)).toBe(false);
  });

  it('survives junk left by an older version', () => {
    const storage = fakeStorage();
    storage.setItem(cacheKey('job-1'), 'not json');
    expect(readCache('job-1', storage)).toBeNull();
  });

  it('survives a row with no timestamp', () => {
    const storage = fakeStorage();
    storage.setItem(cacheKey('job-1'), JSON.stringify({ payload: packet, jobId: 'job-1' }));
    expect(readCache('job-1', storage)).toBeNull();
  });

  it('reports a failed write rather than swallowing it', () => {
    // A full quota otherwise leaves the UI implying offline access the device does not have.
    expect(writeCache('job-1', packet, NOW, fakeStorage({ throwOnSet: true }))).toBe(false);
  });

  it('reports a successful one', () => {
    expect(writeCache('job-1', packet, NOW, fakeStorage())).toBe(true);
  });
});

describe('ages read like a person says them', () => {
  it('rounds down and pluralises', () => {
    expect(describeAge(30_000)).toBe('just now');
    expect(describeAge(60_000)).toBe('1 minute ago');
    expect(describeAge(2 * 60_000)).toBe('2 minutes ago');
    expect(describeAge(3 * 3_600_000)).toBe('3 hours ago');
    expect(describeAge(50 * 3_600_000)).toBe('2 days ago');
  });
});

describe('the component uses it', () => {
  const cmp = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/jobs/[id]/JobResearchPacket.tsx'), 'utf8');

  it('resolves through the offline rule rather than rendering the fetch directly', () => {
    expect(cmp).toContain('resolveOffline<Payload>(jobId, live, readCache<Payload>(jobId, storage), now)');
  });

  it('caches ONLY an approved packet', () => {
    // A draft must never be worked from, and caching one puts "do not work from this" on a device
    // precisely where nobody can re-check it.
    expect(cmp).toContain("live.state === 'approved'");
  });

  it('shows the offline statement above the headline', () => {
    const offline = cmp.indexOf('job-packet__offline');
    const headline = cmp.indexOf('job-packet__headline');
    expect(offline).toBeGreaterThan(-1);
    expect(offline).toBeLessThan(headline);
  });

  it('tells the crew when the packet could not be stored', () => {
    expect(cmp).toContain('could NOT be stored on this device');
  });

  it('warns on a copy that needs re-checking, whatever the packet state says', () => {
    expect(cmp).toContain("verdict.needsRecheck ? 'job-packet--warn' : TONE[data.state]");
  });

  it('has a style for the offline line', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'app/admin/styles/AdminJobs.css'), 'utf8');
    expect(css).toContain('.job-packet__offline');
  });
});

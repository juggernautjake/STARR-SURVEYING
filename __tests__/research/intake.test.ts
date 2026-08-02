// Request in, packet out, nobody in the loop (research plan R28).
//
// Starting research required a person: create a project in the admin UI, then press a button. The
// owner's ask is the opposite — "a request comes in → the server works 20–30 minutes → done" — and
// there was no object representing a REQUEST at all, so nothing could queue, retry, deduplicate or
// notify.
//
// Three things cost money if got wrong: duplicates (a run is 20–30 minutes plus paid pages),
// claiming (two workers polling one queue WILL race), and retries (a permanent failure retried three
// times is three full runs to reach the same answer).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  dedupeKey,
  notificationFor,
  queueSummary,
  shouldRetry,
  validateRequest,
  type RequestRow,
} from '@/lib/research/intake';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const request = (over: Partial<RequestRow> = {}): RequestRow => ({
  id: 'r1',
  address: '123 FM 436',
  county: 'Bell',
  status: 'complete',
  research_project_id: 'proj1',
  packet_id: 'pk1',
  failure_reason: null,
  attempts: 1,
  max_attempts: 3,
  queued_at: '2026-08-02T00:00:00.000Z',
  finished_at: '2026-08-02T00:30:00.000Z',
  ...over,
});

describe('two requests for one property must not both run', () => {
  it('treats the same address written differently as one property', () => {
    // Comparing punctuated address strings literally means paying twice for one property.
    const forms = ['123 FM 436', '123 F.M. 436', '123 Fm-436', '  123  fm 436  '];
    expect(new Set(forms.map(a => dedupeKey(a, 'Bell'))).size).toBe(1);
  });

  it('keeps the same street address in different counties apart', () => {
    // The same address exists in many counties.
    expect(dedupeKey('123 Main St', 'Bell')).not.toBe(dedupeKey('123 Main St', 'Coryell'));
  });

  it('keeps genuinely different addresses apart', () => {
    expect(dedupeKey('123 FM 436', 'Bell')).not.toBe(dedupeKey('124 FM 436', 'Bell'));
  });
});

describe('the guard is at the door', () => {
  it('requires a county rather than guessing one', () => {
    // Guessing wrong sends a 25-minute run at the wrong clerk, which fails slowly and expensively.
    const v = validateRequest({ address: '123 FM 436' });
    expect(v.ok).toBe(false);
    expect(v.error).toContain('fails slowly and expensively');
  });

  it('rejects an address too short to be one', () => {
    expect(validateRequest({ address: '12', county: 'Bell' }).ok).toBe(false);
  });

  it('strips the word "County", which is noise in every lookup', () => {
    expect(validateRequest({ address: '123 FM 436', county: 'Bell County' }).normalised?.county).toBe('Bell');
  });

  it('normalises the state and rejects a non-code', () => {
    expect(validateRequest({ address: '123 FM 436', county: 'Bell', state: 'tx' }).normalised?.state).toBe('TX');
    expect(validateRequest({ address: '123 FM 436', county: 'Bell', state: 'Texas' }).ok).toBe(false);
  });
});

describe('a permanent failure is not retried', () => {
  it('stops on a county with no adapter', () => {
    // Retrying burns a full run to reach the same answer.
    const d = shouldRetry(1, 3, 'No adapter exists for Milam County');
    expect(d.retry).toBe(false);
    expect(d.reason).toContain('will not change on a second attempt');
  });

  it('stops on an unresolvable address, a ToS refusal, and a spend ceiling', () => {
    expect(shouldRetry(1, 3, 'Invalid address — could not geocode').retry).toBe(false);
    expect(shouldRetry(1, 3, "This portal's terms prohibit automated access").retry).toBe(false);
    expect(shouldRetry(1, 3, 'Run hit its spend limit').retry).toBe(false);
  });

  it('retries a transient failure', () => {
    const d = shouldRetry(1, 3, 'Timed out waiting for the clerk portal');
    expect(d.retry).toBe(true);
    expect(d.reason).toContain('Attempt 2 of 3');
  });

  it('gives up at the attempt limit', () => {
    expect(shouldRetry(3, 3, 'Timed out').retry).toBe(false);
  });
});

describe('notify either way', () => {
  it('says a failed request researched NOTHING', () => {
    // A request that quietly failed looks identical to one still running, and somebody finds out
    // when the crew is already on site.
    const n = notificationFor(request({ status: 'failed', failure_reason: 'Kofile login rejected.', attempts: 3 }));
    expect(n?.title).toContain('FAILED');
    expect(n?.body).toContain('Kofile login rejected');
    expect(n?.body).toContain('do not assume it was covered');
  });

  it('distinguishes a finished run from a finished PACKET', () => {
    const withPacket = notificationFor(request());
    expect(withPacket?.body).toContain('ready to review and approve');
    const without = notificationFor(request({ packet_id: null }));
    expect(without?.body).toContain('the deliverable is not');
  });

  it('tells a duplicate requester why nothing started', () => {
    expect(notificationFor(request({ status: 'duplicate' }))?.body).toContain('already in progress');
  });

  it('does not notify about a request that just started', () => {
    // Nobody needs telling that a thing they just asked for is happening.
    expect(notificationFor(request({ status: 'queued' }))).toBeNull();
    expect(notificationFor(request({ status: 'running' }))).toBeNull();
  });
});

describe('the queue leads with what is stuck', () => {
  it('puts failures and un-notified finishes first', () => {
    // A queue screen that leads with throughput hides the request nobody was told failed.
    const s = queueSummary([
      request({ status: 'queued' }), request({ status: 'running' }), request({ status: 'failed' }),
    ], 2);
    expect(s.headline.indexOf('failed')).toBeLessThan(s.headline.indexOf('running'));
    expect(s.headline).toContain('2 finished with nobody notified');
  });

  it('says plainly when the queue is empty', () => {
    expect(queueSummary([], 0).headline).toBe('The research queue is empty.');
  });
});

describe('the storage and claim contract', () => {
  const seed = read('seeds/537_research_requests.sql');

  it('blocks a second ACTIVE request for one property', () => {
    expect(seed).toMatch(/CREATE UNIQUE INDEX[\s\S]*idx_research_requests_active[\s\S]*WHERE status IN \('queued', 'running'\)/);
  });

  it('still allows a re-run months later', () => {
    // A total unique index would block the second job on a property forever — and re-running is
    // exactly what R27 is for.
    expect(seed.replace(/\s+/g, ' '))
      .toContain('the same address may legitimately be requested again months later');
  });

  it('can find the run nobody was told about', () => {
    expect(seed).toMatch(/idx_research_requests_unnotified[\s\S]*WHERE notified_at IS NULL/);
  });

  it('claims with a conditional update, not a read-then-write', () => {
    // A read-then-write hands one property to two machines, and the window is exactly as wide as the
    // round trip between them.
    const route = read('app/api/admin/research/requests/claim/route.ts');
    expect(route).toContain(".eq('status', 'queued')");
    expect(route).toContain('the guard. Lose the race and this matches nothing');
  });

  it('tries the next candidate rather than sleeping on a lost race', () => {
    // An idle machine beside a full queue is the thing that loop exists to prevent.
    const route = read('app/api/admin/research/requests/claim/route.ts');
    expect(route).toContain('for (const c of');
  });

  it('leaves notified_at null when notification fails, so it can be found', () => {
    const route = read('app/api/admin/research/requests/claim/route.ts');
    expect(route).toContain('is how somebody finds the run nobody was told about');
  });

  it('does not report a failed queue read as an empty queue', () => {
    const route = read('app/api/admin/research/requests/route.ts');
    expect(route).toContain('not the same as it being empty');
  });

  it('treats a duplicate as the guard working, not an error', () => {
    const route = read('app/api/admin/research/requests/route.ts');
    expect(route).toContain('23505');
    expect(route).toContain('A second run was not started');
  });
});

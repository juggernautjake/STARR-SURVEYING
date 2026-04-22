// worker/src/__tests__/research-events.test.ts
//
// Tests for the canonical event catalog + WS ticket helper. Both live
// in worker/src/shared/ so they ship in worker tests rather than root
// tests; the schemas are pure functions and don't need a Next.js test
// harness.

import { describe, it, expect } from 'vitest';
import {
  parseResearchEvent,
  serializeResearchEvent,
  researchEventsChannel,
  jobIdFromChannel,
  RESEARCH_EVENTS_PROTOCOL_VERSION,
  type ResearchEvent,
} from '../shared/research-events.js';
import {
  issueWsTicket,
  verifyWsTicket,
  WS_TICKET_DEFAULT_TTL_SECONDS,
} from '../shared/ws-ticket.js';

const SAMPLE_JOB = '11111111-2222-3333-4444-555555555555';

describe('research-events schema', () => {
  it('round-trips a job_started event preserving every field', () => {
    const event: ResearchEvent = {
      type:       'job_started',
      jobId:      SAMPLE_JOB,
      timestamp:  new Date().toISOString(),
      phases:     ['discovery', 'harvest'],
      countyFips: '48027',
    };
    const json = serializeResearchEvent(event);
    const back = parseResearchEvent(JSON.parse(json));
    expect(back).toEqual(event);
  });

  it('round-trips every event type', () => {
    const ts = new Date().toISOString();
    const events: ResearchEvent[] = [
      { type: 'job_started',    jobId: SAMPLE_JOB, timestamp: ts, phases: [] },
      { type: 'phase_started',  jobId: SAMPLE_JOB, timestamp: ts, phase: 'discovery' },
      { type: 'document_discovered', jobId: SAMPLE_JOB, timestamp: ts,
        documentId: 'd1', documentType: 'deed', storageKey: 'k/1' },
      { type: 'captcha_required', jobId: SAMPLE_JOB, timestamp: ts,
        challengeType: 'turnstile', pageUrl: 'https://a/b' },
      { type: 'captcha_resolved', jobId: SAMPLE_JOB, timestamp: ts,
        challengeType: 'turnstile', resolution: 'auto', costUsd: 0.001 },
      { type: 'phase_completed',  jobId: SAMPLE_JOB, timestamp: ts,
        phase: 'discovery', durationMs: 100, documentCount: 5 },
      { type: 'job_completed',    jobId: SAMPLE_JOB, timestamp: ts,
        durationMs: 1000, documentCount: 5, totalCostUsd: 0.05 },
      { type: 'job_failed',       jobId: SAMPLE_JOB, timestamp: ts,
        errorMessage: 'boom', errorCategory: 'site_down' },
    ];
    for (const e of events) {
      expect(parseResearchEvent(JSON.parse(serializeResearchEvent(e)))).toEqual(e);
    }
  });

  it('rejects malformed payloads (wrong jobId UUID)', () => {
    expect(() => parseResearchEvent({
      type: 'job_started', jobId: 'not-a-uuid',
      timestamp: '2024-01-01', phases: [],
    })).toThrow();
  });

  it('rejects unknown discriminator', () => {
    expect(() => parseResearchEvent({
      type: 'asteroid_impact', jobId: SAMPLE_JOB, timestamp: '2024-01-01',
    })).toThrow();
  });

  it('applies defaults for optional numeric fields', () => {
    const got = parseResearchEvent({
      type: 'captcha_resolved',
      jobId: SAMPLE_JOB,
      timestamp: '2024-01-01',
      challengeType: 'turnstile',
      resolution: 'auto',
      // costUsd omitted → should default to 0
    });
    expect((got as { costUsd: number }).costUsd).toBe(0);
  });

  it('exposes a stable protocol version', () => {
    expect(RESEARCH_EVENTS_PROTOCOL_VERSION).toBe(1);
  });
});

describe('researchEventsChannel + jobIdFromChannel', () => {
  it('round-trips a jobId through channel name', () => {
    const ch = researchEventsChannel(SAMPLE_JOB);
    expect(ch).toBe(`research-events:${SAMPLE_JOB}`);
    expect(jobIdFromChannel(ch)).toBe(SAMPLE_JOB);
  });

  it('returns null for non-matching or empty-suffix channels', () => {
    expect(jobIdFromChannel('other:123')).toBeNull();
    expect(jobIdFromChannel('research-events:')).toBeNull(); // suffix is empty → no match
    expect(jobIdFromChannel('')).toBeNull();
  });
});

describe('ws-ticket', () => {
  const SECRET = 'test-secret-do-not-use-in-prod';
  const USER   = 'alice@example.com';
  const JOBS   = [SAMPLE_JOB];

  it('issues a 3-part ticket and verifies it', () => {
    const { ticket, payload } = issueWsTicket(USER, JOBS, SECRET);
    expect(ticket.split('.').length).toBe(3);
    const verified = verifyWsTicket(ticket, SECRET);
    expect(verified.userId).toBe(USER);
    expect(verified.jobIds).toEqual(JOBS);
    expect(verified.iat).toBe(payload.iat);
    expect(verified.exp).toBe(payload.exp);
  });

  it('produces a payload with the expected default 60s TTL', () => {
    const { payload } = issueWsTicket(USER, JOBS, SECRET);
    expect(payload.exp - payload.iat).toBe(WS_TICKET_DEFAULT_TTL_SECONDS);
  });

  it('rejects a ticket signed with a different secret', () => {
    const { ticket } = issueWsTicket(USER, JOBS, SECRET);
    expect(() => verifyWsTicket(ticket, 'wrong-secret')).toThrow(/signature mismatch/);
  });

  it('rejects a ticket whose payload was tampered with', () => {
    const { ticket } = issueWsTicket(USER, JOBS, SECRET);
    const [h, _, s] = ticket.split('.');
    // Replace payload with a different (valid base64url) payload of same length
    const fakePayload = Buffer.from(JSON.stringify({
      userId: 'eve@example.com', jobIds: JOBS, iat: 1, exp: 2 ** 31,
    }), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    expect(() => verifyWsTicket(`${h}.${fakePayload}.${s}`, SECRET))
      .toThrow(/signature mismatch/);
  });

  it('rejects an expired ticket', () => {
    // Issue a ticket with a 1-second TTL, then verify with a "now" 5s in the future.
    const { ticket, payload } = issueWsTicket(USER, JOBS, SECRET, 1);
    expect(() => verifyWsTicket(ticket, SECRET, payload.exp + 5))
      .toThrow(/expired/);
  });

  it('rejects a malformed ticket', () => {
    expect(() => verifyWsTicket('not.a.ticket.with.too.many.parts', SECRET)).toThrow();
    expect(() => verifyWsTicket('only-one-part', SECRET)).toThrow(/malformed/);
  });

  it('throws if secret is empty (prevents accidental noop signing)', () => {
    expect(() => issueWsTicket(USER, JOBS, '')).toThrow(/secret is required/);
    expect(() => verifyWsTicket('a.b.c', '')).toThrow(/secret is required/);
  });

  it('uses constant-time comparison (smoke test — equal-length sigs of different content)', () => {
    // Two tickets with same secret but different payloads will have
    // different sigs of the same length; we just exercise the path.
    const { ticket: t1 } = issueWsTicket(USER, JOBS, SECRET);
    const { ticket: t2 } = issueWsTicket('other@example.com', JOBS, SECRET);
    const [h1, p1, s1] = t1.split('.');
    const [, , s2]     = t2.split('.');
    expect(s1).not.toBe(s2);
    expect(() => verifyWsTicket(`${h1}.${p1}.${s2}`, SECRET)).toThrow(/signature mismatch/);
  });
});

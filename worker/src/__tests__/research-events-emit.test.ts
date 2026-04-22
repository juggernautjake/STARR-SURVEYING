// worker/src/__tests__/research-events-emit.test.ts
//
// Tests for the worker-side emit helper. We inject a fake IORedis client
// so no real Redis is required.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  emit,
  emitJobStarted,
  closeEmitter,
  _setPublisherForTesting,
} from '../lib/research-events-emit.js';
import { researchEventsChannel } from '../shared/research-events.js';

const SAMPLE_JOB = '11111111-2222-3333-4444-555555555555';

interface FakePublisher {
  publish: ReturnType<typeof vi.fn>;
  quit:    ReturnType<typeof vi.fn>;
  on:      ReturnType<typeof vi.fn>;
}

function makeFakePublisher(): FakePublisher {
  return {
    publish: vi.fn(async () => 1),
    quit:    vi.fn(async () => 'OK'),
    on:      vi.fn(),
  };
}

describe('research-events-emit', () => {
  let fake: FakePublisher;

  beforeEach(() => {
    fake = makeFakePublisher();
    // The helper has lazy init — we override via the test seam.
    _setPublisherForTesting(fake as unknown as Parameters<typeof _setPublisherForTesting>[0]);
  });
  afterEach(async () => {
    _setPublisherForTesting(null);
    await closeEmitter();
  });

  it('publishes to the correct channel', async () => {
    await emit({
      type:      'phase_started',
      jobId:     SAMPLE_JOB,
      timestamp: new Date().toISOString(),
      phase:     'discovery',
    });
    expect(fake.publish).toHaveBeenCalledTimes(1);
    const [channel] = fake.publish.mock.calls[0]!;
    expect(channel).toBe(researchEventsChannel(SAMPLE_JOB));
  });

  it('publishes a JSON-serialized event', async () => {
    const ts = new Date().toISOString();
    await emit({
      type: 'job_started', jobId: SAMPLE_JOB, timestamp: ts, phases: ['discovery'],
    });
    const [, message] = fake.publish.mock.calls[0]!;
    const parsed = JSON.parse(message as string);
    expect(parsed).toMatchObject({ type: 'job_started', jobId: SAMPLE_JOB, timestamp: ts });
    expect(parsed.phases).toEqual(['discovery']);
  });

  it('emitJobStarted convenience wraps emit with a fresh timestamp', async () => {
    await emitJobStarted({ jobId: SAMPLE_JOB, phases: ['p'], countyFips: '48027' });
    const [channel, message] = fake.publish.mock.calls[0]!;
    expect(channel).toBe(researchEventsChannel(SAMPLE_JOB));
    const parsed = JSON.parse(message as string);
    expect(parsed.type).toBe('job_started');
    expect(parsed.countyFips).toBe('48027');
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('throws on schema-invalid event (programmer error, not infra flake)', async () => {
    await expect(emit({
      // Missing required field "phases"; will fail zod validation.
      type:      'job_started',
      jobId:     SAMPLE_JOB,
      timestamp: new Date().toISOString(),
    } as unknown as Parameters<typeof emit>[0])).rejects.toThrow();
    expect(fake.publish).not.toHaveBeenCalled();
  });

  it('best-effort swallows publish failures (telemetry never blocks pipeline)', async () => {
    fake.publish = vi.fn(async () => { throw new Error('redis down'); });
    _setPublisherForTesting(fake as unknown as Parameters<typeof _setPublisherForTesting>[0]);
    // Should NOT throw.
    await expect(emit({
      type: 'phase_completed', jobId: SAMPLE_JOB,
      timestamp: new Date().toISOString(), phase: 'p', durationMs: 100, documentCount: 0,
    })).resolves.toBeUndefined();
  });
});

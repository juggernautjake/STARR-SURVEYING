// worker/src/__tests__/pipeline-logger-sinks.test.ts
//
// Verifies the captcha → PipelineLogger bridge:
//   - When a logger is registered for the project, every captcha attempt
//     becomes a LayerAttempt entry visible to /api/admin/research/{id}/logs
//     (i.e. the in-app Log Viewer).
//   - When no logger is registered, the delegate (default console sink)
//     still runs so worker-console visibility is preserved.
//   - Delegate is always invoked first; a logger emit failure does not
//     poison the captcha solve.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PipelineLogger, getLiveLogForProject, clearLiveLogForProject } from '../lib/logger.js';
import type { SolveAttemptRecord, SolveAttemptSink } from '../lib/captcha-solver.js';
import { makePipelineLoggerCaptchaSink } from '../lib/pipeline-logger-sinks.js';

const baseRecord = (overrides: Partial<SolveAttemptRecord> = {}): SolveAttemptRecord => ({
  provider:      'capsolver',
  challengeType: 'recaptcha-v2',
  success:       true,
  durationMs:    1240,
  costUsd:       0.0008,
  proxyUrl:      'http://proxy.example:8080',
  jobId:         'project-abc-123',
  adapterId:     'tyler-clerk',
  ...overrides,
});

describe('makePipelineLoggerCaptchaSink', () => {
  beforeEach(() => {
    clearLiveLogForProject('project-abc-123');
  });

  afterEach(() => {
    clearLiveLogForProject('project-abc-123');
    vi.restoreAllMocks();
  });

  it('routes a successful attempt into the active PipelineLogger as a success LayerAttempt', async () => {
    new PipelineLogger('project-abc-123');                  // self-registers
    const delegate: SolveAttemptSink = { record: vi.fn().mockResolvedValue(undefined) };
    const sink = makePipelineLoggerCaptchaSink(delegate);

    await sink.record(baseRecord());

    expect(delegate.record).toHaveBeenCalledTimes(1);
    const log = getLiveLogForProject('project-abc-123');
    expect(log).toHaveLength(1);
    expect(log![0]!.layer).toBe('captcha');
    expect(log![0]!.source).toBe('capsolver');
    expect(log![0]!.method).toBe('recaptcha-v2');
    expect(log![0]!.input).toBe('tyler-clerk');
    expect(log![0]!.status).toBe('success');
    expect(log![0]!.dataPointsFound).toBe(1);
    expect(log![0]!.details).toMatch(/cost=\$0\.0008/);
    expect(log![0]!.details).toMatch(/duration=1240ms/);
  });

  it('routes a failed attempt into the logger as a fail LayerAttempt with the error message', async () => {
    new PipelineLogger('project-abc-123');
    const sink = makePipelineLoggerCaptchaSink({ record: vi.fn().mockResolvedValue(undefined) });

    await sink.record(baseRecord({ success: false, errorMessage: 'task error: ERROR_CAPTCHA_UNSOLVABLE' }));

    const log = getLiveLogForProject('project-abc-123');
    expect(log![0]!.status).toBe('fail');
    expect(log![0]!.error).toBe('task error: ERROR_CAPTCHA_UNSOLVABLE');
  });

  it('still calls the delegate when no logger is registered for the jobId', async () => {
    const delegate: SolveAttemptSink = { record: vi.fn().mockResolvedValue(undefined) };
    const sink = makePipelineLoggerCaptchaSink(delegate);

    await sink.record(baseRecord({ jobId: 'no-such-project' }));

    expect(delegate.record).toHaveBeenCalledTimes(1);
    expect(getLiveLogForProject('no-such-project')).toBeUndefined();
  });

  it('handles a missing jobId by skipping the logger emit but still delegating', async () => {
    const delegate: SolveAttemptSink = { record: vi.fn().mockResolvedValue(undefined) };
    const sink = makePipelineLoggerCaptchaSink(delegate);

    await sink.record(baseRecord({ jobId: undefined }));

    expect(delegate.record).toHaveBeenCalledTimes(1);
  });

  it('falls back to "unknown-adapter" when adapterId is not provided', async () => {
    new PipelineLogger('project-abc-123');
    const sink = makePipelineLoggerCaptchaSink({ record: vi.fn().mockResolvedValue(undefined) });

    await sink.record(baseRecord({ adapterId: undefined }));

    const log = getLiveLogForProject('project-abc-123');
    expect(log![0]!.input).toBe('unknown-adapter');
  });

  it('does not throw when the delegate throws — telemetry never blocks the caller', async () => {
    const sink = makePipelineLoggerCaptchaSink({
      record: vi.fn().mockRejectedValue(new Error('console sink boom')),
    });

    await expect(sink.record(baseRecord({ jobId: 'no-project' }))).resolves.toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import {
  buildBreakageProposal,
  describeProposal,
  shouldProposeRepair,
} from '@/lib/research/self-heal-proposals';

describe('shouldProposeRepair', () => {
  it('broken always proposes', () => {
    expect(shouldProposeRepair({ status: 'broken', fingerprint_match: null })).toBe(true);
    expect(shouldProposeRepair({ status: 'broken', fingerprint_match: true })).toBe(true);
  });
  it('degraded + fingerprint mismatch proposes', () => {
    expect(shouldProposeRepair({ status: 'degraded', fingerprint_match: false })).toBe(true);
  });
  it('degraded with no fingerprint signal does NOT propose (probably 4xx noise)', () => {
    expect(shouldProposeRepair({ status: 'degraded', fingerprint_match: null })).toBe(false);
  });
  it('healthy / no_record / error are silent', () => {
    expect(shouldProposeRepair({ status: 'healthy', fingerprint_match: true })).toBe(false);
    expect(shouldProposeRepair({ status: 'no_record', fingerprint_match: null })).toBe(false);
    expect(shouldProposeRepair({ status: 'error', fingerprint_match: null })).toBe(false);
  });
});

describe('buildBreakageProposal', () => {
  const base = {
    adapter_id: 'a',
    health_check_id: 'h',
    prior_config: { foo: 1 },
    prior_field_map: { bar: 2 },
  };

  it('5xx outcome → proposal includes the HTTP code in detected list', () => {
    const p = buildBreakageProposal({
      ...base,
      status: 'broken', http_status: 503, fingerprint_match: null,
      duration_ms: 5000, probe_summary: 'Site returned 503',
    });
    expect(p.status).toBe('proposed');
    expect(p.confidence).toBe(0);
    expect(p.canary_test_passed).toBeNull();
    expect((p.diff as { detected: string[] }).detected).toEqual(
      expect.arrayContaining([expect.stringContaining('503')]),
    );
    expect(p.prior_config).toEqual(base.prior_config);
    expect(p.proposed_config).toEqual({});
  });

  it('fingerprint mismatch is recorded as a separate detected line', () => {
    const p = buildBreakageProposal({
      ...base,
      status: 'degraded', http_status: 200, fingerprint_match: false,
      duration_ms: 200, probe_summary: 'page structure has changed',
    });
    expect((p.diff as { detected: string[] }).detected).toEqual(
      expect.arrayContaining([expect.stringContaining('baseline fingerprint')]),
    );
  });

  it('snapshot probe details land in diff.probe', () => {
    const p = buildBreakageProposal({
      ...base,
      status: 'broken', http_status: 500, fingerprint_match: null,
      duration_ms: 1234, probe_summary: 'oops',
    });
    const probe = (p.diff as { probe: Record<string, unknown> }).probe;
    expect(probe.status).toBe('broken');
    expect(probe.http_status).toBe(500);
    expect(probe.duration_ms).toBe(1234);
  });
});

describe('describeProposal', () => {
  it('prefers the diff.detected list when present', () => {
    const out = describeProposal({
      rationale: 'long backup rationale here.',
      diff: { detected: ['Site returned 503.', 'Fingerprint changed.'] },
    });
    expect(out).toBe('Site returned 503. Fingerprint changed.');
  });
  it('falls back to the first sentence of the rationale', () => {
    const out = describeProposal({
      rationale: 'Network failure: ETIMEDOUT. More details after.',
      diff: { detected: [] },
    });
    expect(out).toBe('Network failure: ETIMEDOUT.');
  });
});

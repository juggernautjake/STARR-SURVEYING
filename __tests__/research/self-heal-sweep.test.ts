import { describe, it, expect } from 'vitest';
import {
  classifySweepStatus,
  describeProbe,
  describeSweep,
  summarizeSweep,
  type SweepRow,
} from '@/lib/research/self-heal-sweep';

describe('classifySweepStatus', () => {
  it('network failure → error', () => {
    expect(classifySweepStatus({ ok: false, error: 'ETIMEDOUT' })).toBe('error');
  });

  it('5xx → broken', () => {
    expect(classifySweepStatus({ ok: true, http_status: 500 })).toBe('broken');
    expect(classifySweepStatus({ ok: true, http_status: 503 })).toBe('broken');
  });

  it('4xx → degraded', () => {
    expect(classifySweepStatus({ ok: true, http_status: 403 })).toBe('degraded');
    expect(classifySweepStatus({ ok: true, http_status: 404 })).toBe('degraded');
  });

  it('2xx + fingerprint match → healthy', () => {
    expect(classifySweepStatus({
      ok: true, http_status: 200, fingerprint_match: true,
    })).toBe('healthy');
  });

  it('2xx + fingerprint mismatch → degraded', () => {
    expect(classifySweepStatus({
      ok: true, http_status: 200, fingerprint_match: false,
    })).toBe('degraded');
  });

  it('2xx + no canary → no_record', () => {
    expect(classifySweepStatus({
      ok: true, http_status: 200, fingerprint_match: null,
    })).toBe('no_record');
    expect(classifySweepStatus({
      ok: true, http_status: 200, // fingerprint_match omitted
    })).toBe('no_record');
  });
});

function row(overrides: Partial<SweepRow>): SweepRow {
  return {
    adapter_id: 'a',
    county: 'Bell',
    vendor: 'arcgis',
    site_type: 'tax_records',
    base_url: 'https://example.com',
    status: 'healthy',
    http_status: 200,
    duration_ms: 150,
    fingerprint_match: true,
    summary: 'ok',
    ...overrides,
  };
}

describe('summarizeSweep', () => {
  it('zero rows → zero counts', () => {
    const s = summarizeSweep([], 12);
    expect(s.total).toBe(0);
    expect(s.healthy).toBe(0);
    expect(s.attention).toEqual([]);
    expect(s.duration_ms).toBe(12);
  });

  it('all healthy → no attention rows', () => {
    const s = summarizeSweep([row({ adapter_id: 'a' }), row({ adapter_id: 'b' })], 200);
    expect(s.total).toBe(2);
    expect(s.healthy).toBe(2);
    expect(s.attention).toEqual([]);
  });

  it('mixed statuses tally + attention list orders broken→degraded→error→no_record', () => {
    const s = summarizeSweep([
      row({ adapter_id: 'a', county: 'Travis',  status: 'no_record' }),
      row({ adapter_id: 'b', county: 'Harris',  status: 'broken' }),
      row({ adapter_id: 'c', county: 'Dallas',  status: 'degraded' }),
      row({ adapter_id: 'd', county: 'Bell',    status: 'healthy' }),
      row({ adapter_id: 'e', county: 'Tarrant', status: 'error' }),
    ], 1500);
    expect(s.total).toBe(5);
    expect(s.healthy).toBe(1);
    expect(s.degraded).toBe(1);
    expect(s.broken).toBe(1);
    expect(s.no_record).toBe(1);
    expect(s.errored).toBe(1);
    expect(s.attention.map((r) => r.status)).toEqual([
      'broken', 'degraded', 'error', 'no_record',
    ]);
  });

  it('within a status tier, attention is alphabetized by county', () => {
    const s = summarizeSweep([
      row({ adapter_id: 'a', county: 'Tarrant', status: 'broken' }),
      row({ adapter_id: 'b', county: 'Harris',  status: 'broken' }),
      row({ adapter_id: 'c', county: 'Bell',    status: 'broken' }),
    ], 0);
    expect(s.attention.map((r) => r.county)).toEqual(['Bell', 'Harris', 'Tarrant']);
  });
});

describe('describeSweep', () => {
  it('all-healthy → "All N websites responded healthy."', () => {
    const s = summarizeSweep([
      row({ adapter_id: 'a' }), row({ adapter_id: 'b' }), row({ adapter_id: 'c' }),
    ], 100);
    expect(describeSweep(s)).toBe('All 3 websites responded healthy.');
  });

  it('mixed → "N healthy · M need attention · K broken"', () => {
    const s = summarizeSweep([
      row({ adapter_id: 'a', status: 'healthy' }),
      row({ adapter_id: 'b', status: 'healthy' }),
      row({ adapter_id: 'c', status: 'broken' }),
      row({ adapter_id: 'd', status: 'degraded' }),
    ], 100);
    expect(describeSweep(s)).toContain('2 healthy');
    expect(describeSweep(s)).toContain('2 need attention');
    expect(describeSweep(s)).toContain('1 broken');
  });

  it('zero rows → "No adapters checked."', () => {
    const s = summarizeSweep([], 0);
    expect(describeSweep(s)).toBe('No adapters checked.');
  });
});

describe('describeProbe', () => {
  it('healthy mentions baseline match', () => {
    expect(describeProbe({
      status: 'healthy', httpStatus: 200, fingerprintMatch: true, error: null,
    })).toContain('matches our baseline');
  });
  it('broken includes the HTTP status', () => {
    expect(describeProbe({
      status: 'broken', httpStatus: 503, fingerprintMatch: null, error: null,
    })).toContain('503');
  });
  it('degraded + fingerprint mismatch points at the portal refresh', () => {
    expect(describeProbe({
      status: 'degraded', httpStatus: 200, fingerprintMatch: false, error: null,
    })).toContain('page structure has changed');
  });
  it('no_record mentions the missing baseline', () => {
    expect(describeProbe({
      status: 'no_record', httpStatus: 200, fingerprintMatch: null, error: null,
    })).toContain('no baseline');
  });
  it('error includes the error message when present', () => {
    expect(describeProbe({
      status: 'error', httpStatus: null, fingerprintMatch: null, error: 'ETIMEDOUT',
    })).toContain('ETIMEDOUT');
  });
});

// __tests__/hub/widgets/sun-calculator-format.test.ts
//
// hub-widget-excellence-15 — sun-calculator R4 (units). The endpoint now
// returns ISO-8601 UTC times, so formatTime renders real clock times.
// The UTC path is deterministic; the local path is the runtime zone
// (asserted only to be non-empty + suffix-free).

import { describe, it, expect } from 'vitest';
import { formatTime } from '@/lib/hub/widgets/sun-calculator';

describe('sun-calculator formatTime — ISO times', () => {
  const iso = '2026-05-30T11:30:00.000Z';

  it('renders the UTC clock time with a " UTC" suffix when units=utc', () => {
    expect(formatTime(iso, 'utc')).toBe('11:30 AM UTC');
  });

  it('renders a clock time (no UTC suffix) when units=local', () => {
    const out = formatTime(iso, 'local');
    expect(out).not.toContain('UTC');
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('sun-calculator formatTime — non-ISO passthrough (unchanged)', () => {
  it('keeps the legacy behaviour for already-formatted strings', () => {
    expect(formatTime('6:32 AM', 'local')).toBe('6:32 AM');
    expect(formatTime('6:32 AM', 'utc')).toBe('6:32 AM UTC');
  });
});

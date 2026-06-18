// __tests__/admin/hub-s6-sun-calculator.test.ts
//
// Slice S6 of widget-size-responsive-content-2026-06-18 —
// per-bucket growth for `sun-calculator` (the only non-exemplary
// widget in S6). The other eight S6 widgets are deferred — each
// already has sophisticated per-bucket logic (pinned-pages +
// quick-actions self-measure to fill the cell, daily-briefing
// has section caps + already gates on bucket, bookmarks +
// contacts already cap by bucket, recent-activity + activity +
// approvals all follow the consolidated W5 pattern).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  daylightProgress,
  formatCountdown,
  nextSunEvent,
} from '@/lib/hub/widgets/sun-calculator';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('nextSunEvent (pure)', () => {
  const now = Date.parse('2026-06-18T12:00:00Z');

  it('picks the earlier of sunrise / sunset', () => {
    expect(nextSunEvent('2026-06-18T13:00:00Z', '2026-06-19T02:00:00Z', now))
      .toEqual({ kind: 'sunrise', minutesFromNow: 60 });
    expect(nextSunEvent('2026-06-19T05:00:00Z', '2026-06-18T19:30:00Z', now))
      .toEqual({ kind: 'sunset', minutesFromNow: 450 });
  });

  it('returns null when neither ISO is parseable or both are past', () => {
    expect(nextSunEvent(null, null, now)).toBeNull();
    expect(nextSunEvent('6:32 AM', '8:14 PM', now)).toBeNull();
    expect(nextSunEvent('2026-06-17T13:00:00Z', '2026-06-17T19:00:00Z', now)).toBeNull();
  });

  it("rejects events further than 24h out (sun events repeat daily)", () => {
    expect(nextSunEvent('2026-06-20T13:00:00Z', null, now)).toBeNull();
  });
});

describe('daylightProgress (pure)', () => {
  it('returns 0% before sunrise, 100% after sunset', () => {
    expect(daylightProgress('2026-06-18T13:00:00Z', '2026-06-19T02:00:00Z', Date.parse('2026-06-18T12:00:00Z')))
      .toEqual({ percentComplete: 0 });
    expect(daylightProgress('2026-06-18T13:00:00Z', '2026-06-18T20:00:00Z', Date.parse('2026-06-18T21:00:00Z')))
      .toEqual({ percentComplete: 100 });
  });

  it('linearly interpolates between sunrise + sunset', () => {
    const now = Date.parse('2026-06-18T16:00:00Z'); // 3h after sunrise (12h day → 25%)
    expect(daylightProgress('2026-06-18T13:00:00Z', '2026-06-19T01:00:00Z', now))
      .toEqual({ percentComplete: 25 });
  });

  it('returns null when either ISO is missing / invalid / inverted', () => {
    expect(daylightProgress(null, null, Date.now())).toBeNull();
    expect(daylightProgress('not-iso', 'not-iso', Date.now())).toBeNull();
    expect(daylightProgress('2026-06-18T20:00:00Z', '2026-06-18T13:00:00Z', Date.now())).toBeNull();
  });
});

describe('formatCountdown (pure)', () => {
  it('< 1m, raw minutes, hours, hours + minutes', () => {
    expect(formatCountdown(0)).toBe('< 1m');
    expect(formatCountdown(0.4)).toBe('< 1m');
    expect(formatCountdown(45)).toBe('45m');
    expect(formatCountdown(60)).toBe('1h');
    expect(formatCountdown(90)).toBe('1h 30m');
    expect(formatCountdown(125)).toBe('2h 5m');
  });

  it("returns '< 1m' for non-finite inputs", () => {
    expect(formatCountdown(Number.NaN)).toBe('< 1m');
    expect(formatCountdown(-5)).toBe('< 1m');
  });
});

describe('sun-calculator rendering contract (S6)', () => {
  const SRC = read('lib/hub/widgets/sun-calculator/index.tsx');

  it('per-bucket dynamic testid', () => {
    expect(SRC).toMatch(/data-testid=\{`sun-calculator-\$\{bucket\}`\}/);
  });

  it('countdown chip renders at medium+', () => {
    expect(SRC).toMatch(/const showCountdown = bucket === 'medium' \|\| bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="sun-calculator-countdown"/);
  });

  it('daylight-progress bar renders at large+', () => {
    expect(SRC).toMatch(/const showDaylightBar = bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="sun-calculator-daylight-bar"/);
  });
});

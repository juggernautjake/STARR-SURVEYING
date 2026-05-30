import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, statusDot, cellColor, crewWindow } from '@/lib/hub/widgets/crew-calendar';

describe('crew-calendar', () => {
  it('registers in operational category, manager roles only', () => {
    const def = getWidget('crew-calendar');
    expect(def?.category).toBe('operational');
    expect(def?.allowedRoles).toEqual(['admin', 'developer', 'tech_support', 'equipment_manager']);
  });

  it('caps per bucket', () => {
    expect(capForBucket('tiny')).toBe(2);
    expect(capForBucket('small')).toBe(4);
    expect(capForBucket('medium')).toBe(6);
    expect(capForBucket('large')).toBe(10);
    expect(capForBucket('xlarge')).toBe(20);
  });

  it('cellColor maps the REAL crew-calendar states (R1)', () => {
    expect(cellColor('confirmed')).toBe('var(--theme-success)');
    expect(cellColor('proposed')).toBe('var(--theme-accent)');
    expect(cellColor('split_shift')).toBe('var(--theme-accent)');
    expect(cellColor('unconfirmed_overdue')).toBe('var(--theme-danger)');
    expect(cellColor('time_off')).toBe('var(--theme-warning)');
    expect(cellColor('unavailable')).toBe('var(--theme-warning)');
    expect(cellColor('open')).toBe('var(--theme-fg-muted)');
    expect(cellColor(null)).toBe('var(--theme-fg-muted)'); // default
  });

  it('statusDot wraps cellColor', () => {
    expect(statusDot('confirmed').background).toBe('var(--theme-success)');
  });
});

describe('crew-calendar — crewWindow (?from=&to=)', () => {
  // 2026-05-27 is a Wednesday; the Monday of that week is 2026-05-25.
  const NOW = Date.UTC(2026, 4, 27, 12, 0, 0);

  it('this-week = Mon → +7d', () => {
    expect(crewWindow('this-week', NOW)).toEqual({ from: '2026-05-25', to: '2026-06-01' });
  });
  it('next-week = next Mon → +7d', () => {
    expect(crewWindow('next-week', NOW)).toEqual({ from: '2026-06-01', to: '2026-06-08' });
  });
  it('two-weeks = Mon → +14d', () => {
    expect(crewWindow('two-weeks', NOW)).toEqual({ from: '2026-05-25', to: '2026-06-08' });
  });
});

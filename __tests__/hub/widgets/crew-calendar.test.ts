import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import { capForBucket, statusDot } from '@/lib/hub/widgets/crew-calendar';

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

  it('statusDot maps each status to a distinct color', () => {
    expect(statusDot('assigned').background).toBe('var(--theme-accent)');
    expect(statusDot('available').background).toBe('var(--theme-success)');
    expect(statusDot('pto').background).toBe('var(--theme-warning)');
    expect(statusDot('off').background).toBe('var(--theme-fg-muted)');
  });
});

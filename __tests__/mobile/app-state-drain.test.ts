import { describe, it, expect } from 'vitest';
import { shouldDrainOnAppStateChange } from '../../mobile/lib/appStateDrain';

// workmode Area C / C2 — the prompt-resume rule for the upload drainer: when the app returns to the
// foreground after being suspended (JS timers throttled), resume the queue immediately instead of
// waiting up to the 60s periodic interval. Pure + off-device (like queueOrder / drainDecision).
describe('shouldDrainOnAppStateChange', () => {
  it('drains when returning to the foreground from background or inactive', () => {
    expect(shouldDrainOnAppStateChange('background', 'active')).toBe(true);
    expect(shouldDrainOnAppStateChange('inactive', 'active')).toBe(true);
  });

  it('does NOT drain on a duplicate active event (RN can emit active → active)', () => {
    expect(shouldDrainOnAppStateChange('active', 'active')).toBe(false);
  });

  it('does NOT drain when LEAVING the foreground', () => {
    expect(shouldDrainOnAppStateChange('active', 'background')).toBe(false);
    expect(shouldDrainOnAppStateChange('active', 'inactive')).toBe(false);
  });

  it('does not drain on background ↔ inactive churn while still away (no foreground yet)', () => {
    expect(shouldDrainOnAppStateChange('background', 'inactive')).toBe(false);
    expect(shouldDrainOnAppStateChange('inactive', 'background')).toBe(false);
  });

  it('an inactive-flicker return (active→inactive→active) drains exactly once, on the way back', () => {
    // The transition INTO inactive does not drain; the transition BACK to active does — one drain, and
    // a drain with nothing eligible is a harmless no-op (documented trade-off).
    expect(shouldDrainOnAppStateChange('active', 'inactive')).toBe(false);
    expect(shouldDrainOnAppStateChange('inactive', 'active')).toBe(true);
  });

  it('tolerates an unknown/future platform state without draining unless it lands on active', () => {
    expect(shouldDrainOnAppStateChange('active', 'unknown')).toBe(false);
    expect(shouldDrainOnAppStateChange('unknown', 'active')).toBe(true);
  });
});

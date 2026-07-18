import { describe, it, expect } from 'vitest';
import { shouldSaveToCameraRoll, normalizeCameraRollPref, cameraRollPrefLabel, DEFAULT_CAMERA_ROLL_PREF } from '../../mobile/lib/cameraRollSave';

// workmode — the pure camera-roll save decision. The owner wants captures saved to the phone BY DEFAULT
// (opt-out), unlike the app's existing opt-in device backup. Off-device + deterministic.

describe('shouldSaveToCameraRoll (default ON per the owner)', () => {
  it('saves by default — a missing/undefined/unknown preference still saves', () => {
    expect(DEFAULT_CAMERA_ROLL_PREF).toBe('on');
    expect(shouldSaveToCameraRoll(undefined)).toBe(true);
    expect(shouldSaveToCameraRoll(null)).toBe(true);
    expect(shouldSaveToCameraRoll('garbage')).toBe(true);
    expect(shouldSaveToCameraRoll('on')).toBe(true);
  });

  it('only an explicit "off" opts out', () => {
    expect(shouldSaveToCameraRoll('off')).toBe(false);
  });
});

describe('normalizeCameraRollPref + labels', () => {
  it('normalizes to on/off, defaulting to on', () => {
    expect(normalizeCameraRollPref('off')).toBe('off');
    expect(normalizeCameraRollPref('on')).toBe('on');
    expect(normalizeCameraRollPref(undefined)).toBe('on');
    expect(normalizeCameraRollPref(3)).toBe('on');
  });
  it('has a label for each', () => {
    expect(cameraRollPrefLabel('on')).toBeTruthy();
    expect(cameraRollPrefLabel('off')).toBeTruthy();
  });
});

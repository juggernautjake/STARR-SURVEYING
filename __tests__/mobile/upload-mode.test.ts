import { describe, it, expect } from 'vitest';
import {
  DEFAULT_UPLOAD_MODE,
  UPLOAD_MODES,
  canDrain,
  shouldAutoAdvance,
  isPausedMode,
  normalizeUploadMode,
  uploadModeLabel,
  uploadModeDescription,
  cycleUploadMode,
  type UploadMode,
} from '../../mobile/lib/uploadMode';

// workmode Area C4 — the queue-WIDE mode the owner asked for: automatic / manual / pause-all. Distinct
// from queueOrder's per-row `paused`. Pure + off-device, like the other upload engines.

describe('canDrain', () => {
  it('automatic drains on any trigger', () => {
    expect(canDrain('automatic')).toBe(true);
    expect(canDrain('automatic', { userInitiated: false })).toBe(true);
    expect(canDrain('automatic', { userInitiated: true })).toBe(true);
  });
  it('manual drains only on a user-initiated request', () => {
    expect(canDrain('manual', { userInitiated: true })).toBe(true);
    expect(canDrain('manual', { userInitiated: false })).toBe(false);
    expect(canDrain('manual')).toBe(false); // an automatic trigger is a no-op in manual
  });
  it('paused never drains, even when the user asks', () => {
    expect(canDrain('paused', { userInitiated: true })).toBe(false);
    expect(canDrain('paused')).toBe(false);
  });
});

describe('shouldAutoAdvance', () => {
  it('only automatic continues to the next row on its own', () => {
    expect(shouldAutoAdvance('automatic')).toBe(true);
    expect(shouldAutoAdvance('manual')).toBe(false);
    expect(shouldAutoAdvance('paused')).toBe(false);
  });
});

describe('isPausedMode', () => {
  it('is true only for paused', () => {
    expect(isPausedMode('paused')).toBe(true);
    expect(isPausedMode('automatic')).toBe(false);
    expect(isPausedMode('manual')).toBe(false);
  });
});

describe('normalizeUploadMode', () => {
  it('passes valid modes through', () => {
    for (const m of UPLOAD_MODES) expect(normalizeUploadMode(m)).toBe(m);
  });
  it('falls back to the default for anything invalid/absent', () => {
    expect(normalizeUploadMode(undefined)).toBe(DEFAULT_UPLOAD_MODE);
    expect(normalizeUploadMode(null)).toBe(DEFAULT_UPLOAD_MODE);
    expect(normalizeUploadMode('garbage')).toBe(DEFAULT_UPLOAD_MODE);
    expect(normalizeUploadMode(3)).toBe(DEFAULT_UPLOAD_MODE);
    expect(DEFAULT_UPLOAD_MODE).toBe('automatic');
  });
});

describe('labels + descriptions + cycle', () => {
  it('has a non-empty label + description for every mode', () => {
    for (const m of UPLOAD_MODES) {
      expect(uploadModeLabel(m)).toBeTruthy();
      expect(uploadModeDescription(m)).toBeTruthy();
    }
  });
  it('cycles automatic → manual → paused → automatic', () => {
    expect(cycleUploadMode('automatic')).toBe('manual');
    expect(cycleUploadMode('manual')).toBe('paused');
    expect(cycleUploadMode('paused')).toBe('automatic');
  });
  it('covers exactly the three modes', () => {
    const modes: UploadMode[] = ['automatic', 'manual', 'paused'];
    expect([...UPLOAD_MODES].sort()).toEqual([...modes].sort());
  });
});

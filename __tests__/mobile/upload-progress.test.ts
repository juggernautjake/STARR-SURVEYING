import { describe, it, expect } from 'vitest';
import { uploadProgress, formatBytes, uploadSizeCaption } from '../../mobile/lib/uploadProgress';

// workmode Area C3 — the pure progress-bar math (bytes-sent / total → fraction/percent/label). Off-device +
// deterministic; the runtime feeds it the upload task's progress callback values.

describe('uploadProgress', () => {
  it('computes fraction + percent + label from sent/total', () => {
    const p = uploadProgress(45, 100);
    expect(p.fraction).toBeCloseTo(0.45);
    expect(p.percent).toBe(45);
    expect(p.label).toBe('45%');
    expect(p.indeterminate).toBe(false);
  });
  it('clamps to [0,1] and rounds sensibly', () => {
    expect(uploadProgress(150, 100).fraction).toBe(1); // over-report clamps to full
    expect(uploadProgress(-5, 100).fraction).toBe(0);
    expect(uploadProgress(1, 3).percent).toBe(33);
  });
  it('is indeterminate when the total is unknown / non-positive', () => {
    for (const t of [0, -1, NaN]) {
      const p = uploadProgress(10, t);
      expect(p.indeterminate).toBe(true);
      expect(p.label).toBe('…');
      expect(p.fraction).toBe(0);
    }
  });
  it('reads 100% when complete', () => {
    expect(uploadProgress(500, 500).label).toBe('100%');
  });
});

describe('formatBytes', () => {
  it('scales B/KB/MB/GB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2_400_000)).toBe('2.3 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('uploadSizeCaption', () => {
  it('reads "X of Y" when the total is known, blank otherwise', () => {
    expect(uploadSizeCaption(2_400_000, 5_000_000)).toMatch(/2\.3 MB of 4\.8 MB/);
    expect(uploadSizeCaption(10, 0)).toBe('');
  });
});

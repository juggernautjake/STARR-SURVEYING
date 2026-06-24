import { describe, it, expect } from 'vitest';
import {
  normalizePct,
  progressColor,
  progressLabel,
  isComplete,
  progressLabelColor,
} from '@/lib/learn/module-progress';

function hueOf(hsl: string): number {
  const m = hsl.match(/hsl\((\d+)/);
  return m ? parseInt(m[1], 10) : NaN;
}

describe('module-progress helpers', () => {
  it('normalizePct clamps and rounds', () => {
    expect(normalizePct(null)).toBe(0);
    expect(normalizePct(-5)).toBe(0);
    expect(normalizePct(150)).toBe(100);
    expect(normalizePct(42.6)).toBe(43);
  });

  it('endpoints: grey at 0, full blue at 100', () => {
    expect(progressColor(0)).toContain('hsl(220'); // neutral grey
    expect(hueOf(progressColor(100))).toBe(215);    // blue
  });

  it('hue is monotonic non-decreasing yellow → green → blue', () => {
    let prev = -1;
    for (let p = 1; p <= 100; p++) {
      const h = hueOf(progressColor(p));
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it('intermediate bands blend through the expected hue regions', () => {
    // ~yellow near the bottom, ~green near the middle, ~blue near the top.
    expect(hueOf(progressColor(2))).toBeLessThan(70);        // yellow-ish
    expect(Math.abs(hueOf(progressColor(50)) - 140)).toBeLessThanOrEqual(2); // green
    expect(hueOf(progressColor(90))).toBeGreaterThan(180);   // blue-ish
  });

  it('produces many distinct shades (not 3 buckets)', () => {
    const shades = new Set<string>();
    for (let p = 1; p < 100; p++) shades.add(progressColor(p));
    expect(shades.size).toBeGreaterThan(20);
  });

  it('labels: Not Started / Enrolled / pct / COMPLETED!', () => {
    expect(progressLabel({ percentage: 0 })).toBe('Not Started');
    expect(progressLabel({ percentage: 0, user_status: 'enrolled' })).toBe('Enrolled');
    expect(progressLabel({ percentage: 37 })).toBe('37%');
    expect(progressLabel({ percentage: 100 })).toBe('COMPLETED!');
  });

  it('isComplete only at 100', () => {
    expect(isComplete({ percentage: 99 })).toBe(false);
    expect(isComplete({ percentage: 100 })).toBe(true);
  });

  it('label color flips to white at the deep-blue end', () => {
    expect(progressLabelColor(0)).toBe('#4B5563');
    expect(progressLabelColor(40)).toBe('#1F2937');
    expect(progressLabelColor(100)).toBe('#FFFFFF');
  });
});

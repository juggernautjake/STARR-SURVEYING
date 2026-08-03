// CAD_AUDIT Slice S7a — typed coordinates land where they were typed.
//
// `formatCoordinates` does two things to a world point before showing it: it adds the origin offset
// (set automatically whenever survey data with real-world coordinates is imported) and it orders the
// pair by `coordMode`, which defaults to **N then E**, not X then Y.
//
// Nothing undid either. The command bar took a typed `a,b` straight into `{ x: a, y: b }` world feet,
// so on any drawing with a real-world origin a surveyor could read a northing off the status bar,
// type it back, and get a point that is not where they typed it — displaced by the origin, and with
// the axes swapped if they typed in the order the app was showing them.
//
// Both failures are silent, which is what makes them worth a test file: the drawing looks fine, the
// number looks accepted, and the point is in the wrong place. THE ROUND-TRIP TEST BELOW IS THE ONE
// THAT MATTERS — format a world point, feed the displayed numbers back, and require the same point.

import { describe, it, expect } from 'vitest';
import { formatCoordinates, coordinatesFromDisplay } from '@/lib/cad/geometry/units';
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/cad/constants';
import type { DisplayPreferences } from '@/lib/cad/types';

const prefs = (over: Partial<DisplayPreferences> = {}): DisplayPreferences =>
  ({ ...DEFAULT_DISPLAY_PREFERENCES, ...over });

/** Pull the bare numbers back out of the formatted display strings. */
function displayedNumbers(worldX: number, worldY: number, p: DisplayPreferences) {
  const d = formatCoordinates(worldX, worldY, p);
  return [Number.parseFloat(d.value1), Number.parseFloat(d.value2)] as const;
}

describe('the round trip — what you read is what you can type back', () => {
  it('survives a real-world origin in NE mode', () => {
    // The case that was broken. A Texas state-plane northing is ~10 million feet; getting the origin
    // wrong puts the point millions of feet away, and the display would not show what was typed.
    const p = prefs({ originNorthing: 10_233_000, originEasting: 3_456_000, coordMode: 'NE' });
    const [n, e] = displayedNumbers(1234.56, 789.01, p);
    const back = coordinatesFromDisplay(n, e, p);
    expect(back.x).toBeCloseTo(1234.56, 4);
    expect(back.y).toBeCloseTo(789.01, 4);
  });

  it('survives in XY mode', () => {
    const p = prefs({ originNorthing: 5000, originEasting: 2000, coordMode: 'XY' });
    const [x, y] = displayedNumbers(-40.5, 22.25, p);
    const back = coordinatesFromDisplay(x, y, p);
    expect(back.x).toBeCloseTo(-40.5, 4);
    expect(back.y).toBeCloseTo(22.25, 4);
  });

  it('survives a non-foot display unit', () => {
    // Unit conversion and origin removal must happen in the right order — subtracting feet from a
    // value still in metres is the obvious way to get this subtly wrong.
    const p = prefs({ linearUnit: 'M', originNorthing: 1000, originEasting: 500, coordMode: 'NE' });
    const [n, e] = displayedNumbers(300, 400, p);
    const back = coordinatesFromDisplay(n, e, p);
    expect(back.x).toBeCloseTo(300, 3);
    expect(back.y).toBeCloseTo(400, 3);
  });
});

describe('axis order follows the convention the app is DISPLAYING', () => {
  it('reads the first value as NORTHING in NE mode', () => {
    // NE is the default, so the status bar says "N: … E: …". A surveyor typing what they see was
    // getting the axes swapped.
    const got = coordinatesFromDisplay(100, 200, prefs({ coordMode: 'NE' }));
    expect(got.y).toBe(100);   // northing → world Y
    expect(got.x).toBe(200);   // easting  → world X
  });

  it('reads the first value as X in XY mode', () => {
    const got = coordinatesFromDisplay(100, 200, prefs({ coordMode: 'XY' }));
    expect(got.x).toBe(100);
    expect(got.y).toBe(200);
  });
});

describe('the origin is removed, not ignored', () => {
  it('subtracts it', () => {
    const got = coordinatesFromDisplay(
      10_001_000, 3_000_500,
      prefs({ coordMode: 'NE', originNorthing: 10_000_000, originEasting: 3_000_000 }),
    );
    expect(got.y).toBeCloseTo(1000, 6);
    expect(got.x).toBeCloseTo(500, 6);
  });

  it('is a no-op when there is no origin, so nothing changes for ordinary drawings', () => {
    // Most drawings have origin 0. This is why the bug stayed hidden: it only bites once a survey
    // import sets a real-world origin, which is exactly when the coordinates matter most.
    const got = coordinatesFromDisplay(30, 40, prefs({ coordMode: 'XY' }));
    expect(got).toEqual({ x: 30, y: 40 });
  });
});

describe('the command bar uses it', () => {
  // A correct inverse that nothing calls leaves the defect exactly where it was.
  const src = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'app/admin/cad/components/CommandBar.tsx'), 'utf8');
  const code = src.split('\n')
    .filter((l: string) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

  it('imports the inverse', () => {
    expect(code).toContain('coordinatesFromDisplay');
  });

  it('no longer takes typed values as raw world coordinates', () => {
    expect(code).not.toContain('pt = { x: val.x ?? 0, y: val.y ?? 0 }');
  });
});

// __tests__/cad/geometry/units.test.ts — Unit tests for units.ts display utilities
import { describe, it, expect } from 'vitest';
import {
  formatDistance,
  formatCoordinates,
  formatArea,
  formatSurveyAngle,
} from '@/lib/cad/geometry/units';
import type { DisplayPreferences } from '@/lib/cad/types';
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/cad/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function prefs(overrides: Partial<DisplayPreferences> = {}): DisplayPreferences {
  return { ...DEFAULT_DISPLAY_PREFERENCES, ...overrides };
}

// ── formatDistance ────────────────────────────────────────────────────────────

describe('formatDistance', () => {
  it('default ft decimal', () => {
    const result = formatDistance(12.5, prefs());
    expect(result).toBe('12.500 ft');
  });

  it('inches conversion', () => {
    const result = formatDistance(1, prefs({ linearUnit: 'IN' }));
    expect(result).toBe('12.000 in');
  });

  it('miles conversion', () => {
    const result = formatDistance(5280, prefs({ linearUnit: 'MILE', linearDecimalPlaces: 3 }));
    expect(result).toBe('1.000 mi');
  });

  it('meters conversion (1 ft ≈ 0.3048 m)', () => {
    const result = formatDistance(1, prefs({ linearUnit: 'M', linearDecimalPlaces: 4 }));
    expect(result).toBe('0.3048 m');
  });

  it('centimeters conversion', () => {
    const result = formatDistance(1, prefs({ linearUnit: 'CM', linearDecimalPlaces: 2 }));
    expect(result).toBe('30.48 cm');
  });

  it('decimal places are respected', () => {
    const result = formatDistance(100, prefs({ linearDecimalPlaces: 0 }));
    expect(result).toBe('100 ft');
  });

  it('fraction format — 1.5 ft = 1 1/2 ft', () => {
    const result = formatDistance(1.5, prefs({ linearFormat: 'FRACTION' }));
    expect(result).toBe('1 1/2 ft');
  });

  it('fraction format — 1.25 ft = 1 1/4 ft', () => {
    const result = formatDistance(1.25, prefs({ linearFormat: 'FRACTION' }));
    expect(result).toBe('1 1/4 ft');
  });

  it('fraction format — whole number', () => {
    const result = formatDistance(3, prefs({ linearFormat: 'FRACTION' }));
    expect(result).toBe('3 ft');
  });
});

// ── formatCoordinates ─────────────────────────────────────────────────────────

describe('formatCoordinates', () => {
  it('NE mode with zero origin gives N and E labels', () => {
    const c = formatCoordinates(100, 200, prefs({ coordMode: 'NE' }));
    expect(c.label1).toBe('N');
    expect(c.label2).toBe('E');
    expect(c.value1).toContain('200');  // northing = worldY + originNorthing
    expect(c.value2).toContain('100');  // easting  = worldX + originEasting
  });

  it('XY mode gives X and Y labels', () => {
    const c = formatCoordinates(50, 75, prefs({ coordMode: 'XY' }));
    expect(c.label1).toBe('X');
    expect(c.label2).toBe('Y');
  });

  it('origin offset is applied', () => {
    const c = formatCoordinates(100, 200, prefs({
      coordMode: 'NE',
      originNorthing: 5000,
      originEasting: 3000,
    }));
    // Displayed northing = worldY + originNorthing = 200 + 5000 = 5200
    expect(c.value1).toContain('5200');
    // Displayed easting = worldX + originEasting = 100 + 3000 = 3100
    expect(c.value2).toContain('3100');
  });

  it('unit conversion applies to coordinates', () => {
    const c = formatCoordinates(1, 1, prefs({ linearUnit: 'M', linearDecimalPlaces: 4 }));
    expect(c.value1).toContain('0.3048');
    expect(c.value2).toContain('0.3048');
  });
});

// ── formatArea ────────────────────────────────────────────────────────────────

describe('formatArea', () => {
  it('sq ft display', () => {
    const result = formatArea(1000, prefs({ areaUnit: 'SQ_FT' }));
    expect(result).toContain('1000');
    expect(result).toContain('sf');
  });

  it('acres conversion (43560 sqft = 1 acre)', () => {
    const result = formatArea(43560, prefs({ areaUnit: 'ACRES' }));
    expect(result).toContain('1.00');
    expect(result).toContain('ac');
  });

  it('sq meters conversion', () => {
    // 1 sq ft = 0.3048² ≈ 0.0929 m²
    const result = formatArea(1, prefs({ areaUnit: 'SQ_M' }));
    expect(result).toContain('m²');
    const val = parseFloat(result);
    expect(val).toBeCloseTo(0.0929, 3);
  });

  it('hectares conversion', () => {
    const result = formatArea(107639, prefs({ areaUnit: 'HECTARES' }));
    // 107639 sqft ≈ 1 hectare
    expect(result).toContain('ha');
    const val = parseFloat(result);
    expect(val).toBeCloseTo(1.0, 0);
  });
});

// ── formatSurveyAngle (bearing display) ──────────────────────────────────────

describe('formatSurveyAngle', () => {
  it('DMS quadrant — azimuth 0 = N 0°00\'00" E', () => {
    const result = formatSurveyAngle(0, prefs({ bearingFormat: 'QUADRANT', angleFormat: 'DMS' }));
    expect(result).toMatch(/^N\s+0°/);
  });

  it('DMS quadrant — azimuth 90 = S 90 or N 90... actually NE', () => {
    // Azimuth 45 → NE quadrant
    const result = formatSurveyAngle(45, prefs({ bearingFormat: 'QUADRANT', angleFormat: 'DMS' }));
    expect(result.startsWith('N')).toBe(true);
    expect(result.endsWith('E')).toBe(true);
  });

  it('DMS quadrant — azimuth 135 = SE quadrant', () => {
    const result = formatSurveyAngle(135, prefs({ bearingFormat: 'QUADRANT', angleFormat: 'DMS' }));
    expect(result.startsWith('S')).toBe(true);
    expect(result.endsWith('E')).toBe(true);
  });

  it('DMS quadrant — azimuth 225 = SW quadrant', () => {
    const result = formatSurveyAngle(225, prefs({ bearingFormat: 'QUADRANT', angleFormat: 'DMS' }));
    expect(result.startsWith('S')).toBe(true);
    expect(result.endsWith('W')).toBe(true);
  });

  it('DMS quadrant — azimuth 315 = NW quadrant', () => {
    const result = formatSurveyAngle(315, prefs({ bearingFormat: 'QUADRANT', angleFormat: 'DMS' }));
    expect(result.startsWith('N')).toBe(true);
    expect(result.endsWith('W')).toBe(true);
  });

  it('azimuth style — returns plain degrees', () => {
    const result = formatSurveyAngle(45, prefs({ bearingFormat: 'AZIMUTH', angleFormat: 'DMS' }));
    expect(result).toMatch(/°/);
    expect(result).not.toMatch(/^[NS]/);
  });

  it('decimal-degree azimuth', () => {
    const result = formatSurveyAngle(45, prefs({ bearingFormat: 'AZIMUTH', angleFormat: 'DECIMAL_DEG' }));
    expect(result).toBe('45.0000°');
  });
});

// ── validate that DEFAULT_DISPLAY_PREFERENCES has expected values ─────────────

describe('DEFAULT_DISPLAY_PREFERENCES', () => {
  it('defaults to FT decimal with DMS quadrant NE coords', () => {
    const d = DEFAULT_DISPLAY_PREFERENCES;
    expect(d.linearUnit).toBe('FT');
    expect(d.linearFormat).toBe('DECIMAL');
    expect(d.linearDecimalPlaces).toBe(3);
    expect(d.areaUnit).toBe('SQ_FT');
    expect(d.angleFormat).toBe('DMS');
    expect(d.bearingFormat).toBe('QUADRANT');
    expect(d.coordMode).toBe('NE');
    expect(d.originNorthing).toBe(0);
    expect(d.originEasting).toBe(0);
  });
});

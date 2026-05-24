// __tests__/cad/import/csv-parser.test.ts
// Parser coverage for real-world survey CSVs with alphanumeric point
// names + free-form descriptions (the 624082f3 sample).

import { describe, it, expect } from 'vitest';
import { parseCSV } from '@/lib/cad/import/csv-parser';
import { DEFAULT_CSV_CONFIG } from '@/lib/cad/import/types';

// A representative slice of the user's file, incl. the cases that used
// to break: a non-numeric-leading name (Temp0000), names with trailing
// letters (20fnd / 23set), multi-word descriptions, and an empty code.
const SAMPLE = [
  '1,5000.000,5000.000,700.000,314',
  '20fnd,4999.857,4982.031,700.662,315 1in',
  '21fnd,5080.153,5022.456,701.038,308 cap 5335',
  '119,5062.690,5024.538,699.709,gravel drive center',
  'Temp0000,5084.797,4902.804,701.886,',
  '23set,5060.621,4858.912,702.046,309',
].join('\n');

describe('parseCSV — alphanumeric point names', () => {
  const rows = parseCSV(SAMPLE, DEFAULT_CSV_CONFIG);
  const ok = rows.filter((r) => r.data !== null);

  it('parses every row, including the non-numeric "Temp0000" name', () => {
    expect(rows).toHaveLength(6);
    expect(ok).toHaveLength(6); // none dropped
    expect(ok.some((r) => r.data!.pointName === 'Temp0000')).toBe(true);
  });

  it('preserves the raw alphanumeric names', () => {
    const names = ok.map((r) => r.data!.pointName);
    expect(names).toEqual(['1', '20fnd', '21fnd', '119', 'Temp0000', '23set']);
  });

  it('maps N/E in NE order and elevation', () => {
    const p1 = ok[0].data!;
    expect(p1.northing).toBeCloseTo(5000.0, 3);
    expect(p1.easting).toBeCloseTo(5000.0, 3);
    expect(p1.elevation).toBeCloseTo(700.0, 3);
  });

  it('extracts the leading code token from a multi-word description', () => {
    const p21 = ok.find((r) => r.data!.pointName === '21fnd')!.data!;
    expect(p21.rawCode).toBe('308');
    expect(p21.description).toBe('cap 5335');
  });

  it('derives numeric pointNumber from leading digits, synthetic for none', () => {
    const byName = Object.fromEntries(ok.map((r) => [r.data!.pointName, r.data!.pointNumber]));
    expect(byName['20fnd']).toBe(20);
    expect(byName['23set']).toBe(23);
    expect(byName['Temp0000']).toBeLessThan(0); // synthetic, unique, won't collide
  });

  it('handles an empty code field without dropping the row', () => {
    const temp = ok.find((r) => r.data!.pointName === 'Temp0000')!.data!;
    expect(temp.rawCode).toBe('');
    expect(temp.easting).toBeCloseTo(4902.804, 3);
  });
});

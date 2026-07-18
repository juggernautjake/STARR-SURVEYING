import { describe, it, expect } from 'vitest';
import { parseCoordCsv, sniffSeparator, matchedRowNames, type ParsedCoordRow } from '../../mobile/lib/csvCoords';

// mobile/lib/csvCoords.ts — the survey-coordinate CSV parser (Trimble/Carlson/Topcon P,N,E,Z,D exports).
// A pure, correctness-critical module (a parse bug corrupts field data) that shipped with NO tests. This
// pins the real-world variants its own docstring promises: separators, header sniffing, both column orders,
// quoted fields with embedded commas, comma-thousands, comment/blank lines, and the name-match linker.

describe('sniffSeparator', () => {
  it('detects comma, tab, and semicolon; empty → null; ties fall back to comma', () => {
    expect(sniffSeparator('BM01,100,200,50,desc')).toBe(',');
    expect(sniffSeparator('BM01\t100\t200\t50\tdesc')).toBe('\t');
    expect(sniffSeparator('BM01;100;200;50;desc')).toBe(';');
    expect(sniffSeparator('   ')).toBeNull();
    expect(sniffSeparator('')).toBeNull();
  });
});

describe('parseCoordCsv — P,N,E,Z,D (point first)', () => {
  it('parses a headered comma file into structured rows, skipping the header', () => {
    const csv = [
      'Point,Northing,Easting,Elevation,Description',
      'BM01,3120456.123,1234567.890,892.45,Found rebar',
      'CP02,3120500.000,1234600.000,895.10,Set nail',
    ].join('\n');
    const r = parseCoordCsv(csv);
    expect(r.format).toBe('pnezd');
    expect(r.separator).toBe(',');
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({
      rowNumber: 2, // 1-based, header is row 1
      name: 'BM01',
      northing: 3120456.123,
      easting: 1234567.890,
      elevation: 892.45,
      description: 'Found rebar',
    });
    expect(r.rows[1].name).toBe('CP02');
    expect(r.warnings).toEqual([]);
  });

  it('parses a headerless file and numbers rows from 1', () => {
    const r = parseCoordCsv('BM01,100,200,50,desc');
    expect(r.format).toBe('pnezd');
    expect(r.hasHeader).toBe(false);
    expect(r.rows[0].rowNumber).toBe(1);
    expect(r.rows[0]).toMatchObject({ name: 'BM01', northing: 100, easting: 200, elevation: 50 });
  });

  it('honors quoted fields with embedded separators (a comma inside the description)', () => {
    const r = parseCoordCsv('BM01,3120456.123,1234567.890,892.45,"Found rebar, cap stamped LS 1234"');
    expect(r.format).toBe('pnezd');
    expect(r.rows[0].description).toBe('Found rebar, cap stamped LS 1234');
    expect(r.rows[0].easting).toBe(1234567.890);
  });
});

describe('parseCoordCsv — N,E,Z,D,P (point last, Carlson SurvCE)', () => {
  it('detects the swapped order and pulls the name from the last column', () => {
    const r = parseCoordCsv('3120456.123,1234567.890,892.45,Found rebar,BM01');
    expect(r.format).toBe('nezdp');
    expect(r.rows[0]).toMatchObject({
      name: 'BM01',
      northing: 3120456.123,
      easting: 1234567.890,
      elevation: 892.45,
      description: 'Found rebar',
    });
  });
});

describe('parseCoordCsv — separators + numeric variants', () => {
  it('parses a semicolon file with comma-thousands numbers (European export)', () => {
    // Semicolon-separated so the thousands-commas live inside cells; toNumber strips them.
    const r = parseCoordCsv('BM01;3,120,456.123;1234567.890;892.45;desc');
    expect(r.separator).toBe(';');
    expect(r.format).toBe('pnezd');
    expect(r.rows[0].northing).toBe(3120456.123); // "3,120,456.123" → 3120456.123
    expect(r.rows[0].easting).toBe(1234567.890);
  });

  it('skips comment (#) and blank lines', () => {
    const csv = ['# Trimble export 2026-07-18', 'Point,N,E,Z,D', '', 'BM01,100,200,50,x', '   '].join('\n');
    const r = parseCoordCsv(csv);
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].name).toBe('BM01');
  });
});

describe('parseCoordCsv — soft failures never throw', () => {
  it('an empty file returns unknown format with a warning, not a crash', () => {
    const r = parseCoordCsv('');
    expect(r.format).toBe('unknown');
    expect(r.separator).toBeNull();
    expect(r.rows).toEqual([]);
    expect(r.warnings).toContain('Empty file.');
  });

  it('a row with no parseable coordinates is kept but warned about (not silently dropped)', () => {
    const r = parseCoordCsv(['BM01,100,200,50,good', 'BM02,x,y,z,bad'].join('\n'));
    expect(r.format).toBe('pnezd');
    expect(r.rows).toHaveLength(2); // the bad row survives for the raw-grid view
    expect(r.rows[1]).toMatchObject({ name: 'BM02', northing: null, easting: null, elevation: null });
    expect(r.warnings.some((w) => /Row 2: no parseable coordinates/.test(w))).toBe(true);
  });

  it('an undetectable format surfaces rows as raw cells with null structured fields', () => {
    // A leading numeric keeps it out of the header heuristic; only 3 columns keeps it out of both formats.
    const r = parseCoordCsv('100,alpha,beta');
    expect(r.format).toBe('unknown');
    expect(r.rows[0].raw).toEqual(['100', 'alpha', 'beta']);
    expect(r.rows[0].northing).toBeNull();
  });
});

describe('matchedRowNames', () => {
  const rows = (names: (string | null)[]): ParsedCoordRow[] =>
    names.map((name, i) => ({ rowNumber: i + 1, name, northing: null, easting: null, elevation: null, description: null, raw: [] }));

  it('matches case- and whitespace-insensitively, ignoring nameless rows', () => {
    const m = matchedRowNames(rows(['BM01', 'cp02', null, 'NOPE']), ['bm01', ' CP02 ', 'other']);
    expect(m.has('BM01')).toBe(true);   // case-insensitive
    expect(m.has('cp02')).toBe(true);   // known name had surrounding spaces
    expect(m.has('NOPE')).toBe(false);  // not in the known list
    expect(m.size).toBe(2);
  });
});

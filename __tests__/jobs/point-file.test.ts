// __tests__/jobs/point-file.test.ts — reading what a data collector actually exports.
//
// The files in here are written the way real ones are: no header, trailing blank line, a comment
// at the top from whoever exported it, a description with a slash in it, a point called "CP1".
// A parser tested only against tidy input is a parser that fails on the first real file.

import { describe, it, expect } from 'vitest';
import {
  parsePointFile, detectDelimiter, readHeader, readNumber, looksLikeDegrees,
  delimiterName, DEFAULT_COLUMNS, MAX_POINTS,
} from '@/lib/jobs/point-file';

/** The overwhelmingly common case: P,N,E,Z,D and no header. */
const PNEZD = [
  '1,10241883.21,3122904.77,712.44,FND 1/2" IR',
  '2,10241902.55,3122888.10,711.98,SET 5/8 IR W/CAP',
  '3,10241955.02,3122871.43,713.10,FENCE COR',
].join('\n');

describe('the ordinary file', () => {
  it('reads P,N,E,Z,D with no header', () => {
    const r = parsePointFile(PNEZD);
    expect(r.points).toHaveLength(3);
    expect(r.skipped).toHaveLength(0);
    expect(r.hadHeader).toBe(false);
    expect(r.columnsFrom).toBe('convention');
    expect(r.columns).toEqual(DEFAULT_COLUMNS);

    expect(r.points[0]).toMatchObject({
      name: '1', northing: 10241883.21, easting: 3122904.77, elevation: 712.44,
      description: 'FND 1/2" IR', line: 1,
    });
  });

  it('keeps the point NAME as text', () => {
    // "CP1", "1A" and "101" are all legitimate point names. Coercing to a number loses two of them.
    const r = parsePointFile('CP1,10241883.21,3122904.77,712.44,CONTROL\n1A,10241902.55,3122888.10,,');
    expect(r.points.map((p) => p.name)).toEqual(['CP1', '1A']);
  });

  it('survives the mess a real export carries', () => {
    const messy = [
      '# exported from TSC5 2026-09-14',
      '',
      '1,10241883.21,3122904.77,712.44,FND 1/2" IR',
      '   ',
      '2,10241902.55,3122888.10,711.98,SET 5/8 IR W/CAP',
      '',
    ].join('\n');
    const r = parsePointFile(messy);
    expect(r.points).toHaveLength(2);
    expect(r.skipped).toHaveLength(0);
  });

  it('strips a BOM so the first cell is not invisible', () => {
    // Excel writes one, and it makes "Point" not match "Point".
    const r = parsePointFile('﻿Point,Northing,Easting\n1,10241883.21,3122904.77');
    expect(r.hadHeader).toBe(true);
    expect(r.points).toHaveLength(1);
  });
});

describe('the delimiter is detected, not assumed', () => {
  it.each([
    ['comma', ','],
    ['tab', '\t'],
    ['semicolon', ';'],
    ['pipe', '|'],
  ])('%s', (_name, d) => {
    const text = [
      ['1', '10241883.21', '3122904.77', '712.44', 'IR'].join(d),
      ['2', '10241902.55', '3122888.10', '711.98', 'IR'].join(d),
    ].join('\n');
    const r = parsePointFile(text);
    expect(r.delimiter).toBe(d);
    expect(r.points).toHaveLength(2);
  });

  it('falls back to whitespace for an aligned file with no punctuation', () => {
    const r = parsePointFile('1   10241883.21   3122904.77   712.44   IR\n2   10241902.55   3122888.10   711.98   IR');
    expect(r.delimiter).toBe(' ');
    expect(r.points).toHaveLength(2);
    expect(r.points[0]!.northing).toBe(10241883.21);
  });

  it('is not fooled by commas INSIDE a description when tabs separate the fields', () => {
    // The consistency-scoring case: commas appear, but erratically; tabs appear exactly four times
    // on every line.
    const text = [
      '1\t10241883.21\t3122904.77\t712.44\tFND IR, BENT',
      '2\t10241902.55\t3122888.10\t711.98\tSET IR',
      '3\t10241955.02\t3122871.43\t713.10\tCOR, FENCE, OLD',
    ].join('\n');
    const r = parsePointFile(text);
    expect(r.delimiter).toBe('\t');
    expect(r.points[0]!.description).toBe('FND IR, BENT');
  });

  it('names the delimiter in words, because "," on screen says nothing', () => {
    expect(delimiterName(',')).toBe('comma');
    expect(delimiterName('\t')).toBe('tab');
    expect(delimiterName(' ')).toBe('spaces');
  });

  it('an empty file does not throw', () => {
    const r = parsePointFile('');
    expect(r.points).toEqual([]);
    expect(r.totalLines).toBe(0);
  });
});

describe('a header is read when there is one', () => {
  it('maps columns by name, in any order', () => {
    const text = [
      'Easting,Northing,Point,Description,Elevation',
      '3122904.77,10241883.21,1,FND IR,712.44',
    ].join('\n');
    const r = parsePointFile(text);
    expect(r.hadHeader).toBe(true);
    expect(r.columnsFrom).toBe('header');
    expect(r.points[0]).toMatchObject({
      name: '1', northing: 10241883.21, easting: 3122904.77, elevation: 712.44, description: 'FND IR',
    });
  });

  it('accepts the short forms a collector writes', () => {
    const map = readHeader(['P', 'N', 'E', 'Z', 'D']);
    expect(map).toEqual({ name: 0, northing: 1, easting: 2, elevation: 3, description: 4 });
  });

  it('refuses a row that is actually data', () => {
    // "1,2,3" could be read as column indices. It is a point.
    expect(readHeader(['1', '2', '3'])).toBeNull();
  });

  it('refuses a row of words it does not recognise', () => {
    expect(readHeader(['Alpha', 'Bravo', 'Charlie'])).toBeNull();
  });

  it('refuses a header with no northing or easting', () => {
    // Finding only "Description" and "Point" tells us nothing we can place on a map, and is more
    // likely a stray line of text than a schema.
    expect(readHeader(['Point', 'Description'])).toBeNull();
  });

  it('does not treat a page break halfway down as a second header', () => {
    const text = [
      'Point,Northing,Easting',
      '1,10241883.21,3122904.77',
      'Point,Northing,Easting',
      '2,10241902.55,3122888.10',
    ].join('\n');
    const r = parsePointFile(text);
    // The repeated header is skipped as unreadable data, not consumed as a schema.
    expect(r.points).toHaveLength(2);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.line).toBe(3);
  });

  it('the first match per column wins, so "Northing" is not overwritten by a later "N"', () => {
    const map = readHeader(['Northing', 'Easting', 'N']);
    expect(map!.northing).toBe(0);
  });
});

describe('numbers', () => {
  it.each([
    ['plain', '10241883.21', 10241883.21],
    ['negative', '-12.5', -12.5],
    ['leading dot', '.75', 0.75],
    ['thousands separators', '10,241,883.21', 10241883.21],
    ['padded', '  712.44  ', 712.44],
    ['quoted', '"712.44"', 712.44],
  ])('%s', (_l, raw, want) => {
    expect(readNumber(raw)).toBe(want);
  });

  it.each([
    ['empty', ''],
    ['missing', undefined],
    ['text', 'FND IR'],
    ['two numbers', '1 2'],
    ['a stray decimal comma', '1,5'],
  ])('%s is null', (_l, raw) => {
    expect(readNumber(raw as string | undefined)).toBeNull();
  });

  it('refuses a decimal comma rather than guessing', () => {
    // In a comma-delimited file "1,5" is two fields. Reading it as 1.5 would silently halve a
    // coordinate, which is the kind of wrong that looks right.
    expect(readNumber('1,5')).toBeNull();
    // But a genuine thousands grouping is unambiguous and is handled.
    expect(readNumber('1,500')).toBe(1500);
  });
});

describe('bad rows are skipped and REPORTED, never dropped quietly', () => {
  it('says which line and why', () => {
    const text = [
      '1,10241883.21,3122904.77,712.44,IR',
      '2,NORTH,3122888.10,711.98,IR',
      '3,10241955.02,,713.10,IR',
      'total: 3 points',
    ].join('\n');
    const r = parsePointFile(text);
    expect(r.points).toHaveLength(1);
    expect(r.skipped).toHaveLength(3);
    expect(r.skipped[0]).toMatchObject({ line: 2, why: 'the northing is not a number' });
    expect(r.skipped[1]).toMatchObject({ line: 3, why: 'the easting is not a number' });
    expect(r.skipped[2]!.why).toBe('no northing or easting could be read');
  });

  it('counts every data line it considered, skipped ones included', () => {
    const r = parsePointFile('1,1000,2000,,\nbad line here\n2,1001,2001,,');
    expect(r.totalLines).toBe(3);
    expect(r.points.length + r.skipped.length).toBe(3);
  });

  it('caps a runaway file instead of trying to make two million points', () => {
    const many = Array.from({ length: 30 }, (_, i) => `${i},${1000 + i},${2000 + i},,`).join('\n');
    const r = parsePointFile(many, { maxPoints: 10 });
    expect(r.points).toHaveLength(10);
    expect(r.skipped).toHaveLength(20);
    expect(r.skipped[0]!.why).toContain('limit');
  });

  it('has a default cap', () => {
    expect(MAX_POINTS).toBeGreaterThan(1000);
    expect(MAX_POINTS).toBeLessThanOrEqual(100_000);
  });
});

describe('a file with no Z column', () => {
  it('reads elevation as null rather than borrowing the description', () => {
    const r = parsePointFile('Point,Northing,Easting,Description\n1,10241883.21,3122904.77,FND IR');
    expect(r.points[0]!.elevation).toBeNull();
    expect(r.points[0]!.description).toBe('FND IR');
  });

  it('names an unnamed point by its position rather than leaving it blank', () => {
    const r = parsePointFile('Northing,Easting\n10241883.21,3122904.77\n10241902.55,3122888.10');
    expect(r.points.map((p) => p.name)).toEqual(['1', '2']);
  });
});

describe('degrees are recognised, because projecting them would be a disaster', () => {
  it('spots a lat/long file', () => {
    const r = parsePointFile('1,31.0982,-97.3428,712,IR\n2,31.0984,-97.3430,713,IR');
    expect(looksLikeDegrees(r.points)).toBe(true);
  });

  it('does not mistake state plane feet for degrees', () => {
    const r = parsePointFile(PNEZD);
    expect(looksLikeDegrees(r.points)).toBe(false);
  });

  it('requires EVERY point to be in range, not most', () => {
    // One state-plane row in a file of degrees means the file is not what it looks like, and the
    // safe answer is "do not treat this as degrees".
    const r = parsePointFile('1,31.0982,-97.3428,,\n2,10241883.21,3122904.77,,');
    expect(looksLikeDegrees(r.points)).toBe(false);
  });

  it('an empty list is not degrees', () => {
    expect(looksLikeDegrees([])).toBe(false);
  });
});

describe('the caller can override everything the detector decided', () => {
  it('honours a forced column map', () => {
    // What the dialog sends back after somebody notices N and E are the other way round.
    const swapped = { name: 0, northing: 2, easting: 1, elevation: 3, description: 4 };
    const r = parsePointFile(PNEZD, { columns: swapped });
    expect(r.columnsFrom).toBe('caller');
    expect(r.points[0]!.northing).toBe(3122904.77);
    expect(r.points[0]!.easting).toBe(10241883.21);
  });

  it('a forced column map means the header row is NOT consumed', () => {
    // Otherwise overriding columns on a file with a header would silently eat its first data row.
    const text = 'Point,Northing,Easting\n1,10241883.21,3122904.77';
    const r = parsePointFile(text, { columns: DEFAULT_COLUMNS });
    expect(r.hadHeader).toBe(false);
    expect(r.skipped).toHaveLength(1); // the header line, now unreadable as data
    expect(r.points).toHaveLength(1);
  });

  it('honours a forced delimiter', () => {
    const r = parsePointFile('1;1000;2000;;', { delimiter: ';' });
    expect(r.delimiter).toBe(';');
    expect(r.points).toHaveLength(1);
  });
});

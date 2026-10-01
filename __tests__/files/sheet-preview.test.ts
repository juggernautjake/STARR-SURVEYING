// Spreadsheets in the file viewer (owner, 2026-10-01): which files open as a grid, and the CSV parser.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { sheetFormat, parseDelimited, detectDelimiter, columnLetter, columnCount, SHEET_MAX_COLS } from '@/lib/files/sheet-preview';
import { fileKind } from '@/lib/files/viewer-model';

describe('sheetFormat', () => {
  it('recognises spreadsheets by name, whatever the upload type said', () => {
    expect(sheetFormat('points.csv', 'application/octet-stream')).toBe('csv');
    expect(sheetFormat('POINTS.CSV', null)).toBe('csv');
    expect(sheetFormat('export.tsv')).toBe('tsv');
    for (const n of ['budget.xlsx', 'old.xls', 'macro.xlsm', 'bin.xlsb', 'calc.ods']) expect(sheetFormat(n)).toBe('excel');
  });
  it('falls back to the type when the name has no extension', () => {
    expect(sheetFormat('download', 'text/csv')).toBe('csv');
    expect(sheetFormat('download', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('excel');
  });
  it('leaves everything else alone', () => {
    expect(sheetFormat('deed.pdf', 'application/pdf')).toBeNull();
    expect(sheetFormat('notes.txt', 'text/plain')).toBeNull();
    expect(sheetFormat(null)).toBeNull();
  });
  it('does not change fileKind, which also decides which folders accept an upload', () => {
    expect(fileKind('points.csv')).toBe('text');
  });
});

describe('parseDelimited', () => {
  it('parses a survey point file', () => {
    const { rows } = parseDelimited('P,N,E,Z,D\n1,10234.512,3045.118,612.40,IRF\n2,10250.001,3060.000,611.95,CP\n');
    expect(rows).toEqual([['P', 'N', 'E', 'Z', 'D'], ['1', '10234.512', '3045.118', '612.40', 'IRF'], ['2', '10250.001', '3060.000', '611.95', 'CP']]);
  });
  it('handles quotes, doubled quotes, delimiters and line breaks inside quotes', () => {
    const { rows } = parseDelimited('name,note\n"Smith, J.","He said ""hi""\nthen left"\n');
    expect(rows).toEqual([['name', 'note'], ['Smith, J.', 'He said "hi"\nthen left']]);
  });
  it('handles CRLF, CR, a byte-order mark, empty fields and no final newline', () => {
    expect(parseDelimited('﻿a,b\r\n1,\r\n,2').rows).toEqual([['a', 'b'], ['1', ''], ['', '2']]);
    expect(parseDelimited('a,b\r1,2').rows).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('stops at maxRows and says there was more', () => {
    const text = Array.from({ length: 50 }, (_, i) => `${i},x`).join('\n');
    const r = parseDelimited(text, { maxRows: 10 });
    expect(r.rows).toHaveLength(10);
    expect(r.truncated).toBe(true);
    expect(parseDelimited('a\nb\n', { maxRows: 2 }).truncated).toBe(false);
  });
  it('uses the delimiter it is given', () => {
    expect(parseDelimited('a\tb,c\n', { delimiter: '\t' }).rows).toEqual([['a', 'b,c']]);
  });
});

describe('detectDelimiter', () => {
  it('finds comma, tab, semicolon and pipe', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('a;b;c\n1,5;2,5;3')).toBe(';'); // European decimals
    expect(detectDelimiter('a|b\n1|2')).toBe('|');
  });
  it('ignores delimiters inside quotes', () => {
    expect(detectDelimiter('"a,b,c";d\n"x,y";z')).toBe(';');
  });
});

describe('grid helpers', () => {
  it('names columns like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });
  it('counts columns by the widest row and drops trailing empty ones', () => {
    expect(columnCount([['a', 'b'], ['1', '2', '3', '', '']])).toBe(3);
    expect(columnCount([['', '', '']])).toBe(0);
    expect(columnCount([Array.from({ length: 500 }, () => 'x')])).toBe(SHEET_MAX_COLS);
  });
});

describe('Excel through SheetJS, the way the preview reads it', () => {
  it('reads every sheet as displayed text, with the real row count when capped', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Point', 'Northing'], [1, 10234.512], [2, 10250]]), 'Points');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Array.from({ length: 30 }, (_, i) => [`row ${i + 1}`])), 'Long');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const read = XLSX.read(new Uint8Array(buf), { type: 'array', sheetRows: 10 });
    expect(read.SheetNames).toEqual(['Points', 'Long']);
    const pts = XLSX.utils.sheet_to_json<string[]>(read.Sheets.Points, { header: 1, raw: false, defval: '' });
    expect(pts[1]).toEqual(['1', '10234.512']);
    const long = read.Sheets.Long;
    expect(XLSX.utils.sheet_to_json(long, { header: 1 })).toHaveLength(10);
    expect(XLSX.utils.decode_range(long['!fullref'] as string).e.r + 1).toBe(30);
  });
});

describe('wiring', () => {
  it('the viewer opens spreadsheets with SheetPreview, and SheetJS is loaded only on demand', () => {
    const viewer = fs.readFileSync(path.join(process.cwd(), 'app/admin/components/files/FileViewer.tsx'), 'utf8');
    expect(viewer).toContain('<SheetPreview url={file.url} format={sheet} />');
    const preview = fs.readFileSync(path.join(process.cwd(), 'app/admin/components/files/SheetPreview.tsx'), 'utf8');
    expect(preview).toContain("await import('xlsx')");
    expect(preview).not.toMatch(/^import .* from 'xlsx'/m);
  });
});

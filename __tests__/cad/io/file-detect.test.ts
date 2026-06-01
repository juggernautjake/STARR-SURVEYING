// __tests__/cad/io/file-detect.test.ts
//
// cad-trv-import-export-deep-semantic Pass 8 — file-format sniff
// + structured load-error diagnostics.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  detectFileFormat,
  buildFileLoadDiagnostic,
  formatFileLoadDiagnostic,
} from '@/lib/cad/io/file-detect';

describe('detectFileFormat — extension hints', () => {
  it('routes .starr → STARR', () => {
    expect(detectFileFormat('survey.starr', '{}')).toBe('STARR');
    expect(detectFileFormat('Survey.STARR', '{}')).toBe('STARR');
  });

  it('routes .TRV / .trv → TRV', () => {
    expect(detectFileFormat('survey.TRV', '')).toBe('TRV');
    expect(detectFileFormat('survey.trv', '')).toBe('TRV');
  });
});

describe('detectFileFormat — content sniff (no extension hint)', () => {
  it('content starting with `#,TRAVERSE PC` is TRV', () => {
    expect(detectFileFormat('survey.txt', '#,TRAVERSE PC\r\n999,begin')).toBe('TRV');
  });

  it('content starting with `999,begin` is TRV', () => {
    expect(detectFileFormat('export.dat', '999,begin\r\n80,26.000')).toBe('TRV');
  });

  it('content starting with `{` is STARR (JSON)', () => {
    expect(detectFileFormat('drawing.json', '{ "document": {} }')).toBe('STARR');
  });

  it('anything else is UNKNOWN', () => {
    expect(detectFileFormat('mystery.txt', 'random text content')).toBe('UNKNOWN');
  });
});

describe('buildFileLoadDiagnostic', () => {
  it('captures filename + byteSize + detectedFormat + error + stage', () => {
    const d = buildFileLoadDiagnostic(
      'survey.TRV',
      '#,TRAVERSE PC\r\n999,begin\r\n',
      new Error('Unexpected token \'#\''),
      'parse',
    );
    expect(d.filename).toBe('survey.TRV');
    expect(d.byteSize).toBe('#,TRAVERSE PC\r\n999,begin\r\n'.length);
    expect(d.detectedFormat).toBe('TRV');
    expect(d.errorMessage).toContain('Unexpected token');
    expect(d.stage).toBe('parse');
  });

  it('hints the user to use Import TRV when a JSON parse error fires on TRV content', () => {
    const d = buildFileLoadDiagnostic(
      'survey.TRV',
      '#,TRAVERSE PC\r\n',
      new Error('Unexpected token \'#\', "#,TRAVERSE"... is not valid JSON'),
      'parse',
    );
    expect(d.hint).toContain('Import Traverse PC');
  });

  it('hints "doesn\'t look like .starr or .TRV" for unknown content', () => {
    const d = buildFileLoadDiagnostic(
      'mystery.txt',
      'random stuff',
      new Error('Unexpected token \'r\''),
      'parse',
    );
    expect(d.hint).toContain('doesn\'t look like');
  });

  it('preserves up to 5 parser errors in `parseErrors`', () => {
    const d = buildFileLoadDiagnostic(
      'broken.TRV',
      '999,begin',
      new Error('Parse failed'),
      'parse',
      [{ lineIndex: 0, message: 'a' }, { lineIndex: 1, message: 'b' }],
    );
    expect(d.parseErrors.length).toBe(2);
  });

  it('takes the first 200 chars of the file as preview + strips CR', () => {
    const d = buildFileLoadDiagnostic(
      'x.starr',
      '\r\n'.repeat(100) + 'rest',
      new Error('x'),
      'parse',
    );
    expect(d.preview.length).toBeLessThanOrEqual(200);
    expect(d.preview).not.toContain('\r');
  });
});

describe('formatFileLoadDiagnostic — multi-line report', () => {
  it('includes every field + parser-error block + hint', () => {
    const d = buildFileLoadDiagnostic(
      'survey.TRV',
      '#,TRAVERSE PC\r\n999,begin\r\n',
      new Error('JSON parse error: Unexpected token #'),
      'parse',
      [{ lineIndex: 0, message: 'malformed line' }],
    );
    const text = formatFileLoadDiagnostic(d);
    expect(text).toContain('Failed to load file');
    expect(text).toContain('File: survey.TRV');
    expect(text).toContain('Detected format: TRV');
    expect(text).toContain('Stage: parse');
    expect(text).toContain('Error:');
    expect(text).toContain('Parser errors');
    expect(text).toContain('Line 1: malformed line');
    expect(text).toContain('First 200 chars');
    expect(text).toContain('Hint:');
    expect(text).toContain('Import Traverse PC');
  });
});

describe('MenuBar — Pass 8 open-dialog routing + diagnostics', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
    'utf8',
  );

  it('Open… file picker now accepts .starr,.TRV,.trv', () => {
    expect(SRC).toMatch(/accept: '\.starr,\.TRV,\.trv'/);
  });

  it('imports detectFileFormat + buildFileLoadDiagnostic + formatFileLoadDiagnostic', () => {
    // Slice 2 added `type FileLoadDiagnostic` to the same import
    // so the modal can render it — assert each named import is
    // present without locking the exact ordering / trailing items.
    expect(SRC).toMatch(/import \{[^}]*\bdetectFileFormat\b[^}]*\} from '@\/lib\/cad\/io\/file-detect';/);
    expect(SRC).toMatch(/import \{[^}]*\bbuildFileLoadDiagnostic\b[^}]*\} from '@\/lib\/cad\/io\/file-detect';/);
    expect(SRC).toMatch(/import \{[^}]*\bformatFileLoadDiagnostic\b[^}]*\} from '@\/lib\/cad\/io\/file-detect';/);
  });

  it('sniffs the file format + routes TRV through importTrvFromText', () => {
    expect(SRC).toMatch(/const format = detectFileFormat\(file\.name, text\);/);
    expect(SRC).toMatch(/if \(format === 'TRV'\)/);
    // cad-trv-dual-layer-filename Slice 1 — the file name is threaded
    // through so the imported layers are named after the FILE.
    expect(SRC).toMatch(/importTrvFromText\(text, \{ fileName: file\.name \}\)/);
  });

  it('every failure path goes through buildFileLoadDiagnostic + formatFileLoadDiagnostic', () => {
    // sniff / parse / map / apply stages each pass a stage name.
    expect(SRC).toMatch(/buildFileLoadDiagnostic\([\s\S]*?'sniff'\)/);
    expect(SRC).toMatch(/buildFileLoadDiagnostic\([\s\S]*?'parse'\)/);
    expect(SRC).toMatch(/buildFileLoadDiagnostic\([\s\S]*?'map'\)/);
    expect(SRC).toMatch(/buildFileLoadDiagnostic\([\s\S]*?'apply'\)/);
  });
});

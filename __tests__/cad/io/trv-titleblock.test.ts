// __tests__/cad/io/trv-titleblock.test.ts
//
// cad-trv-import-export-deep-semantic Pass 6 — apply TRV project
// metadata to the survey title block (non-destructive).

import { describe, it, expect } from 'vitest';
import { applyTrvMetadataToTitleBlock, formatTrvDate, formatTrvScale } from '@/lib/cad/io/trv-titleblock';
import { DEFAULT_DRAWING_SETTINGS } from '@/lib/cad/constants';
import type { TitleBlockConfig } from '@/lib/cad/types';

const baseBlock = (): TitleBlockConfig => ({ ...DEFAULT_DRAWING_SETTINGS.titleBlock });

const metaEmpty = { sourcePath: null, projectName: null, surveyDate: null, scale: null, units: null, raw105: null, pointCount: null };

describe('formatTrvDate', () => {
  it('converts DD-MM-YYYY → YYYY-MM-DD', () => {
    expect(formatTrvDate('20-5-2026')).toBe('2026-05-20');
    expect(formatTrvDate('1-1-2026')).toBe('2026-01-01');
  });

  it('passes through anything that doesn\'t look like DD-MM-YYYY', () => {
    expect(formatTrvDate('May 20, 2026')).toBe('May 20, 2026');
    expect(formatTrvDate('2026-05-20')).toBe('2026-05-20');
  });
});

describe('formatTrvScale', () => {
  it('wraps a bare number into the 1" = N\' label form', () => {
    expect(formatTrvScale('1')).toBe('1" = 1\'');
    expect(formatTrvScale('50')).toBe('1" = 50\'');
    expect(formatTrvScale('100.5')).toBe('1" = 100.5\'');
  });

  it('passes through already-labeled scales', () => {
    expect(formatTrvScale('1" = 50\'')).toBe('1" = 50\'');
    expect(formatTrvScale('NTS')).toBe('NTS');
  });
});

describe('applyTrvMetadataToTitleBlock', () => {
  it('fills projectName when the title block is empty', () => {
    const next = applyTrvMetadataToTitleBlock(
      { ...metaEmpty, projectName: 'BACK CONCRETE SLAB' },
      baseBlock(),
    );
    expect(next.projectName).toBe('BACK CONCRETE SLAB');
  });

  it('does NOT overwrite an existing project name (non-destructive)', () => {
    const block = { ...baseBlock(), projectName: 'My Existing Project' };
    const next = applyTrvMetadataToTitleBlock(
      { ...metaEmpty, projectName: 'BACK CONCRETE SLAB' },
      block,
    );
    expect(next.projectName).toBe('My Existing Project');
  });

  it('reformats the survey date from DD-MM-YYYY to YYYY-MM-DD', () => {
    const next = applyTrvMetadataToTitleBlock(
      { ...metaEmpty, surveyDate: '20-5-2026' },
      baseBlock(),
    );
    expect(next.surveyDate).toBe('2026-05-20');
  });

  it('wraps a bare-number scale into the 1" = N\' label', () => {
    const next = applyTrvMetadataToTitleBlock(
      { ...metaEmpty, scale: '50' },
      baseBlock(),
    );
    expect(next.scaleLabel).toBe('1" = 50\'');
  });

  it('drops an "Imported from <path>" note when notes are empty + sourcePath is set', () => {
    const next = applyTrvMetadataToTitleBlock(
      { ...metaEmpty, sourcePath: 'C:\\Users\\example\\sample.doc' },
      baseBlock(),
    );
    expect(next.notes).toBe('Imported from C:\\Users\\example\\sample.doc');
  });

  it('returns a fresh object (no mutation of the input title block)', () => {
    const block = baseBlock();
    const next = applyTrvMetadataToTitleBlock(
      { ...metaEmpty, projectName: 'X' },
      block,
    );
    expect(next).not.toBe(block);
    expect(block.projectName).toBe(''); // unchanged
  });

  it('no-op when every metadata field is null', () => {
    const block = baseBlock();
    const next = applyTrvMetadataToTitleBlock(metaEmpty, block);
    expect(next).toEqual(block);
  });
});

describe('importTrvFromText — exposes metadata for the title-block apply step', () => {
  it('the report carries the TrvMetadata so the UI can preview/apply it', async () => {
    const { importTrvFromText } = await import('@/lib/cad/io/trv-io');
    const fixture = [
      '999,begin',
      '101,MY PROJECT',
      '102,20-5-2026',
      '103,50',
      '999,end',
    ].join('\r\n');
    const r = importTrvFromText(fixture);
    expect(r.metadata.projectName).toBe('MY PROJECT');
    expect(r.metadata.surveyDate).toBe('20-5-2026');
    expect(r.metadata.scale).toBe('50');
  });
});

describe('MenuBar — Pass 6 title-block apply prompt', () => {
  it('imports applyTrvMetadataToTitleBlock + prompts after the import confirm', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const SRC = fs.readFileSync(
      path.join(process.cwd(), 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
      'utf8',
    );
    expect(SRC).toMatch(/import \{ applyTrvMetadataToTitleBlock \} from '@\/lib\/cad\/io\/trv-titleblock';/);
    expect(SRC).toMatch(/applyTrvMetadataToTitleBlock\(m, current\)/);
    expect(SRC).toMatch(/drawingStore\.updateSettings\(\{ titleBlock: nextTitleBlock \}\)/);
  });
});

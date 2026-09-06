import { describe, it, expect } from 'vitest';
import { linesToSupplemental, type SupplementalLine } from '@/app/admin/research/components/SupplementalInfoFields';

// Plan H2 — the "+ Add more info" category picker folds its lines into the structured supplemental
// info the run consumes; empty lines are dropped, and each category maps to its own list.

describe('linesToSupplemental', () => {
  it('maps each category to its list and drops empty lines', () => {
    const lines: SupplementalLine[] = [
      { key: '1', category: 'name', name: 'George W. Ferrell' },
      { key: '2', category: 'name', name: '  ' },                       // empty → dropped
      { key: '3', category: 'instrument', instrument: '2020-1234' },
      { key: '4', category: 'volume_page', volume: '5456', page: '704' },
      { key: '5', category: 'cabinet_slide', cabinet: 'A', slide: '166-APR' },
      { key: '6', category: 'volume_page', volume: '', page: '' },       // empty → dropped
    ];
    const s = linesToSupplemental(lines);
    expect(s.ownerNames).toEqual(['George W. Ferrell']);
    expect(s.instrumentNumbers).toEqual(['2020-1234']);
    expect(s.volumePages).toEqual([{ volume: '5456', page: '704' }]);
    expect(s.cabinetSlides).toEqual([{ cabinet: 'A', slide: '166-APR' }]);
  });

  it('keeps a volume/page line with only one side filled (grain of salt — never rejected)', () => {
    const s = linesToSupplemental([{ key: '1', category: 'volume_page', volume: '5456', page: '' }]);
    expect(s.volumePages).toEqual([{ volume: '5456', page: '' }]);
  });

  it('supports many lines of the same category', () => {
    const s = linesToSupplemental([
      { key: '1', category: 'name', name: 'Evers' },
      { key: '2', category: 'name', name: 'Ferrell' },
    ]);
    expect(s.ownerNames).toEqual(['Evers', 'Ferrell']);
  });
});

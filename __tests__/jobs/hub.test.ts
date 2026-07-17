import { describe, it, expect } from 'vitest';
import { jobLabel, groupFilesBySection } from '@/lib/jobs/hub';

// Work Mode field hub display derivations (B2 picker/header, A3 files panel). Pure.
describe('jobLabel', () => {
  it('joins job_number · name, dropping whichever is blank', () => {
    expect(jobLabel({ job_number: 'J-100', name: 'Boundary Survey' })).toBe('J-100 · Boundary Survey');
    expect(jobLabel({ job_number: 'J-100', name: null })).toBe('J-100');
    expect(jobLabel({ job_number: '', name: 'Topo' })).toBe('Topo');
  });
  it('falls back to the id (then empty) so a picker option is never blank', () => {
    expect(jobLabel({ job_number: null, name: null }, 'abc-123')).toBe('abc-123');
    expect(jobLabel({})).toBe('');
  });
});

describe('groupFilesBySection', () => {
  const F = (id: string, section?: string | null) => ({ id, section });
  it('groups by section, title-cased, general when blank, first-seen order preserved', () => {
    const out = groupFilesBySection([
      F('a', 'research'), F('b', 'site photos'), F('c', 'research'), F('d', null),
    ]);
    expect(out.map(([sec, list]) => [sec, list.map((f) => f.id)])).toEqual([
      ['Research', ['a', 'c']],
      ['Site Photos', ['b']],
      ['General', ['d']], // blank → General
    ]);
  });
  it('is empty for no files', () => {
    expect(groupFilesBySection([])).toEqual([]);
  });
});

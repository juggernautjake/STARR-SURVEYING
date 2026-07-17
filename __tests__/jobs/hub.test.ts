import { describe, it, expect } from 'vitest';
import { jobLabel, groupFilesBySection, mediaDisplay } from '@/lib/jobs/hub';

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
  it('groups the same section case-INSENSITIVELY (no fragmentation across file sources)', () => {
    // "general", "General" and "GENERAL" (e.g. one from file_nodes, one from a mnt: mount) must be ONE
    // group, not three — otherwise the panel shows the same section repeated with different casing.
    const out = groupFilesBySection([F('a', 'general'), F('b', 'GENERAL'), F('c', 'General')]);
    expect(out.map(([sec, list]) => [sec, list.map((f) => f.id)])).toEqual([['General', ['a', 'b', 'c']]]);
  });
  it('preserves an acronym in the display label (would be mangled by a blanket lowercase)', () => {
    const out = groupFilesBySection([F('a', 'USGS data')]);
    expect(out[0][0]).toBe('USGS Data'); // not "Usgs Data"
  });
});

describe('mediaDisplay', () => {
  it('thumb prefers the thumbnail, link prefers the original (each falls back to storage)', () => {
    const d = mediaDisplay({ media_type: 'photo', thumbnail_signed_url: 't', original_signed_url: 'o', storage_signed_url: 's' });
    expect(d.thumbUrl).toBe('t');
    expect(d.openUrl).toBe('o');
    expect(d.showImage).toBe(true);
  });
  it('falls back to the storage url when the preferred one is missing', () => {
    const d = mediaDisplay({ media_type: 'photo', storage_signed_url: 's' });
    expect(d.thumbUrl).toBe('s');
    expect(d.openUrl).toBe('s');
  });
  it('shows the image only for a photo WITH a thumb; a thumbless photo gets the doc icon', () => {
    expect(mediaDisplay({ media_type: 'photo' }).showImage).toBe(false); // no url → icon
    expect(mediaDisplay({ media_type: undefined, storage_signed_url: 's' }).showImage).toBe(true); // untyped ≈ photo
  });
  it('picks the right kind glyph for non-photos', () => {
    expect(mediaDisplay({ media_type: 'video', storage_signed_url: 's' })).toMatchObject({ showImage: false, icon: '🎬' });
    expect(mediaDisplay({ media_type: 'voice', storage_signed_url: 's' })).toMatchObject({ showImage: false, icon: '🎙' });
    expect(mediaDisplay({ media_type: 'doc', storage_signed_url: 's' }).icon).toBe('📄');
  });
});

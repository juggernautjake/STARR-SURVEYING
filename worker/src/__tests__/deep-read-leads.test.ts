import { describe, it, expect, vi } from 'vitest';
import { parseDeepReadExtract, extractToLeads, deepReadForLeads } from '../research/deep-read-leads.js';

// Plan 4 — the user-initiated AI deep-read: one bounded AI pass over the captured text pulls identifiers
// the structured parse missed, compiled into follow-up leads. The AI call is injected, so shaping is tested
// without a network.

describe('parseDeepReadExtract', () => {
  it('reads JSON, tolerating code fences and prose around it', () => {
    const out = parseDeepReadExtract('Here you go:\n```json\n{"subdivisions":["WINNIE MAE ADDITION"],"references":[{"volume":"412","page":"88"},{"instrument":"2015-1"}],"priorOwners":["SMITH, JOHN"]}\n```');
    expect(out.subdivisions).toEqual(['WINNIE MAE ADDITION']);
    expect(out.references).toEqual([{ volume: '412', page: '88', instrument: undefined }, { volume: undefined, page: undefined, instrument: '2015-1' }]);
    expect(out.priorOwners).toEqual(['SMITH, JOHN']);
  });
  it('returns empty on unparseable output rather than throwing', () => {
    expect(parseDeepReadExtract('the model refused')).toEqual({});
    expect(parseDeepReadExtract('')).toEqual({});
  });
});

describe('extractToLeads', () => {
  it('maps subdivisions, surveys, references and owners to leads', () => {
    const leads = extractToLeads({
      subdivisions: ['WINNIE MAE ADDITION'],
      surveys: ['WILLIAM HARTRICK SURVEY'],
      references: [{ volume: '412', page: '88' }, { instrument: '2015-014567' }],
      priorOwners: ['SMITH, JOHN'],
    }, 2);
    expect(leads.some((l) => l.kind === 'subdivision' && l.value === 'WINNIE MAE ADDITION')).toBe(true);
    expect(leads.some((l) => l.kind === 'subdivision' && l.value === 'WILLIAM HARTRICK SURVEY')).toBe(true);
    expect(leads.some((l) => l.kind === 'volume_page' && l.volume === '412')).toBe(true);
    expect(leads.some((l) => l.kind === 'instrument')).toBe(true);
    expect(leads.some((l) => l.kind === 'grantor_name' && l.value === 'SMITH, JOHN')).toBe(true);
    expect(leads.every((l) => l.round === 2)).toBe(true);
  });
  it('excludes what was already searched', () => {
    const leads = extractToLeads({ subdivisions: ['HERITAGE'] }, 1, { subdivisions: ['HERITAGE'] });
    expect(leads).toHaveLength(0);
  });
});

describe('deepReadForLeads', () => {
  it('runs the injected AI call and returns compiled leads', async () => {
    const callAi = vi.fn(async () => '{"references":[{"volume":"5456","page":"704"}]}');
    const leads = await deepReadForLeads({ documentText: 'Being Lot 5 ... see Volume 5456 Page 704 ...', round: 1, callAi });
    expect(callAi).toHaveBeenCalledOnce();
    expect(leads.some((l) => l.kind === 'volume_page' && l.volume === '5456')).toBe(true);
  });
  it('is a no-op on empty text (no AI spend for nothing)', async () => {
    const callAi = vi.fn(async () => '{}');
    expect(await deepReadForLeads({ documentText: '   ', round: 1, callAi })).toEqual([]);
    expect(callAi).not.toHaveBeenCalled();
  });
  it('never throws when the AI call fails', async () => {
    const callAi = vi.fn(async () => { throw new Error('rate limit'); });
    expect(await deepReadForLeads({ documentText: 'some deed text', round: 1, callAi })).toEqual([]);
  });
});

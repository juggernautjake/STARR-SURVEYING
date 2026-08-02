// The neighbours, written down (research plan R31).
//
// `AdjacentResearchOrchestrator` already identifies the neighbours, searches for their deeds and
// plats, and writes a cross-validation report to `/tmp/analysis/<project>/`. That file is wiped with
// the container, invisible to the app, and one blob rather than a row per neighbour — so a reviewer
// could not list them, could not see which had recent surveys on file, and could not ask for one to
// be researched properly.
//
// The survey date is the field the owner asked for, and getting it wrong in the generous direction
// destroys the whole signal.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  describePersist,
  newestSurvey,
  persistAdjoiners,
  toRecords,
  type AdjoinerInput,
} from '../infra/adjoiner-persistence.js';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const input = (over: Partial<AdjoinerInput> = {}): AdjoinerInput => ({
  owner: 'SMITH, JOHN',
  identifiedBy: 'deed_call',
  documents: [],
  ...over,
});

describe('a deed is not a survey', () => {
  it('ignores deeds when dating the last survey', () => {
    // A deed describes a boundary somebody else measured, often decades earlier and often copied
    // forward without re-measurement. Counting it would make every neighbour look recently surveyed
    // and destroy the signal the owner asked for.
    const s = newestSurvey([
      { type: 'warranty deed', date: '2024-01-01' },
      { type: 'deed of trust', date: '2025-06-01' },
    ]);
    expect(s.date).toBeNull();
    expect(s.source).toBeNull();
  });

  it('counts plats, replats and surveys', () => {
    expect(newestSurvey([{ type: 'plat', date: '2019-05-02' }]).date).toBe('2019-05-02');
    expect(newestSurvey([{ type: 'Replat', date: '2019-05-02' }]).date).toBe('2019-05-02');
    expect(newestSurvey([{ type: 'boundary survey', date: '2019-05-02' }]).date).toBe('2019-05-02');
  });

  it('takes the newest when there are several', () => {
    const s = newestSurvey([
      { type: 'plat', date: '1998-09-15', instrumentNumber: 'OLD' },
      { type: 'survey', date: '2023-04-01', instrumentNumber: 'NEW' },
    ]);
    expect(s.date).toBe('2023-04-01');
    expect(s.source).toContain('NEW');
  });

  it('ignores a document with an unparseable date rather than guessing', () => {
    expect(newestSurvey([{ type: 'plat', date: 'undated' }]).date).toBeNull();
  });
});

describe('the rows', () => {
  it('records a neighbour with no name rather than dropping it', () => {
    // The parcel id is how you find it later, and dropping it silently shrinks the list a reviewer
    // is choosing from.
    const [r] = toRecords('p1', [input({ owner: '', parcelId: 'R99' })]);
    expect(r!.owner_name).toBeNull();
    expect(r!.parcel_id).toBe('R99');
  });

  it('counts documents found and carries the survey date', () => {
    const [r] = toRecords('p1', [input({
      documents: [
        { type: 'warranty deed', date: '2020-01-01' },
        { type: 'plat', date: '2018-01-01' },
      ],
    })]);
    expect(r!.documents_found).toBe(2);
    expect(r!.last_survey_date).toBe('2018-01-01');
  });

  it('says when an empty document list is a retrieval gap, not a fact about the neighbour', () => {
    const [r] = toRecords('p1', [input({ researchStatus: 'not_found' })]);
    expect(r!.notes).toContain('may be a retrieval gap');
  });

  it('adds no note when the shallow pass completed cleanly', () => {
    expect(toRecords('p1', [input({ researchStatus: 'complete' })])[0]!.notes).toBeNull();
  });
});

describe('persisting', () => {
  it('upserts so a re-run updates rather than duplicates', async () => {
    const upsert = vi.fn(async (_rows: unknown[], _opts: { onConflict: string }) => ({ error: null }));
    const db = { from: () => ({ upsert }) };
    const res = await persistAdjoiners(db, 'p1', [input()]);
    expect(res.written).toBe(1);
    expect(upsert.mock.calls[0]![1]).toEqual({
      onConflict: 'research_project_id,parcel_id,owner_name,identified_by',
    });
  });

  it('does not overwrite a reviewer’s decision to research a neighbour', () => {
    // Losing that would silently discard a queued run somebody paid for.
    const src = read('src/infra/adjoiner-persistence.ts');
    const records = src.slice(src.indexOf('export function toRecords'), src.indexOf('export interface PersistResult'));
    for (const col of ['depth', 'deep_request_id', 'requested_by', 'deep_project_id']) {
      expect(records).not.toContain(`${col}:`);
    }
  });

  it('writes nothing rather than an empty upsert', async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const res = await persistAdjoiners({ from: () => ({ upsert }) }, 'p1', []);
    expect(res.written).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('reports a write failure rather than claiming success', async () => {
    const db = { from: () => ({ upsert: async () => ({ error: { message: 'permission denied' } }) }) };
    const res = await persistAdjoiners(db, 'p1', [input()]);
    expect(res.written).toBe(0);
    expect(res.errors).toEqual(['permission denied']);
  });
});

describe('the run log says what happened', () => {
  it('calls an empty register a gap in the run, not a finding', () => {
    expect(describePersist({ written: 0, errors: [] }, []))
      .toContain('a gap in this run, not a finding about the property');
  });

  it('names how many have a survey on file', () => {
    const inputs = [
      input({ documents: [{ type: 'plat', date: '2020-01-01' }] }),
      input({ owner: 'JONES', documents: [] }),
    ];
    expect(describePersist({ written: 2, errors: [] }, inputs)).toContain('1 with a survey or plat on file');
  });

  it('does not report a failed write as a success', () => {
    expect(describePersist({ written: 0, errors: ['boom'] }, [input()])).toContain('Could not write');
  });
});

describe('the wiring', () => {
  const index = read('src/index.ts');

  it('persists at the end of the adjacent phase', () => {
    expect(index).toContain('persistAdjoiners(supabase, projectId, inputs)');
    expect(index).toContain('describePersist(result, inputs)');
  });

  it('cannot turn a completed adjacent phase into a failed one', () => {
    // Bookkeeping on data already gathered must not fail the run.
    const block = index.slice(index.indexOf('Write the neighbour register'));
    expect(block.slice(0, 1400)).toContain('try {');
    expect(block.slice(0, 1400)).toContain('catch (e)');
  });
});

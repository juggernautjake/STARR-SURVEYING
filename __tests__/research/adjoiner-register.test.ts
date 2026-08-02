// The neighbours, ranked by what they are worth (research plan R31–R33).
//
// `AdjacentResearchOrchestrator` already runs inside the pipeline and writes a cross-validation
// report to `/tmp`. That file is wiped with the container, invisible to the app, and one blob rather
// than a row per neighbour — so a reviewer could not list the neighbours, could not see which had
// recent surveys on file, and could not ask for one to be researched properly.
//
// The owner's reasoning, which the ranking encodes: a neighbour with a recent survey on file is
// likely to yield better and more current information, because a survey is a professional's measured
// opinion of a line this property shares.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  IDENTIFIED_BY_MEANING,
  rankAdjoiners,
  summariseAdjoiners,
  surveyRecency,
  type AdjoinerRow,
} from '@/lib/research/adjoiner-register';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const TODAY = new Date('2026-08-02T00:00:00.000Z');

const adj = (over: Partial<AdjoinerRow> = {}): AdjoinerRow => ({
  id: 'a1',
  parcel_id: 'R12345',
  owner_name: 'SMITH, JOHN',
  situs_address: '125 FM 436',
  acreage: 12.5,
  identified_by: 'gis_adjacency',
  adjoins_where: 'north line',
  match_confidence: 0.9,
  documents_found: 0,
  last_survey_date: null,
  last_survey_source: null,
  notes: null,
  depth: 'shallow',
  deep_request_id: null,
  deep_project_id: null,
  requested_by: null,
  requested_at: null,
  ...over,
});

describe('survey recency — the field the owner asked for', () => {
  it('never reports "no survey found" as "never surveyed"', () => {
    // Two different answers, and only one of them is a finding.
    const r = surveyRecency(null, TODAY);
    expect(r.band).toBe('unknown');
    expect(r.detail).toContain('not evidence that none exists');
  });

  it('treats a survey within ten years as recent, and says why that matters', () => {
    const r = surveyRecency('2023-04-01', TODAY);
    expect(r.band).toBe('recent');
    expect(r.detail).toContain('monuments are probably still findable');
  });

  it('warns about the basis of bearing on a dated survey', () => {
    const r = surveyRecency('2005-01-01', TODAY);
    expect(r.band).toBe('dated');
    expect(r.detail).toContain('basis of bearing');
  });

  it('calls an old survey evidence of the line, not a coordinate source', () => {
    const r = surveyRecency('1968-03-11', TODAY);
    expect(r.band).toBe('old');
    expect(r.detail).toContain('not as a coordinate source');
  });
});

describe('how a neighbour was identified is part of the fact', () => {
  it('says a deed call names who adjoined THEN, not now', () => {
    // Excellent evidence of the line, weak evidence of the current owner.
    expect(IDENTIFIED_BY_MEANING.deed_call).toContain('the day that deed was written');
  });

  it('says GIS polygons are drafting aids, not survey products', () => {
    expect(IDENTIFIED_BY_MEANING.gis_adjacency).toContain('drafting aids');
    expect(IDENTIFIED_BY_MEANING.gis_adjacency).toContain('not for a boundary');
  });

  it('has a meaning for every basis', () => {
    for (const v of Object.values(IDENTIFIED_BY_MEANING)) expect(v.length).toBeGreaterThan(20);
  });
});

describe('ranking is by what is on file, not by geometry', () => {
  it('puts a recent survey above a bigger neighbour with nothing', () => {
    // The decision this list supports is "where should I spend a 25-minute run".
    const ranked = rankAdjoiners([
      adj({ id: 'big', acreage: 400 }),
      adj({ id: 'surveyed', acreage: 2, last_survey_date: '2024-01-01' }),
    ], TODAY);
    expect(ranked[0]!.row.id).toBe('surveyed');
  });

  it('rewards a deed-call neighbour, whose deed describes the same line from the other side', () => {
    const ranked = rankAdjoiners([
      adj({ id: 'gis', identified_by: 'gis_adjacency' }),
      adj({ id: 'deed', identified_by: 'deed_call' }),
    ], TODAY);
    expect(ranked[0]!.row.id).toBe('deed');
    expect(ranked[0]!.worthDeepening).toContain('from the other side');
  });

  it('sinks a neighbour already researched, and one passed over', () => {
    const ranked = rankAdjoiners([
      adj({ id: 'done', depth: 'researched', last_survey_date: '2024-01-01' }),
      adj({ id: 'todo', last_survey_date: '2024-01-01' }),
      adj({ id: 'no', depth: 'declined', last_survey_date: '2024-01-01' }),
    ], TODAY);
    expect(ranked.map(r => r.row.id)).toEqual(['todo', 'done', 'no']);
  });

  it('describes each neighbour in one actionable line', () => {
    const [r] = rankAdjoiners([adj({ documents_found: 3, last_survey_date: '2024-01-01' })], TODAY);
    expect(r!.description).toContain('SMITH, JOHN');
    expect(r!.description).toContain('12.50 ac');
    expect(r!.description).toContain('3 document(s)');
    expect(r!.description).toContain('surveyed 2024');
  });

  it('says plainly when a neighbour has no signal at all', () => {
    const [r] = rankAdjoiners([adj()], TODAY);
    expect(r!.worthDeepening).toContain('no signal here yet');
  });

  it('does not print "undefined" for missing acreage or parcel', () => {
    const [r] = rankAdjoiners([adj({ acreage: null, parcel_id: null, owner_name: null })], TODAY);
    expect(r!.description).toContain('acreage unknown');
    expect(r!.description).toContain('no parcel id');
    expect(r!.description).toContain('owner not recorded');
  });
});

describe('the summary leads with what is worth money', () => {
  it('names how many have a recent survey', () => {
    const s = summariseAdjoiners(rankAdjoiners([
      adj({ id: '1', last_survey_date: '2024-01-01' }),
      adj({ id: '2' }),
    ], TODAY));
    expect(s.withRecentSurvey).toBe(1);
    expect(s.headline).toContain('most likely to be worth a full run');
  });

  it('says deepening is a judgement call when nothing is recent', () => {
    const s = summariseAdjoiners(rankAdjoiners([adj()], TODAY));
    expect(s.headline).toContain('judgement call');
  });

  it('calls an empty register a gap in the research, not a finding', () => {
    expect(summariseAdjoiners([]).headline).toContain('a gap in the research, not a finding');
  });
});

describe('the storage contract', () => {
  const seed = read('seeds/539_adjoiner_register.sql');

  it('records how each neighbour was identified', () => {
    expect(seed).toContain("CHECK (identified_by IN ('deed_call', 'gis_adjacency', 'plat_lot', 'manual'))");
  });

  it('says NULL survey date means unknown, not none', () => {
    expect(seed).toContain('NULL means unknown, NOT "never surveyed"');
  });

  it('indexes the question the owner asked', () => {
    expect(seed).toMatch(/idx_adjoiners_survey[\s\S]*last_survey_date DESC NULLS LAST/);
  });

  it('keeps the deepening state per neighbour', () => {
    expect(seed).toContain("CHECK (depth IN ('shallow', 'requested', 'researched', 'declined'))");
  });
});

describe('deepening on demand', () => {
  const route = read('app/api/admin/research/[projectId]/adjoiners/route.ts');

  it('queues a real research request rather than a private half-run', () => {
    // It goes through R28's queue, so it is deduplicated, retried and notified like any other run.
    expect(route).toContain("from('research_requests')");
    expect(route).toContain('dedupe_key');
  });

  it('links to an existing request instead of running the parcel twice', () => {
    // Two properties can adjoin the same neighbour.
    expect(route).toContain('23505');
    expect(route).toContain('running it twice is');
  });

  it('takes the county from the subject rather than guessing', () => {
    // They share a boundary, and guessing sends the run at the wrong clerk.
    expect(route).toContain('they share a boundary');
    expect(route).toContain('avoids sending a run at the wrong clerk');
  });

  it('refuses a neighbour with nothing to search on, before spending 25 minutes', () => {
    expect(route).toContain('a run with nothing to search on fails slowly');
  });

  it('records a decline rather than removing the row', () => {
    // "We looked and decided not to" is different from "we never considered it".
    expect(route).toContain("depth: 'declined'");
    expect(route).toContain('never considered it');
  });

  it('refuses to re-request one already requested or researched', () => {
    expect(route).toContain('would cost the same and find the same thing');
  });
});

describe('the surface', () => {
  const panel = read('app/admin/research/components/AdjoinersPanel.tsx');

  it('does not report a failed read as "no neighbours"', () => {
    expect(panel.replace(/\s+/g, ' ')).toContain('<strong>not</strong> the same as there being no neighbours');
  });

  it('offers the go-ahead only on a neighbour not yet acted on', () => {
    expect(panel).toContain("row.depth === 'shallow'");
    expect(panel).toContain('Research this property fully');
  });

  it('shows the identification basis, not just the name', () => {
    expect(panel).toContain('IDENTIFIED_BY_MEANING[row.identified_by]');
  });

  it('does not colour an unknown survey date like a recent one', () => {
    const css = read('app/admin/styles/AdminResearch.css');
    expect(css).toContain('.adjoiner__recency--unknown');
    expect(css).not.toMatch(/\.adjoiner__recency--unknown\s*\{[^}]*#D1FAE5/);
  });

  it('is reachable as its own tab', () => {
    const page = read('app/admin/research/[projectId]/page.tsx');
    expect(page).toContain("'neighbours'");
    expect(page).toContain('<AdjoinersPanel projectId={projectId} />');
  });
});

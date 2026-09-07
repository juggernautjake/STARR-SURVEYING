// Per-document round lineage (plan 3.4, deferred until wanted; built 2026-09-06 with seed 632).
// A follow-up round's finds are stamped with the round that found them, so a reviewer can tell an
// original deed from what the follow-up added. Pure pieces + the CALLER chain: the run resolves
// its round → hands it to beginFiling → resilientInsertDocument stamps every row → the app type
// and the live list show it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readResearchRound, roundFromMetadata } from '../research/research-round.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8');
const readRepo = (rel: string) => fs.readFileSync(path.join(here, '..', '..', '..', rel), 'utf8');

describe('roundFromMetadata', () => {
  it('reads the round the follow-up bookkeeping wrote, and is 1 when never set', () => {
    expect(roundFromMetadata({ researchRound: 3 })).toBe(3);
    expect(roundFromMetadata({})).toBe(1);
    expect(roundFromMetadata(null)).toBe(1);
    expect(roundFromMetadata({ researchRound: 'two' })).toBe(1);
    expect(roundFromMetadata({ researchRound: 0 })).toBe(1);
    expect(roundFromMetadata({ researchRound: 2.7 })).toBe(2);
  });
});

describe('readResearchRound', () => {
  const client = (meta: unknown, fail = false) => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => {
      if (fail) throw new Error('boom');
      return { data: { analysis_metadata: meta } };
    } }) }) }),
  });
  it('reads the project row', async () => {
    expect(await readResearchRound(client({ researchRound: 4 }), 'p1')).toBe(4);
    expect(await readResearchRound(client({}), 'p1')).toBe(1);
  });
  it('never throws — an unreadable project files as round 1 rather than not at all', async () => {
    expect(await readResearchRound(client(null, true), 'p1')).toBe(1);
  });
});

describe('the seed', () => {
  it('adds a nullable research_round column with a ≥ 1 check', () => {
    const sql = readRepo('seeds/632_research_documents_round.sql');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS research_round INTEGER');
    expect(sql).toContain('research_round IS NULL OR research_round >= 1');
  });
});

describe('the run stamps its round on every document it files (check the CALLER)', () => {
  it('the run resolves its round — the follow-up bump, else the project’s current round', () => {
    const src = read('index.ts');
    expect(src).toContain('let roundBookkeeping: Promise<number | null> = Promise.resolve(null);');
    expect(src).toContain('const round = roundFromMetadata(meta) + 1;');
    expect(src).toContain('return round;');
    expect(src).toContain('const researchRound = (await roundBookkeeping) ?? (await readResearchRound(supabaseForFiling as never, projectId));');
    expect(src).toContain("await beginFiling(supabaseForFiling as never, projectId, county, startedRun?.runId ?? null, researchRound);");
  });
  it('the filing context carries it and the one insert path stamps it', () => {
    const src = read('services/artifact-uploader.ts');
    expect(src).toContain('round: number | null;');
    expect(src).toContain('round: number | null = null,');
    expect(src).toContain('if (ctx.round != null && row.research_round == null) row.research_round = ctx.round;');
  });
  it('a database without seed 632 still files the document (the fallback row drops the column)', () => {
    const src = read('services/artifact-uploader.ts');
    const at = src.indexOf('function narrowRow(');
    expect(src.slice(at, at + 600)).toContain('delete fallbackRow.research_round;');
  });
});

describe('the app shows it', () => {
  it('the document type carries research_round and the live list badges a follow-up find', () => {
    expect(readRepo('types/research.ts')).toContain('research_round?: number | null;');
    const panel = readRepo('app/admin/research/components/AnalysisEstimatePanel.tsx');
    expect(panel).toContain('doc?.research_round != null && doc.research_round > 1');
    expect(panel).toContain('Round {doc.research_round}');
  });
});

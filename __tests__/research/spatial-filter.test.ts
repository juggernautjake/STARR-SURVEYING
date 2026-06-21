// __tests__/research/spatial-filter.test.ts
//
// §10.5 + §10.6 of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.

import { describe, it, expect } from 'vitest';
import {
  disambiguateSubject,
  rankAndDisambiguate,
  rankAndFilterCandidates,
  type RankedCandidate,
} from '@/lib/research/spatial-filter';
import type { CanonicalProperty, RelevanceContext } from '@/lib/research/canonical-schema';

const ATTR = { source: 'bell_cad_arcgis' as const };

const ctx = (
  subject: Partial<RelevanceContext['subject']> = { parcel_id: '12345' },
  adjoiners: RelevanceContext['adjoiners'] = [],
): RelevanceContext => ({ subject, adjoiners });

const rec = (overrides: Partial<CanonicalProperty>): CanonicalProperty => ({
  parcel_id: 'X',
  attribution: ATTR,
  ...overrides,
});

describe('rankAndFilterCandidates', () => {
  it('drops `unrelated` candidates by default (below score floor)', () => {
    const candidates: CanonicalProperty[] = [
      rec({ parcel_id: '12345' }),                                          // subject
      rec({ parcel_id: '99999', owner: { display_name: 'random person' } }), // unrelated
    ];
    const ranked = rankAndFilterCandidates(candidates, ctx());
    expect(ranked.map((r) => r.record.parcel_id)).toEqual(['12345']);
  });

  it('keeps adjoiners and ranks subject above them', () => {
    const candidates: CanonicalProperty[] = [
      rec({ parcel_id: 'A1' }),       // adjoiner per context
      rec({ parcel_id: '12345' }),    // subject
    ];
    const ranked = rankAndFilterCandidates(
      candidates,
      ctx({ parcel_id: '12345' }, [{ parcel_id: 'A1', source: 'gis_adjacency' }]),
    );
    expect(ranked[0]!.record.parcel_id).toBe('12345');
    expect(ranked[0]!.classification.tag).toBe('subject');
    expect(ranked[1]!.classification.tag).toBe('adjoiner');
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it('honors the limit option', () => {
    const candidates: CanonicalProperty[] = Array.from({ length: 10 }, (_, i) =>
      rec({ parcel_id: `12345`, attribution: { ...ATTR, source_ref: `dup-${i}` } }),
    );
    const ranked = rankAndFilterCandidates(candidates, ctx(), { limit: 3 });
    expect(ranked).toHaveLength(3);
  });

  it('applies a centroid-proximity bonus when geometry is missing but centroids are present', () => {
    const candidates: CanonicalProperty[] = [
      rec({
        parcel_id: 'A1',
        geometry: { geojson: { type: 'Polygon', coordinates: [[
          [-97.5, 30.5], [-97.4999, 30.5], [-97.4999, 30.5001], [-97.5, 30.5001], [-97.5, 30.5],
        ]] } },
      }),
      rec({
        parcel_id: 'B1',
        geometry: { geojson: { type: 'Polygon', coordinates: [[
          [-97.49, 30.5], [-97.4899, 30.5], [-97.4899, 30.5001], [-97.49, 30.5001], [-97.49, 30.5],
        ]] } },
      }),
    ];
    const subjectCtx = ctx(
      { centroid_lonlat: [-97.5, 30.5] },
      [
        { parcel_id: 'A1', source: 'gis_adjacency' },
        { parcel_id: 'B1', source: 'gis_adjacency' },
      ],
    );
    const ranked = rankAndFilterCandidates(candidates, subjectCtx);
    // A1 is ~9m from the subject centroid; B1 is ~1km away.
    expect(ranked[0]!.record.parcel_id).toBe('A1');
    expect(ranked[0]!.proximity_meters).toBeLessThan(50);
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it('returns empty when nothing makes the score floor', () => {
    const candidates: CanonicalProperty[] = [
      rec({ parcel_id: '99999', owner: { display_name: 'nobody' } }),
    ];
    expect(rankAndFilterCandidates(candidates, ctx())).toEqual([]);
  });

  it('does not mutate the candidate records', () => {
    const candidates: CanonicalProperty[] = [rec({ parcel_id: '12345' })];
    const before = JSON.parse(JSON.stringify(candidates));
    rankAndFilterCandidates(candidates, ctx());
    expect(candidates).toEqual(before);
  });
});

describe('disambiguateSubject', () => {
  const subjectCandidate = (parcel_id: string, score: number): RankedCandidate => ({
    record: rec({ parcel_id }),
    classification: {
      tag: 'subject',
      confidence: score,
      matched_parcel_ref: parcel_id,
      rationale: 'test',
    },
    score,
  });

  const adjoinerCandidate = (parcel_id: string, score: number): RankedCandidate => ({
    record: rec({ parcel_id }),
    classification: {
      tag: 'adjoiner',
      confidence: score,
      matched_parcel_ref: parcel_id,
      rationale: 'test',
    },
    score,
  });

  it('auto-picks when one subject-tagged candidate clearly leads', () => {
    const r = disambiguateSubject([
      subjectCandidate('A', 0.95),
      subjectCandidate('B', 0.6),
    ]);
    expect(r.chosen?.record.parcel_id).toBe('A');
    expect(r.reason).toMatch(/leader/);
  });

  it('surfaces when the runner-up is within the ambiguity gap', () => {
    const r = disambiguateSubject([
      subjectCandidate('A', 0.85),
      subjectCandidate('B', 0.8),  // gap 5% < default 15%
    ]);
    expect(r.chosen).toBeNull();
    expect(r.candidates).toHaveLength(2);
    expect(r.reason).toMatch(/runner-up within/);
  });

  it('refuses to auto-pick when the leader is below the minimum score', () => {
    const r = disambiguateSubject([subjectCandidate('A', 0.45)]);
    expect(r.chosen).toBeNull();
    expect(r.reason).toMatch(/below the .+ auto-pick floor/);
  });

  it('returns null when no subject/unknown candidates exist (only adjoiners)', () => {
    const r = disambiguateSubject([adjoinerCandidate('A', 0.9), adjoinerCandidate('B', 0.85)]);
    expect(r.chosen).toBeNull();
    expect(r.candidates).toEqual([]);
    expect(r.reason).toMatch(/no candidate matched/);
  });

  it('respects the maxCandidates cap', () => {
    const ranked = Array.from({ length: 10 }, (_, i) =>
      subjectCandidate(`p${i}`, 0.8 - i * 0.01),
    );
    const r = disambiguateSubject(ranked, { maxCandidates: 3 });
    expect(r.candidates).toHaveLength(3);
  });

  it('respects a custom ambiguityGap', () => {
    const r = disambiguateSubject(
      [subjectCandidate('A', 0.9), subjectCandidate('B', 0.85)],
      { ambiguityGap: 0.02 },  // tighter — 5% gap now clears it
    );
    expect(r.chosen?.record.parcel_id).toBe('A');
  });
});

describe('rankAndDisambiguate (composed flow)', () => {
  it('runs §10.5 → §10.6 in one call and returns both pieces', () => {
    const candidates: CanonicalProperty[] = [
      rec({ parcel_id: '12345' }),                        // subject
      rec({ parcel_id: 'A1' }),                           // adjoiner
      rec({ parcel_id: '99999', owner: { display_name: 'nobody' } }),  // unrelated, dropped
    ];
    const result = rankAndDisambiguate(
      candidates,
      ctx({ parcel_id: '12345' }, [{ parcel_id: 'A1', source: 'gis_adjacency' }]),
    );
    expect(result.ranked.map((r) => r.record.parcel_id)).toEqual(['12345', 'A1']);
    expect(result.disambiguation.chosen?.record.parcel_id).toBe('12345');
  });
});

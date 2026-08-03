// CAD_AUDIT Slice S8a — the research platform's reading becomes CAD geometry.
//
// The join between the two halves of the product. Until now a surveyor re-typed calls by hand into a
// drawing the research side had already computed.
//
// WHAT THESE TESTS ACTUALLY DEFEND is honesty, not arithmetic — the walking of the traverse already
// happens in the worker and is tested there. A drawing is the easiest place in this entire product to
// break the platform's own rule that an unknown is never rendered as an answer, because a closed
// polygon looks authoritative no matter what it was built from.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  featuresFromSurveyReading, __resetIds, type SurveyReadingLike,
} from '@/lib/cad/import/from-survey-reading';

beforeEach(() => { __resetIds(); });

const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

const reading = (over: Partial<SurveyReadingLike> = {}): SurveyReadingLike => ({
  traverse: { points: square, unusable: [] },
  located: [],
  monuments: [],
  features: [],
  confidence: { score: 88, band: 'high' },
  ...over,
});

describe('a complete traverse becomes a closed boundary', () => {
  it('produces one POLYGON with every corner', () => {
    const out = featuresFromSurveyReading(reading());
    const boundary = out.features.find((f) => f.type === 'POLYGON');
    expect(boundary).toBeDefined();
    expect(boundary!.geometry.vertices).toHaveLength(4);
    expect(out.closed).toBe(true);
  });

  it('reports nothing as undrawn', () => {
    expect(featuresFromSurveyReading(reading()).notDrawn).toEqual([]);
  });
});

describe('an INCOMPLETE traverse must not look complete', () => {
  // The single most important rule here. A boundary drawn from 8 of 10 calls is not a boundary with
  // two gaps — it is a different shape that looks finished.
  const gappy = reading({
    traverse: { points: square, unusable: [{ index: 3, reason: 'illegible bearing' }] },
  });

  it('stays an OPEN polyline rather than closing into a polygon', () => {
    const out = featuresFromSurveyReading(gappy);
    expect(out.closed).toBe(false);
    expect(out.features.find((f) => f.type === 'POLYGON')).toBeUndefined();
    expect(out.features.find((f) => f.type === 'POLYLINE')).toBeDefined();
  });

  it('names every unusable call and its reason', () => {
    const out = featuresFromSurveyReading(gappy);
    expect(out.notDrawn).toContainEqual({ what: 'call 3', why: 'illegible bearing' });
  });

  it('records the count on the feature itself, not only in the report', () => {
    // A caller that renders features and ignores the report must still be able to tell.
    const f = featuresFromSurveyReading(gappy).features[0];
    expect(f.properties.unusableCalls).toBe(1);
    expect(f.properties.closed).toBe(false);
  });
});

describe('coordinates are relative, and say so', () => {
  // The worker starts every traverse at (0,0) and is explicit that a state-plane position needs a
  // measured tie. If that is lost in translation, a record sketch becomes a located survey.
  it('flags the result', () => {
    expect(featuresFromSurveyReading(reading()).relative).toBe(true);
  });

  it('flags each feature, with a note a human can read', () => {
    const f = featuresFromSurveyReading(reading()).features[0];
    expect(f.properties.relative).toBe(true);
    expect(String(f.properties.positionNote)).toMatch(/not tied to the state plane/i);
  });
});

describe('confidence survives becoming geometry', () => {
  it('rides along on the boundary', () => {
    const out = featuresFromSurveyReading(reading());
    expect(out.confidence).toEqual({ score: 88, band: 'high' });
    expect(out.features[0].properties.confidenceScore).toBe(88);
    expect(out.features[0].properties.confidenceBand).toBe('high');
  });

  it('is null rather than invented when the reading has none', () => {
    const out = featuresFromSurveyReading(reading({ confidence: null }));
    expect(out.confidence).toEqual({ score: null, band: null });
  });
});

describe('monuments', () => {
  it('places the ones that have coordinates', () => {
    const out = featuresFromSurveyReading(reading({
      located: [{ x: 0, y: 0, label: 'POB', status: 'FOUND' }],
      monuments: [{}],
    }));
    const pt = out.features.find((f) => f.type === 'POINT');
    expect(pt?.geometry.point).toEqual({ x: 0, y: 0 });
  });

  it('keeps FOUND vs SET, which is the distinction that matters most', () => {
    // A found monument controls the corner; a set one is an opinion. Losing it in the import would
    // erase the most load-bearing fact about a monument.
    const out = featuresFromSurveyReading(reading({
      located: [{ x: 1, y: 2, status: 'FOUND' }], monuments: [{}],
    }));
    expect(out.features.find((f) => f.type === 'POINT')?.properties.monumentStatus).toBe('FOUND');
  });

  it('counts the ones it could NOT place instead of quietly dropping them', () => {
    const out = featuresFromSurveyReading(reading({
      located: [{ x: 0, y: 0 }],
      monuments: [{}, {}, {}],
    }));
    expect(out.notDrawn).toContainEqual({
      what: '2 monument(s)',
      why: 'recited in the document but could not be placed on the figure',
    });
  });
});

describe('water, roads and easements are reported, never invented', () => {
  it('does not draw a feature whose position is unknown', () => {
    // The reading records THAT a 30ft easement exists, not where it runs. Drawing it somewhere would
    // be invention — the difference between "we know there is an easement" and "here is the
    // easement", and only the first is true.
    const out = featuresFromSurveyReading(reading({
      features: [{ kind: 'easement', label: 'utility easement', widthFeet: 30 }],
    }));
    expect(out.features.filter((f) => f.layerId === 'RESEARCH_MONUMENTS')).toHaveLength(0);
    expect(out.notDrawn).toContainEqual({
      what: 'easement (utility easement)',
      why: 'recorded on the document, but the reading carries no located geometry for it',
    });
  });
});

describe('a non-traversable description', () => {
  it('says why rather than returning an empty drawing', () => {
    // Lot-and-block and reference-only descriptions set `traverse: null`. That is not an error, and
    // an empty result with no explanation would read as "we found nothing".
    const out = featuresFromSurveyReading(reading({ traverse: null }));
    expect(out.features).toEqual([]);
    expect(out.notDrawn[0].why).toMatch(/not traversable/i);
  });

  it('treats a one-point traverse the same way', () => {
    const out = featuresFromSurveyReading(reading({
      traverse: { points: [{ x: 0, y: 0 }], unusable: [] },
    }));
    expect(out.features).toEqual([]);
    expect(out.notDrawn[0].why).toMatch(/fewer than two corners/i);
  });
});

describe('it does not couple the two builds together', () => {
  // A cross-project type import is how the production build breaks while every test stays green —
  // it has happened three times in this repo. The input is structurally typed instead.
  const src = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'lib/cad/import/from-survey-reading.ts'), 'utf8');

  it('imports nothing from worker/', () => {
    const code = src.split('\n').filter((l: string) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    expect(code).not.toMatch(/from\s+['"].*worker\//);
  });
});

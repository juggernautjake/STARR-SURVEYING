// worker/src/__tests__/drawing-hunt.test.ts — plan F6.
//
// "We need to work especially hard on finding drawings and cad work for properties that we
//  research."
//
// The reason that was not happening is a five-value union. `DocumentType` is
// 'deed' | 'plat' | 'easement' | 'lien' | 'other', and the clerk classifier tests REPLAT, AMENDED
// PLAT, VACATING PLAT and PLAT — so every label below was `other`, which is where a document goes
// to stop being looked for.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyDrawing, huntDrawings, DRAWING_SEARCH_TERMS } from '../research/drawing-hunt.js';

describe('a recorded survey is recognised — the document that was most worth finding', () => {
  // A survey of THIS tract is somebody's completed retracement, with monuments called for on the
  // ground. It outranks the subdivision plat for a surveyor's purposes.
  const surveyLabels = [
    'PLAT OF SURVEY',
    'MAP OF SURVEY',
    'SURVEY PLAT',
    "SURVEYOR'S CERTIFICATE",
    'BOUNDARY SURVEY',
    'RETRACEMENT SURVEY',
  ];

  for (const label of surveyLabels) {
    it(`classifies "${label}" as a survey`, () => {
      const m = classifyDrawing(label);
      expect(m.isDrawing).toBe(true);
      expect(m.category).toBe('survey');
    });
  }

  it('does NOT collapse "PLAT OF SURVEY" into a subdivision plat', () => {
    // `PLAT` matches inside `PLAT OF SURVEY`. Order the patterns wrongly and every recorded survey
    // in the county files as a subdivision plat — the same specific-before-general trap that made
    // the client's "Stage 3.5" branch unreachable.
    expect(classifyDrawing('PLAT OF SURVEY').category).toBe('survey');
    expect(classifyDrawing('SUBDIVISION PLAT').category).toBe('plat');
  });
});

describe('the rest of the vocabulary', () => {
  const cases: Array<[string, string]> = [
    ['REPLAT', 'plat'],
    ['AMENDED PLAT', 'plat'],
    ['VACATING PLAT', 'plat'],
    ['FINAL PLAT', 'plat'],
    ['PLAT & DEDICATION', 'plat'],
    ['RIGHT OF WAY MAP', 'right_of_way'],
    ['RIGHT-OF-WAY MAP', 'right_of_way'],
    ['EASEMENT EXHIBIT', 'right_of_way'],
    ['UTILITY PLAT', 'right_of_way'],
    ['CONDOMINIUM PLAT', 'condominium'],
    ['FIELD NOTES', 'field_notes'],
    ['METES AND BOUNDS DESCRIPTION', 'field_notes'],
    ['MONUMENT RECORD', 'monument'],
    ['CONTROL RECORD', 'monument'],
    ['SITE PLAN DRAWING', 'map'],
  ];

  for (const [label, category] of cases) {
    it(`classifies "${label}" as ${category}`, () => {
      const m = classifyDrawing(label);
      expect(m.isDrawing).toBe(true);
      expect(m.category).toBe(category);
    });
  }

  it('recognises a CAD file by its extension', () => {
    expect(classifyDrawing('SITE.DWG').category).toBe('map');
    expect(classifyDrawing('EXHIBIT.DXF').isDrawing).toBe(true);
  });
});

describe('what it does NOT claim', () => {
  it('leaves an ordinary conveyance alone', () => {
    for (const label of ['WARRANTY DEED', 'DEED OF TRUST', 'MECHANICS LIEN', 'RELEASE', 'AFFIDAVIT']) {
      expect(classifyDrawing(label).isDrawing, label).toBe(false);
    }
  });

  it('says nothing either way about an unlabelled document', () => {
    const m = classifyDrawing(null);
    expect(m.isDrawing).toBe(false);
    expect(m.reason).toMatch(/nothing can be said about it either way/i);
  });

  it('honours an adapter that already decided "plat" when the label is unhelpful', () => {
    const m = classifyDrawing('Instrument 2004035448', 'plat');
    expect(m.isDrawing).toBe(true);
    expect(m.strength).toBe('probable');
  });

  it('gives a reason a person can disagree with, every time', () => {
    expect(classifyDrawing('PLAT OF SURVEY').reason).toMatch(/already retraced this boundary/i);
    expect(classifyDrawing('WARRANTY DEED').reason).toMatch(/does not match any known drawing vocabulary/i);
  });
});

describe('a weak match is surfaced, never discarded', () => {
  it('keeps a bare "MAP" as a weak drawing rather than dropping it', () => {
    // This classification SURFACES documents for a person to look at. A false positive costs a
    // glance; a false negative loses the most useful document on the property.
    const m = classifyDrawing('MAP');
    expect(m.isDrawing).toBe(true);
    expect(m.strength).toBe('weak');
  });
});

describe('the hunt over a run\'s documents', () => {
  // The 17 documents from the run captured on 2026-09-01, with their real labels.
  const realRun = [
    { label: 'JUDGMENT' }, { label: 'MECHANICS LIEN' }, { label: 'RELEASE' },
    { label: 'AFFIDAVIT' }, { label: 'EASEMENT' }, { label: 'DEED' },
    { label: 'Subdivision Plat: HULL, THOMAS D' },
    { label: 'PLAT & DEDICATION — HULL THOMAS D to HULL SUB' },
    { label: 'DEED OF TRUST — HULL THOMAS D to WELLS FARGO BANK NA' },
  ];

  it('finds the drawings hiding in a real run', () => {
    const r = huntDrawings(realRun);
    expect(r.found.length).toBe(2);
    expect(r.found.every((f) => f.category === 'plat')).toBe(true);
    expect(r.examined).toBe(9);
  });

  it('ranks strong matches first', () => {
    const r = huntDrawings([{ label: 'MAP' }, { label: 'PLAT OF SURVEY' }]);
    expect(r.found[0].category).toBe('survey');
  });

  it('calls out a recorded survey specifically, because it changes what to read first', () => {
    const r = huntDrawings([{ label: 'DEED' }, { label: 'PLAT OF SURVEY' }]);
    expect(r.summary).toMatch(/already retraced this boundary; read those first/i);
  });

  it('NEVER says the county holds no drawings', () => {
    // We matched labels. A drawing filed under a word nobody has written down yet is still out
    // there, and claiming otherwise invites a conclusion the run never tested.
    const r = huntDrawings([{ label: 'WARRANTY DEED' }]);
    expect(r.found).toHaveLength(0);
    expect(r.summary).toMatch(/not that the county holds none/i);
  });

  it('says whether it actually went looking, or only classified what it had', () => {
    expect(huntDrawings([{ label: 'DEED' }]).summary).toMatch(/No drawing-specific search was run/i);
    expect(huntDrawings([{ label: 'DEED' }], ['PLAT']).summary).toMatch(/1 drawing-specific search term/i);
  });
});

describe('the search vocabulary', () => {
  it('leads with the document a surveyor most wants', () => {
    expect(DRAWING_SEARCH_TERMS[0].term).toBe('PLAT OF SURVEY');
  });

  it('gives a reason for every term, so the list can be argued with', () => {
    for (const t of DRAWING_SEARCH_TERMS) {
      expect(t.why.length, t.term).toBeGreaterThan(20);
    }
  });
});

// ── Wired? ──────────────────────────────────────────────────────────────────────────────────────

describe('the run actually hunts', () => {
  const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');

  it('imports and calls the hunt', () => {
    expect(index).toMatch(/from '\.\/research\/drawing-hunt\.js'/);
    expect(index).toContain('huntDrawings(docs, DRAWING_SEARCH_TERMS.map');
  });

  it('reads BOTH result shapes, or the hunt is silently halved', () => {
    expect(index).toContain('function documentsForDrawingHunt(');
    const at = index.indexOf('function documentsForDrawingHunt(');
    const fn = index.slice(at, at + 1600);
    expect(fn).toContain('data.documents');          // generic pipeline
    expect(fn).toContain('data.deedsAndRecords');    // county result
    expect(fn).toContain('data.plats');
  });

  it('puts the answer on the RESULT, not only in the log', () => {
    // A hunt whose answer never leaves the log is indistinguishable from no hunt.
    expect(index).toContain('.drawingHunt = hunt');
  });
});

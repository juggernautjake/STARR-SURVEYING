import { describe, it, expect, vi } from 'vitest';
import {
  collectSummarySources,
  renderSourceList,
  writePropertySummary,
  summaryInputFromBell,
  summaryInputFromPipeline,
} from '../research/property-summary.js';
import type { BellResearchResult } from '../counties/bell/types/research-result.js';

// ── PLAN E2 — A SUMMARY THAT CITES ITS SOURCES ─────────────────────────────────────────────────
//
// The Bell path had no master report; the Summary tab showed five lines of field values. This
// module writes a reading of the run with every claim cited, and the source list is appended by
// CODE so a citation always resolves. These tests hold the numbering, the appended list, the
// no-key and failure paths, and that the model is actually asked to cite.

vi.mock('../infra/usage.js', () => ({ recordAmbientAiCall: vi.fn(async () => 0) }));

const conf = { tier: 'medium', score: 60 } as unknown as BellResearchResult['overallConfidence'];

function fixture(): BellResearchResult {
  return {
    researchId: 'bell-p1-1', projectId: 'p1', startedAt: '2026-09-03T00:00:00Z', completedAt: '2026-09-03T00:10:00Z', durationMs: 600000,
    property: {
      propertyId: '42156', ownerName: 'GOODNIGHT, W GENE ETUX', legalDescription: 'A0962BC P M LEVY, 1 & 1-3', acreage: 22.495,
      situsAddress: '11780 FM 2484',
    } as unknown as BellResearchResult['property'],
    deedsAndRecords: {
      summary: '', chainOfTitle: [], confidence: conf,
      records: [
        { instrumentNumber: '2004032468', volume: null, page: null, recordingDate: '2004-05-01', documentType: 'Warranty Deed', grantor: 'A', grantee: 'B', legalDescription: null, aiSummary: 'Conveys 22.495 acres beginning at an iron rod.', pageImages: [], sourceUrl: 'https://bell.tx.publicsearch.us/doc/1' },
        { instrumentNumber: null, volume: '1234', page: '56', recordingDate: null, documentType: 'Deed', grantor: null, grantee: null, legalDescription: 'Part of the Levy survey', aiSummary: null, pageImages: [], sourceUrl: null },
      ],
    } as unknown as BellResearchResult['deedsAndRecords'],
    plats: {
      summary: '', crossValidation: [], confidence: conf,
      plats: [{ name: 'CEDAR RIDGE ESTATES PHASE I', date: '2014-01-01', instrumentNumber: '201400036036', images: [], sourceUrl: 'https://bell.tx.publicsearch.us/doc/2', source: 'clerk', confidence: conf,
        aiAnalysis: { narrative: 'Twelve lots.', lotDimensions: ['Lot 2: 150 x 200'], bearingsAndDistances: ['N 45 E 150.00'], monuments: ['1/2" iron rod'], easements: [], curves: [], rowWidths: [], adjacentReferences: [], changesFromPrevious: [] } }],
    } as unknown as BellResearchResult['plats'],
    easementsAndEncumbrances: { fema: null, txdot: null, easements: [{ type: 'Utility easement', description: '10 ft along the north line', instrumentNumber: null, image: null, sourceUrl: null, source: 'plat', confidence: conf }], restrictiveCovenants: [], summary: '', confidence: conf } as unknown as BellResearchResult['easementsAndEncumbrances'],
    propertyDetails: {} as unknown as BellResearchResult['propertyDetails'],
    researchedLinks: [],
    discrepancies: [{ category: 'acreage', description: 'Acreage differs', source1: 'CAD', source1Value: '22.495', source2: 'Deed', source2Value: '22.76', aiRecommendation: 'Trust the deed', severity: 'medium', confidence: conf }],
    adjacentProperties: [{ direction: 'North', propertyId: '42157', ownerName: 'SMITH', research: null, sharedBoundary: '~400 ft', situsAddress: '11790 FM 2484', acreage: 10, legalDescription: null, sourceUrl: 'https://esearch.bellcad.org/Property/View/42157' }],
    siteIntelligence: [], screenshots: [], errors: [], aiUsage: {} as unknown as BellResearchResult['aiUsage'], overallConfidence: conf,
  };
}

describe('collectSummarySources numbers every document the run holds', () => {
  const s = collectSummarySources(fixture());

  it('plats first (the owner ranked them first), then deeds, easements, adjoiners', () => {
    expect(s.map((x) => x.ref)).toEqual(['[P1]', '[D1]', '[D2]', '[E1]', '[A1]']);
  });

  it('carries the identity and the URL a reviewer can open', () => {
    expect(s[0]).toMatchObject({ kind: 'plat', identity: '201400036036', url: 'https://bell.tx.publicsearch.us/doc/2' });
    expect(s[1]).toMatchObject({ kind: 'deed', identity: '2004032468' });
    // A deed with no instrument number is still citable by its book and page.
    expect(s[2].identity).toBe('Vol. 1234, Pg. 56');
    expect(s[4]).toMatchObject({ kind: 'adjoiner', identity: '42157', label: expect.stringContaining('North') });
  });

  it('puts the extracted content, not the images, in the prompt', () => {
    expect(s[0].content).toContain('Lot 2: 150 x 200');
    expect(s[1].content).toContain('iron rod');
  });
});

describe('the source list is written by code so every citation resolves', () => {
  it('lists ref, label, identity and url', () => {
    const list = renderSourceList(collectSummarySources(fixture()));
    expect(list).toContain('SOURCES');
    expect(list).toContain('[P1] Plat: CEDAR RIDGE ESTATES PHASE I (2014-01-01) — 201400036036 — https://bell.tx.publicsearch.us/doc/2');
    expect(list).toContain('[A1] Adjoiner to the North: SMITH — 42157 — https://esearch.bellcad.org/Property/View/42157');
  });
});

describe('writePropertySummary', () => {
  it('asks the model to cite, appends the source list, and counts the citations', async () => {
    let prompt = '';
    const client = { messages: { create: vi.fn(async (req: { messages: Array<{ content: string }> }) => {
      prompt = req.messages[0].content;
      return { content: [{ type: 'text', text: '## Property\nThe tract is 22.495 acres [D1][P1].' }], usage: { input_tokens: 10, output_tokens: 5 } };
    }) } };
    const out = await writePropertySummary(summaryInputFromBell(fixture()), 'key', { client: client as never });
    expect(prompt).toContain('MUST end with one or more citations');
    expect(prompt).toContain('[D1] Warranty Deed recorded 2004-05-01');
    expect(prompt).toContain('DISCREPANCIES THE RUN FLAGGED');
    expect(out.text).toContain('[D1][P1]');
    expect(out.text).toContain('\n\nSOURCES\n[P1]');
    expect(out.statement).toMatch(/2 citation\(s\)/);
  });

  it('says so when the model cited nothing — the narrative is kept but marked unreviewed', async () => {
    const client = { messages: { create: vi.fn(async () => ({ content: [{ type: 'text', text: 'A fine tract.' }], usage: { input_tokens: 1, output_tokens: 1 } })) } };
    const out = await writePropertySummary(summaryInputFromBell(fixture()), 'key', { client: client as never });
    expect(out.text).toContain('A fine tract.');
    expect(out.statement).toMatch(/NO citations/);
  });

  it('never throws: no key is a skip, a model failure is a null with the reason', async () => {
    const noKey = await writePropertySummary(summaryInputFromBell(fixture()), '');
    expect(noKey.text).toBeNull();
    expect(noKey.statement).toContain('ANTHROPIC_API_KEY');

    const client = { messages: { create: vi.fn(async () => { throw new Error('overloaded'); }) } };
    const failed = await writePropertySummary(summaryInputFromBell(fixture()), 'key', { client: client as never });
    expect(failed.text).toBeNull();
    expect(failed.statement).toContain('overloaded');
  });

  it('a run with no documents is a skip, not a call', async () => {
    const empty = fixture();
    empty.plats.plats = []; empty.deedsAndRecords.records = []; empty.easementsAndEncumbrances.easements = []; empty.adjacentProperties = [];
    const client = { messages: { create: vi.fn() } };
    const out = await writePropertySummary(summaryInputFromBell(empty), 'key', { client: client as never });
    expect(client.messages.create).not.toHaveBeenCalled();
    expect(out.statement).toContain('no documents');
  });
});

describe('the generic pipeline feeds the same writer (every county, not only Bell)', () => {
  it('numbers plats and deeds from the document list and adjoiners from the validation report', () => {
    const input = summaryInputFromPipeline(
      { county: 'Milam', ownerName: 'ASH FAMILY TRUST', propertyId: '77', situsAddress: '1 CR 100', legalDescription: 'A-12 J SMITH', acreage: 12.358 },
      [
        { ref: { instrumentNumber: '2023032044', volume: null, page: null, documentType: 'Final Plat', recordingDate: '2023-01-01', grantors: [], grantees: [], source: 'Milam County Clerk', url: 'https://milam.tx.publicsearch.us/doc/9' }, textContent: null, ocrText: 'PLAT OF ASH FAMILY TRUST 12.358 ACRE ADDITION', extractedData: null },
        { ref: { instrumentNumber: '2010043440', volume: null, page: null, documentType: 'Warranty Deed', recordingDate: '2010-05-05', grantors: ['ASH'], grantees: ['TRUST'], source: 'Milam County Clerk', url: null }, textContent: null, ocrText: 'BEGINNING at an iron rod', extractedData: null },
      ] as never,
      {
        adjacentProperties: [{ ownerName: 'JONES', calledAcreage: '50 ac', recordingReference: 'Vol 100 Pg 2', direction: 'east', sharedBoundaryCallSeqs: [3, 4] }],
        easements: [], discrepancyLog: [{ item: 'Acreage', sourceA: 'CAD 12.358', sourceB: 'Deed 12.4', severity: 'MINOR', actionNeeded: 'Check the closing call' }],
        discrepancies: [],
      } as never,
    );
    expect(input.sources.map((s) => s.ref)).toEqual(['[P1]', '[D1]', '[A1]']);
    expect(input.sources[0]).toMatchObject({ kind: 'plat', identity: '2023032044', url: 'https://milam.tx.publicsearch.us/doc/9' });
    expect(input.sources[1].label).toContain('ASH to TRUST');
    expect(input.sources[2]).toMatchObject({ kind: 'adjoiner', identity: 'Vol 100 Pg 2' });
    expect(input.facts[0]).toBe('County: Milam');
    expect(input.discrepancies[0]).toContain('[MINOR] Acreage');
  });
});

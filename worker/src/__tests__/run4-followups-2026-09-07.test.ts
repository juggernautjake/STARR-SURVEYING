// Run 4 (project 2321a1f7…, 2026-09-07) proved slices A–E and exposed the next layer:
//   • the plat, "already in the library" from an ARCHIVED project, was not filed here by the early
//     pass — TexasFile re-opens an owned document for $0, so "held elsewhere" must mean re-open + file;
//   • the "all deeds" want paid $3 for 2004034968, which the free clerk pass already held;
//   • the easement want bought a deed (the chooser did not know what the want was FOR), the deed want
//     a five-page unknown with a blank legal;
//   • the plat's ledger key was "search_required:plat" instead of its GUID;
//   • the end-of-run artifact step, now that the blanket delete is gone, re-filed screenshots and the
//     clerk deed as duplicates because it ran outside the run's filing context;
//   • the read pass took documents in filing order (aerials first), so a cap lands on the deeds.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseTexasFileResult, describeNoChoice, type TexasFileResult } from '../services/texasfile-buy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');

const row = (o: Partial<TexasFileResult> & { guid: string }): TexasFileResult => ({
  instrument: null, instrumentRaw: null, bookVolPage: null, book: null, volume: null, page: null, pages: 3,
  priceUsd: null, type: 'WARRANTY DEED', countyType: null, date: '11/23/2020', grantor: null, grantee: null,
  legal: null, subdivision: null, lots: [], block: null, abstract: null, survey: null, text: '', owned: false,
  ...o,
} as TexasFileResult);

describe('the chooser knows what the want is FOR', () => {
  const deedOnLot = row({ guid: 'D-1', instrument: '2004034968', subdivision: 'WINNIE MAE ADDITION', lots: ['4'], block: '1', type: 'WARRANTY DEED' });
  const lienOnLot = row({ guid: 'L-1', instrument: '2010000001', subdivision: 'WINNIE MAE ADDITION', lots: ['4'], block: '1', type: 'DEED OF TRUST' });
  const easementOnLot = row({ guid: 'E-1', instrument: '2012000002', subdivision: 'WINNIE MAE ADDITION', lots: ['4'], type: 'EASEMENT' });
  const blankDeed = row({ guid: 'B-1', instrument: '2015000003', type: 'WARRANTY DEED' });
  const blankUnknown = row({ guid: 'U-1', instrument: '2016000004', type: '' });

  it('an easement want takes only an easement/right-of-way row', () => {
    expect(chooseTexasFileResult([deedOnLot, lienOnLot, easementOnLot], { subdivision: 'WINNIE MAE ADDITION', lot: '4', wantType: 'easement' })?.guid).toBe('E-1');
    expect(chooseTexasFileResult([deedOnLot, lienOnLot], { subdivision: 'WINNIE MAE ADDITION', wantType: 'easement' })).toBeNull();
    expect(chooseTexasFileResult([deedOnLot, blankUnknown], { subdivision: 'WINNIE MAE ADDITION', wantType: 'easement' })).toBeNull();
  });
  it('a deed want takes the conveyance, never the lien, and a blank-legal row only when it is a deed', () => {
    expect(chooseTexasFileResult([lienOnLot, deedOnLot], { subdivision: 'WINNIE MAE ADDITION', lot: '4', wantType: 'deed' })?.guid).toBe('D-1');
    expect(chooseTexasFileResult([lienOnLot], { subdivision: 'WINNIE MAE ADDITION', wantType: 'deed' })).toBeNull();
    expect(chooseTexasFileResult([blankUnknown, blankDeed], { subdivision: 'WINNIE MAE ADDITION', wantType: 'deed' })?.guid).toBe('B-1');
    expect(chooseTexasFileResult([blankUnknown], { subdivision: 'WINNIE MAE ADDITION', wantType: 'deed' })).toBeNull();
  });
  it('without a want type the old behaviour stands', () => {
    expect(chooseTexasFileResult([blankUnknown], { subdivision: 'WINNIE MAE ADDITION' })?.guid).toBe('U-1');
    expect(chooseTexasFileResult([lienOnLot], {})?.guid).toBe('L-1');
  });
  it('says what kind of instrument was wanted when nothing qualifies', () => {
    expect(describeNoChoice([deedOnLot], { name: 'CAFFREY BARBARA', subdivision: 'WINNIE MAE ADDITION', wantType: 'easement' }))
      .toContain('of easement/right-of-way type');
  });
});

describe('the wiring (check the CALLER)', () => {
  const orch = read('services/document-purchase-orchestrator.ts');
  it('a TexasFile document held by ANOTHER project is re-opened and filed here, not skipped', () => {
    expect(orch).toContain("const heldElsewhere = !!owned && owned.projectId !== projectId && /texasfile/i.test(owned.platformId);");
    expect(orch).toContain('if (owned && !heldElsewhere) {');
    expect(orch).toContain('if (guidHeld && !rec.vendorRef) rec.vendorRef = guidHeld;');
  });
  it('what the project already HOLDS (free captures included) is excluded from the vendor search', () => {
    expect(orch).toContain('const heldInstruments = (heldDocuments?.all() ?? [])');
    expect(orch).toContain('if (heldInstruments.length > 0) boughtThisRun.instruments.push(...heldInstruments);');
  });
  it('the want type reaches the chooser and the GUID reaches the ledger', () => {
    expect(orch).toContain("wantType: rec.documentType === 'easement' ? 'easement' : rec.documentType === 'plat' ? 'plat' : 'deed',");
    expect(orch).toContain('const soldGuid = result.vendorRef ?? rec.vendorRef;');
    const adapter = read('services/purchase-adapters/texasfile-purchase-adapter.ts');
    expect(adapter).toContain('result.vendorRef = buy.guid;');
    expect(adapter).toContain('wantType: hints.wantType,');
    expect(read('types/purchase.ts')).toContain('vendorRef?: string;');
  });
  it('the end-of-run artifact step files inside a filing context, with the run id', () => {
    const src = read('index.ts');
    expect(src).toContain('persistCountyResults(projectId, r, tailRunId, county ?? \'Bell\')');
    expect(src).toContain('const tailRunId = activePipelines.get(projectId)?.runId ?? null;');
    expect(src).toContain('await beginFiling(supabase as never, projectId, county, runId, round);');
    expect(src).toContain('const tally = endFiling(projectId);');
  });
  it('the read pass takes deeds, plats and easements before screenshots', () => {
    const src = read('index.ts');
    expect(src).toContain("const rank = (t: string | null) => (/^(plat|deed|easement|survey)$/i.test(t ?? '') ? 0 : 1);");
    expect(src).toContain('.sort((a, b) => a.rank - b.rank || a.i - b.i)');
  });
});

describe('N — the review cap is the REVIEW\'s spend, not the project\'s', () => {
  it('the read pass measures spend from its own start', () => {
    const src = read('index.ts');
    expect(src).toContain('const spendAtStart = spendForRun(projectId);');
    expect(src).toContain("const mayContinue = () => benchmark || checkBudget(projectId, spendForRun(projectId) - spendAtStart).exceeded !== 'cost';");
    expect(src).not.toContain("checkBudget(projectId, spendForRun(projectId)).exceeded !== 'cost'");
  });
});

describe('Q/R — run 5 (2026-09-07): no second plat row, no second screenshot row', () => {
  it('a plat want is dropped when the project already holds the subdivision\'s plat', () => {
    const src = read('index.ts');
    expect(src).toContain('async function projectHoldsPlat(projectId: string, subdivision: string | null): Promise<string | null> {');
    expect(src).toContain("const heldPlat = await projectHoldsPlat(projectId, r.property?.subdivisionName ?? null);");
    expect(src).toContain("recs = recs.filter((x) => x.documentType !== 'plat');");
    expect(src).toContain(".eq('document_type', 'plat')");
  });
  it('a row with the same label and source on the same project is the same document', () => {
    const up = read('services/artifact-uploader.ts');
    expect(up).toContain("if (label && sourceUrl && !row.recording_info) {");
    expect(up).toContain(".eq('document_label', label)");
    expect(up).toContain(".eq('source_url', sourceUrl)");
    expect(up).toContain("return { error: null, id: hit.id, outcome: 'merged' };");
  });
});

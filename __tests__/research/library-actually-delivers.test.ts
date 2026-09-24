// __tests__/research/library-actually-delivers.test.ts
//
// Owner, 2026-09-23: "Are all of the bell county files available to view? Are they fully integrated
// into the research pipeline so that if the user is searching in bell county that it checks the
// library quickly to see if anything matches?"
//
// The answer was no on both counts, in two ways that each looked like success from the outside.
//
// ── 1. A HIT MADE THE RUN WORSE THAN A MISS ─────────────────────────────────────────────────────
//
// `projectHoldsPlat` returned the LABEL of a plat the firm held on some other project, and the
// caller used that label to drop the plat from the run's wants — the free county portal was not
// asked and TexasFile's copy was not bought. Nothing filed the held document on the project. So a
// run that MATCHED the library finished with no plat at all, while a run that missed it fetched
// one. The library was worst exactly where it was best stocked.
//
// ── 2. THE PAGE CALLED "DOCUMENT LIBRARY" COULD NOT SEE THE LIBRARY ─────────────────────────────
//
// It scoped documents to `research_projects.created_by = you`. The 8,077 Bell plats sit on a
// project owned by `library@starr-surveying.com`, which nobody signs in as, so the page showed zero
// of them to every person including the one who imported them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { attachHeldDocument, libraryCountyKey as workerKey, type HeldDocument } from '@/worker/src/research/document-library';
import { libraryCountyKey as appKey } from '@/lib/research/county-key';
import { expectOrder } from '../helpers/expect-order';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

const HELD: HeldDocument = {
  id: 'lib-1', label: 'GLENDALE ADDITION', documentType: 'plat', countyFips: 'bell',
  identityKey: null, contentSha256: 'abc123', storagePath: 'library/bell/plats/glendale.pdf',
  storageUrl: 'https://x/glendale.pdf', pagesPdfUrl: 'https://x/glendale.pdf',
  recordedDate: null, recordingInfo: null, pageCount: 2,
  researchProjectId: 'lib-project', provenance: 'public_record', sourceVendor: 'county_portal',
  // The reading the firm already did. It travels with the document (2026-09-24) so a run that hits
  // the library gets a sheet that is already analysed rather than one queued to be read again.
  extractedText: null, extractedTextMethod: null,
  catalogue: { subdivision_name: { value: 'GLENDALE ADDITION', confidence: 'high', source_text: 'GLENDALE ADDITION' } },
  catalogueModel: 'claude-sonnet-5', catalogueVersion: 2, cataloguedAt: '2026-09-24T00:00:00Z',
  surveyorVerification: [{ verdict: 'confirmed' }], surveyorCertainty: [{ certainty: 'verified' }],
  processingStatus: 'analyzed',
};

/** A Supabase stand-in that records what was inserted. */
function db(existing: unknown[] = [], failWith?: string) {
  const inserted: Array<Record<string, unknown>> = [];
  return {
    inserted,
    client: {
      from() {
        const api: Record<string, unknown> = {};
        api.select = () => api;
        api.eq = () => api;
        api.limit = () => Promise.resolve({ data: existing, error: null });
        api.insert = (row: Record<string, unknown>) => {
          if (failWith) return Promise.resolve({ error: { message: failWith } });
          inserted.push(row);
          return Promise.resolve({ error: null });
        };
        return api;
      },
    },
  };
}

describe('a library hit files the document, it does not merely name it', () => {
  it('inserts a row on the project that needed it', async () => {
    const d = db();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await attachHeldDocument(d.client as any, 'proj-9', HELD);
    expect(res.attached).toBe(true);
    expect(d.inserted).toHaveLength(1);
    expect(d.inserted[0].research_project_id).toBe('proj-9');
    expect(d.inserted[0].document_label).toBe('GLENDALE ADDITION');
  });

  it('points at the same file rather than copying 19 GB around', async () => {
    const d = db();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await attachHeldDocument(d.client as any, 'proj-9', HELD);
    expect(d.inserted[0].storage_path).toBe(HELD.storagePath);
  });

  it('records where it came from without marking itself redundant', async () => {
    // `duplicate_of` means "ignore this row". These rows are the REASON the project has the plat,
    // so setting it would hide the document from the very run that needed it.
    const d = db();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await attachHeldDocument(d.client as any, 'proj-9', HELD);
    expect(d.inserted[0].duplicate_of).toBeUndefined();
    expect((d.inserted[0].harvest_metadata as { from_library_document_id?: string }).from_library_document_id).toBe('lib-1');
  });

  it('brings the analysis with it, so the run does not re-read a sheet the firm has read', async () => {
    // Owner, 2026-09-24: "the document analysis would already be completed." Attaching bytes with
    // no reading would make a library HIT cost the same as a miss — the sheet gets read twice and
    // the saving the library exists for never arrives.
    const d = db();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await attachHeldDocument(d.client as any, 'proj-9', HELD);
    expect(d.inserted[0].catalogue).toEqual(HELD.catalogue);
    expect(d.inserted[0].surveyor_certainty).toEqual(HELD.surveyorCertainty);
    expect(d.inserted[0].catalogued_at).toBe(HELD.cataloguedAt);
    // …and it is not queued for re-analysis.
    expect(d.inserted[0].processing_status).toBe('analyzed');
  });

  it('still queues an UNREAD library document for analysis rather than claiming it is done', async () => {
    const d = db();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await attachHeldDocument(d.client as any, 'proj-9', { ...HELD, cataloguedAt: null, catalogue: null, processingStatus: null });
    expect(d.inserted[0].processing_status).toBe('pending');
  });

  it('is not itself shareable, so the library does not count the same bytes twice', async () => {
    const d = db();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await attachHeldDocument(d.client as any, 'proj-9', HELD);
    expect(d.inserted[0].shareable).toBe(false);
  });

  it('refuses a held row with no file behind it', async () => {
    // Five Bell rows are index-only — the plat was over the 50 MB upload cap. Attaching one would
    // satisfy the plat want with something that 404s when somebody clicks it.
    const d = db();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await attachHeldDocument(d.client as any, 'proj-9', { ...HELD, storagePath: null });
    expect(res.attached).toBe(false);
    expect(d.inserted).toHaveLength(0);
  });

  it('does not file the same document twice in one run', async () => {
    const d = db([{ id: 'already-here' }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await attachHeldDocument(d.client as any, 'proj-9', HELD);
    expect(res.attached).toBe(true);
    expect(d.inserted).toHaveLength(0);
  });

  it('reports failure rather than claiming success', async () => {
    const d = db([], 'insert exploded');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await attachHeldDocument(d.client as any, 'proj-9', HELD);
    expect(res.attached).toBe(false);
  });
});

describe('the run only skips fetching once the plat is actually on the project', () => {
  const src = read('worker/src/index.ts');

  it('projectHoldsPlat attaches before it returns a label', () => {
    expect(src).toContain('attachHeldDocument');
    // The label is what suppresses the fetch, so returning it without filing is the whole bug.
    expect(src).toContain('could not be filed');
  });

  it('a failed attach reports a miss, so the run fetches the plat the ordinary way', () => {
    // A slower run beats a run that quietly produces no plat.
    const fn = src.slice(src.indexOf('async function projectHoldsPlat'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/if \(!filed\.attached\)[\s\S]{0,400}return null;/);
  });

  it('the late purchase pass consults the library too', () => {
    // It passed no county, so it returned before reaching the library and the firm could buy a plat
    // it already owned.
    expect(src).toContain('`county` passed since 2026-09-23');
  });
});

describe('the firm does not buy what it already owns', () => {
  const src = read('worker/src/index.ts');

  it('asks the library by citation before paying for a document', () => {
    // `heldByCitation` was written for exactly this and had zero callers, so the same instrument
    // was bought again every time a second project needed it. Citation is the only identity that
    // survives crossing vendors: one deed is `2019-12345` on TexasFile and `V9251 P668` on the
    // county portal.
    expect(src).toContain('heldByCitation');
    // Scoped to this purchase pass: there are three `new DocumentPurchaseOrchestrator` in the file
    // and a whole-file ordering check would measure against whichever came first, which is a
    // different code path entirely.
    const pass = src.slice(src.indexOf('DO WE ALREADY OWN THIS?'));
    expectOrder(pass, 'heldByCitation', 'new DocumentPurchaseOrchestrator', 'library is consulted before buying');
  });

  it('FILES what it finds before dropping it from the buy list', () => {
    // A skipped purchase that leaves the project empty is not a saving, it is a silent gap — the
    // exact failure the plat branch already produced once.
    const block = src.slice(src.indexOf('DO WE ALREADY OWN THIS?'));
    const body = block.slice(0, block.indexOf('const permission = await resolvePurchasePermission'));
    expectOrder(body, 'attachHeldDocument', 'keep.push(rec)', 'attach is attempted before the record is kept or dropped');
    expect(body).toContain('filed?.attached');
  });

  it('a record is only dropped when filing actually succeeded', () => {
    const block = src.slice(src.indexOf('DO WE ALREADY OWN THIS?'));
    // The `else` branch keeps the record, so a failed attach means the document is still bought.
    expect(block).toMatch(/if \(filed\?\.attached\)[\s\S]{0,400}\} else \{[\s\S]{0,120}keep\.push\(rec\);/);
  });

  it('a library failure never blocks a purchase the operator asked for', () => {
    const block = src.slice(src.indexOf('DO WE ALREADY OWN THIS?'));
    expect(block).toContain('library-before-buy check failed');
  });
});

describe('the Document Library page can see the firm library', () => {
  const route = read('app/api/admin/research/library/route.ts');

  it('includes shareable documents, not only your own projects', () => {
    expect(route).toContain('shareable.eq.true');
  });

  it('still works for somebody who owns no projects at all', () => {
    // The old code returned an empty page the moment you had no projects of your own, which is
    // precisely the state a new employee is in.
    expect(route).toContain("'shareable.eq.true'");
    expect(route).not.toMatch(/if \(projectIds\.length === 0\) \{\s*return NextResponse\.json\(\{\s*documents: \[\]/);
  });

  it('filters county on the document, not on its holding project', () => {
    // A shared row's parent project is the library holding pen and has no meaningful county, so
    // filtering through the project hid every shared row.
    expect(route).toContain("query.eq('county_fips'");
  });

  it('counts stats over the same scope it lists', () => {
    // Stats scoped narrower than the listing is how a page says "0 documents" above a list of them.
    const stats = route.slice(route.indexOf('// 5. Compute stats'));
    expect(stats).toContain('.or(ownScope)');
  });
});

describe('the app and the worker spell a county the same way', () => {
  it('agree on every shape', () => {
    // They are separate builds and cannot import from each other, so the copy is deliberate. What
    // matters is that they never disagree: a library asked in the wrong case answers "no", and the
    // run then pays for a document the firm already owns.
    for (const raw of ['Bell', 'BELL', 'bell county', 'Bell County', '48027', ' 48027 ', '', 'Jim Wells']) {
      expect(appKey(raw), `disagreement on "${raw}"`).toBe(workerKey(raw));
    }
  });
});

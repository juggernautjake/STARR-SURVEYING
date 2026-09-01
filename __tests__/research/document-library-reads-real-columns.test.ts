// __tests__/research/document-library-reads-real-columns.test.ts
//
// ── THE DOCUMENT LIBRARY HAD NEVER WORKED ───────────────────────────────────────────────────────
//
// Found 2026-08-31, by photographing the screen rather than by any assertion. `/admin/research/
// [projectId]/documents` rendered **seventeen empty boxes**: the header said "17 documents", the
// filter chips were right, and every row was blank.
//
//     const data = (await res.json()) as { documents: ResearchDocument[] };
//
// The interface declared `documentId`, `type`, `instrumentNumber`, `description`, `grantor`,
// `grantee`, `recordedDate`, `pageCount`, `fileFormat`, `sizeBytes`, `purchased` and `source`. The
// route does `select('*')` on `research_documents`, whose columns are `id`, `document_type`,
// `document_label`, `original_filename`, `page_count`, `file_size_bytes`, `recorded_date`,
// `source_type`, `storage_url` and so on.
//
// **Not one field matched.** Every value was `undefined`. `DOC_TYPE_ICONS[doc.type]` was
// `undefined`, and `key={doc.documentId}` was `undefined` for all seventeen rows simultaneously.
//
// Nothing errored, `tsc` was happy, the page loaded, the count was correct, and the symptom was
// silence. Fourth instance in this repository of a hand-written interface describing an object
// nobody produces — after `activity_log`'s action/details, `research_documents.analysis_metadata`,
// and the owner name in G10.
//
// ── SO THE TEST IS THE COLUMN LIST, AGAINST THE SEEDS ───────────────────────────────────────────
//
// Same source of truth as `writes-hit-real-columns.test.ts`: the `create table` statements in
// `seeds/`. A cast inside a `.tsx` is a claim nobody can check. A key list beside a shaping
// function is a claim a test can refuse.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripJs } from '@/scripts/audit-research-contrast.mjs';
import {
  toCard, toCards, kindOf, titleOf, instrumentOf, isImageRow, sourceLabelOf, formatBytes,
  DOCUMENT_ROW_COLUMNS, NEVER_PRODUCED_KEYS, statusLabel, KNOWN_STATUSES, pageImagesOf, toLibraryCard, toLibraryCards, type DocumentRow,
} from '@/app/admin/research/[projectId]/documents/document-rows';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Every column of `research_documents`, from the `create table` and `alter table` in seeds/. */
function documentColumns(): Set<string> {
  const dir = path.join(ROOT, 'seeds');
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

  const cols = new Set<string>();
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?research_documents\s*\(([\s\S]*?)\n\s*\);/gi)) {
    for (const raw of m[1].split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('--')) continue;
      const name = /^([a-z_][a-z0-9_]*)\s+/i.exec(line)?.[1]?.toLowerCase();
      if (name && !['primary', 'foreign', 'unique', 'constraint', 'check'].includes(name)) cols.add(name);
    }
  }
  // Columns added later live in `alter table … add column`, and the library reads several of them.
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?research_documents\s+([\s\S]*?);/gi)) {
    for (const a of m[1].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi)) {
      cols.add(a[1].toLowerCase());
    }
  }
  return cols;
}

const COLUMNS = documentColumns();

describe('the schema this is checked against', () => {
  it('found the table', () => {
    // Control. An empty set agrees with every key, and this whole file would pass by measuring
    // nothing — which is precisely the failure mode being guarded against.
    expect(COLUMNS.size, 'no research_documents columns were parsed out of seeds/').toBeGreaterThan(10);
    expect(COLUMNS.has('id')).toBe(true);
    expect(COLUMNS.has('research_project_id')).toBe(true);
  });

  it('and does not contain a column nobody defined', () => {
    expect(COLUMNS.has('zzz_not_a_column')).toBe(false);
  });
});

describe('every column the library reads exists', () => {
  it.each([...DOCUMENT_ROW_COLUMNS])('%s is a real column', (col) => {
    expect(
      COLUMNS.has(col),
      `The Document Library reads \`${col}\` and research_documents has no such column. `
      + 'Every row will render that field blank, which is exactly how this page shipped.',
    ).toBe(true);
  });

  it('has a list to check', () => {
    expect(DOCUMENT_ROW_COLUMNS.length).toBeGreaterThanOrEqual(15);
  });
});

describe('and the names it used to read exist nowhere', () => {
  // The other direction, and the one that makes the finding legible: these are the twelve the
  // broken cast declared. Keeping them asserted means the cast cannot quietly come back.
  it.each([...NEVER_PRODUCED_KEYS])('%s is NOT a column', (key) => {
    expect(COLUMNS.has(key), `${key} is a column now — the note in document-rows.ts is stale`)
      .toBe(false);
  });

  it('and the page no longer declares them', () => {
    const page = read('app/admin/research/[projectId]/documents/page.tsx');
    expect(page, 'the camelCase cast is back').not.toContain('documentId: string;');
    expect(page).not.toContain('instrumentNumber?: string;');
  });

  it('the page uses the shaping module', () => {
    const page = read('app/admin/research/[projectId]/documents/page.tsx');
    expect(page).toContain("from './document-rows'");
    expect(page).toContain('toCards(');
  });
});

// ── The shaping ─────────────────────────────────────────────────────────────────────────────────

const row = (over: Partial<DocumentRow> = {}): DocumentRow => ({ id: 'abc12345-0000', ...over });

describe('a row becomes something a person can read', () => {
  it('NEVER renders a blank title', () => {
    // The whole finding in one assertion. A row with nothing in it is indistinguishable from a
    // rendering bug — because it was one, seventeen times.
    for (const r of [row(), row({ document_label: '' }), row({ original_filename: '   ' })]) {
      expect(toCard(r).title.trim().length, JSON.stringify(r)).toBeGreaterThan(0);
    }
  });

  it('prefers the label, then the filename, then the id', () => {
    expect(titleOf(row({ document_label: 'EASEMENT — A to B', original_filename: 'deed_1' })))
      .toBe('EASEMENT — A to B');
    expect(titleOf(row({ original_filename: 'deed_1945006189' }))).toBe('deed_1945006189');
    expect(titleOf(row())).toContain('abc12345');
  });

  it('folds document_type into the four kinds the filter bar offers', () => {
    expect(kindOf(row({ document_type: 'deed' }))).toBe('deed');
    expect(kindOf(row({ document_type: 'Plat' }))).toBe('plat');
    expect(kindOf(row({ document_type: 'restrictive_covenant' }))).toBe('other');
    expect(kindOf(row({ document_type: null }))).toBe('other');
  });

  it('pulls the instrument number out of the label when the column has none', () => {
    expect(instrumentOf(row({ document_label: 'JUDGMENT (Instr. 1945006189) (2 pages)' })))
      .toBe('1945006189');
    expect(instrumentOf(row({ recording_info: { instrument_number: '2004045569' } })))
      .toBe('2004045569');
    expect(instrumentOf(row({ document_label: 'A deed with no number' }))).toBeNull();
  });

  it('distinguishes what a person uploaded from what the run retrieved', () => {
    // The owner asked to upload their own files AND to check what was retrieved. If the two look
    // identical in the list, neither question can be answered from it.
    expect(toCard(row({ source_type: 'user_upload' })).isUpload).toBe(true);
    expect(toCard(row({ source_type: 'clerk_portal' })).isUpload).toBe(false);
    expect(sourceLabelOf(row({ source_type: 'user_upload' }))).toBe('Uploaded');
    expect(sourceLabelOf(row({ source_type: 'clerk_portal' }))).toBe('Clerk Portal');
    expect(sourceLabelOf(row({ source_type: null }))).toBe('Retrieved');
  });

  it('knows what can be SHOWN rather than only downloaded', () => {
    // "be able to view all images" — a plat you cannot see at full size is a plat you have not
    // checked.
    expect(isImageRow(row({ file_type: 'image/jpeg' }))).toBe(true);
    expect(isImageRow(row({ file_type: 'tif' }))).toBe(true);
    expect(isImageRow(row({ file_type: 'application/pdf' }))).toBe(false);
    expect(isImageRow(row({ file_type: null }))).toBe(false);
  });

  it('prefers the rendered PDF over the raw file, and falls back to the source', () => {
    expect(toCard(row({ pages_pdf_url: 'a', storage_url: 'b', source_url: 'c' })).fileUrl).toBe('a');
    expect(toCard(row({ storage_url: 'b', source_url: 'c' })).fileUrl).toBe('b');
    expect(toCard(row({ source_url: 'c' })).fileUrl).toBe('c');
    expect(toCard(row()).fileUrl).toBeNull();
  });

  it('coerces counts rather than rendering NaN or undefined', () => {
    expect(toCard(row({ page_count: 3, file_size_bytes: 2048 })).pageCount).toBe(3);
    expect(toCard(row({ page_count: null })).pageCount).toBeNull();
    expect(toCard(row({ page_count: 'three' as unknown as number })).pageCount).toBeNull();
  });

  it('survives a payload of the wrong shape', () => {
    for (const junk of [null, undefined, 'nope', 42, {}, { documents: 'nope' }]) {
      expect(() => toCards(junk), String(junk)).not.toThrow();
      expect(toCards(junk)).toEqual([]);
    }
  });

  it('accepts both the wrapper and a bare array', () => {
    // The API returns `{ documents: [...] }`. It has returned a bare array elsewhere in this
    // codebase, and a list page that renders nothing is the most expensive way to find out.
    expect(toCards({ documents: [row({ document_label: 'A' })] })).toHaveLength(1);
    expect(toCards([row({ document_label: 'A' })])).toHaveLength(1);
  });

  it('drops a row with no id rather than rendering it with an undefined key', () => {
    // `key={undefined}` on seventeen siblings is a React key collision on top of a blank row.
    expect(toCards({ documents: [{ document_label: 'no id' }, row()] })).toHaveLength(1);
  });

  it('formats sizes, and says nothing when there is no size', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(709976)).toBe('693.3 KB');
    expect(formatBytes(2_200_000)).toBe('2.1 MB');
    expect(formatBytes(null)).toBe('');
  });
});

// ── ONE VOCABULARY FOR `processing_status` ──────────────────────────────────────────────────────
//
// The project page and the Document Library showed the same seventeen documents with different
// words. `DocumentUploadPanel` had a six-entry map and fell back to `PROCESSING_STATUS_LABELS
// .pending` for everything else — and `unreadable` was not one of the six. Seventeen documents the
// pipeline could not read were reported, permanently, as **"Pending"**.
//
// "Pending" means give it a minute. These needed somebody to look at them.

describe('one status vocabulary, shared by both screens', () => {
  it('knows the status the fallback used to swallow', () => {
    expect(statusLabel('unreadable').label).toBe('Unreadable');
    expect(statusLabel('unreadable').tone, 'unreadable is a failure, not a neutral state').toBe('bad');
  });

  it('NEVER invents a friendlier word than the truth', () => {
    // The whole finding. An unknown status renders as itself; it does not become "Pending".
    const unknown = statusLabel('some_new_status');
    expect(unknown.label).toBe('some new status');
    expect(unknown.label.toLowerCase()).not.toBe('pending');
  });

  it('and an absent status says so', () => {
    expect(statusLabel(null).label).toBe('Unknown');
    expect(statusLabel(undefined).label).toBe('Unknown');
    expect(statusLabel('').label).toBe('Unknown');
  });

  it('covers every status the codebase actually sets', () => {
    // Swept rather than typed: a status written somewhere and unknown here is the next
    // "Pending"-for-unreadable waiting to happen.
    for (const s of ['pending', 'extracting', 'extracted', 'analyzing', 'analyzed', 'unreadable', 'failed', 'error']) {
      expect(KNOWN_STATUSES, `${s} is set in the codebase and has no label`).toContain(s);
    }
  });

  it('and BOTH screens read it', () => {
    // "Authored but not wired", the shared-module edition. A vocabulary only one screen uses is
    // exactly the situation that produced the disagreement.
    const panel = read('app/admin/research/components/DocumentUploadPanel.tsx');
    const library = read('app/admin/research/[projectId]/documents/page.tsx');
    expect(panel).toContain('statusLabel(doc.processing_status)');
    expect(library).toContain('statusLabel(doc.status)');
    // stripJs, because the first version of this matched the COMMENT in DocumentUploadPanel that
    // explains what the old fallback did. Eleventh time a check in this repository has read its
    // own prose as evidence; the control below asserts both directions.
    expect(stripJs(panel), 'the six-entry map with the lying fallback is back')
      .not.toContain('PROCESSING_STATUS_LABELS.pending');
  });

  it('and that check reads CODE, not the note explaining the old bug', () => {
    const panel = read('app/admin/research/components/DocumentUploadPanel.tsx');
    expect(panel, 'the explanatory comment is gone, so the control above is vacuous')
      .toContain('PROCESSING_STATUS_LABELS.pending');
    expect(stripJs("const a = 1; // PROCESSING_STATUS_LABELS.pending")).not.toContain('PROCESSING_STATUS_LABELS');
    expect(stripJs("const x = PROCESSING_STATUS_LABELS.pending;"), 'the stripper is eating code')
      .toContain('PROCESSING_STATUS_LABELS');
  });

  it('and neither one paints it in a colour that cannot be read', () => {
    // `#F59E0B` is 2.15:1 on white and `#059669` is 3.77:1 — both were in the old map, and both are
    // hexes this repository retired on 2026-08-31.
    const panel = read('app/admin/research/components/DocumentUploadPanel.tsx');
    for (const hex of ['#F59E0B', '#059669']) {
      expect(panel, `${hex} is back in the status colours`).not.toContain(`working: '${hex}'`);
    }
  });
});

// ── EVERY PAGE OF EVERY DOCUMENT IS AN IMAGE, AND THE LIBRARY SAID THERE WERE NONE ─────────────
//
// Owner: *"be able to view all images"*.
//
// Measured on the live project: 17 documents, `file_type` `'pdf'` on every one, and a header
// reading **"0 viewable images"**. `ocr_regions` holds `pageUrls` — a rendered PNG per page,
// uploaded by the artifact uploader — and it arrives from PostgREST as a JSON **string**. Reading
// `.pageUrls` off the string gives `undefined`; iterating its keys gives `0, 1, 2 … 343`, which is
// how a 343-character string looks when you mistake it for an object.
//
// `SourceDocumentViewer` had this extractor all along. It moved to the shared module rather than
// being written a second time: two parsers for one column is how they come to disagree about
// whether a document has pages.

describe('page images', () => {
  const withRegions = (regions: unknown, over: Partial<DocumentRow> = {}): DocumentRow =>
    ({ id: 'abc12345-0000', ocr_regions: regions, ...over });

  it('parses pageUrls out of the JSON STRING PostgREST returns', () => {
    // The whole finding. An object works too, but the string is what actually arrives.
    const asString = JSON.stringify({ pageUrls: ['https://x/p1.png', 'https://x/p2.png'] });
    expect(pageImagesOf(withRegions(asString))).toHaveLength(2);
    expect(pageImagesOf(withRegions({ pageUrls: ['https://x/p1.png'] }))).toHaveLength(1);
  });

  it('and a PDF with rendered pages counts as viewable', () => {
    // `file_type: 'pdf'` on every document in the live project. Keying "is there an image" off the
    // file type reported zero on a project holding dozens.
    const card = toCard(withRegions(
      JSON.stringify({ pageUrls: ['https://x/p1.png'] }),
      { file_type: 'pdf' },
    ));
    expect(card.isImage, 'the FILE is still a pdf').toBe(false);
    expect(card.pageImages, 'but its pages are viewable').toHaveLength(1);
  });

  it('survives ocr_regions that is not JSON at all', () => {
    for (const junk of ['not json', '', null, undefined, 42, []]) {
      expect(() => pageImagesOf(withRegions(junk)), String(junk)).not.toThrow();
    }
    expect(pageImagesOf(withRegions('not json'))).toEqual([]);
  });

  it('and drops entries that are not usable URLs', () => {
    const regions = JSON.stringify({ pageUrls: ['https://x/p1.png', '', null, 42] });
    expect(pageImagesOf(withRegions(regions))).toEqual(['https://x/p1.png']);
  });

  it('falls back to the file itself when it IS an image', () => {
    expect(pageImagesOf({ id: 'a', storage_url: 'https://x/plat.png' })).toEqual(['https://x/plat.png']);
    expect(pageImagesOf({ id: 'a', storage_url: 'https://x/deed.pdf' })).toEqual([]);
  });

  it('the library counts PAGES, not files whose type happens to be an image', () => {
    const page = read('app/admin/research/[projectId]/documents/page.tsx');
    expect(page).toContain('n + d.pageImages.length');
    expect(page, 'the header still promises "viewable images" from file_type')
      .not.toContain('documents.filter((d) => d.isImage).length');
  });

  it('and the viewer shows the pages before falling back to a PDF frame', () => {
    // Pages scroll, zoom, open full size, and work where a browser's PDF plugin does not.
    const page = read('app/admin/research/[projectId]/documents/page.tsx');
    const pages = page.indexOf('selected.pageImages.length > 0 ?');
    const pdf = page.indexOf("type=\"application/pdf\"");
    expect(pages, 'the page gallery is gone').toBeGreaterThan(-1);
    expect(pages, 'the PDF frame wins over the rendered pages').toBeLessThan(pdf);
  });

  it('and `ocr_regions` is a column that exists', () => {
    expect(COLUMNS.has('ocr_regions')).toBe(true);
    expect(DOCUMENT_ROW_COLUMNS).toContain('ocr_regions');
  });
});

// ── AND THE PORTAL-WIDE LIBRARY TAB HAD THE SAME DEFECT, IN A SECOND FILE ──────────────────────
//
// Found the same way — by looking at `library--desktop.png`. Seventeen rows, all blank, and a
// header reading **"17 purchased · $0.00 spent"**.
//
// `_tabs/LibraryTab.tsx` cast `/api/admin/research/library`'s response to its own `LibraryDocument`
// (`documentId`, `instrumentNumber`, `description`, `grantor`, `grantee`, `purchased`,
// `usedInAnalysis`, `relevanceScore`, `fileFormat`). That route returns the same raw
// `research_documents` rows the per-project one does, plus a `project` join. Every field was
// `undefined`.
//
// The bug had already been found once, in a different file, which is exactly why nobody looked.

describe('the portal-wide Library reads the same real shape', () => {
  const TAB = read('app/admin/research/_tabs/LibraryTab.tsx');

  it('uses the shared shaping rather than a third cast', () => {
    // A third hand-written cast against one table is how a fix in one place leaves the other two
    // broken — which is precisely what happened between these two screens.
    expect(TAB).toContain('toLibraryCards(');
    expect(TAB, 'the fictional interface is back').not.toContain('documentId: string;');
    expect(TAB).not.toContain('relevanceScore?: number;');
  });

  it('and one formatBytes, not two', () => {
    expect(stripJs(TAB), 'the local copy is back').not.toContain('function formatBytes(');
  });

  it('the project join comes through', () => {
    const card = toLibraryCard({
      id: 'a', document_label: 'DEED', research_project_id: 'p1',
      project: { id: 'p1', property_address: '16991 Pecan School Rd', county: 'Bell' },
    });
    expect(card.projectId).toBe('p1');
    expect(card.projectAddress).toBe('16991 Pecan School Rd');
    expect(card.countyName).toBe('Bell');
    expect(card.title).toBe('DEED');
  });

  it('and falls back to the id column when the join is absent', () => {
    expect(toLibraryCard({ id: 'a', research_project_id: 'p1' }).projectId).toBe('p1');
    expect(toLibraryCard({ id: 'a' }).projectId).toBeNull();
  });

  it('drops rows with no id, like the per-project list', () => {
    expect(toLibraryCards({ documents: [{ document_label: 'no id' }, { id: 'a' }] })).toHaveLength(1);
  });

  it('the filters no longer key on fields that do not exist', () => {
    // `purchased` and `relevanceScore` were both `undefined` on every row, so the "Purchased" chip
    // matched nothing on every project and the "relevance" sort was a no-op that looked like an
    // option. Both are real questions now — was it uploaded by us, and which is the big plat.
    expect(TAB).toContain("if (filter === 'uploaded') return doc.isUpload;");
    expect(TAB).toContain('(b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)');
  });
});

describe('"17 purchased · $0.00 spent" was a self-contradiction', () => {
  const ROUTE = read('app/api/admin/research/library/route.ts');

  it('counts purchases from the purchases table', () => {
    // It counted every document whose `source_type` was `property_search` or `linked_reference` —
    // everything the pipeline RETRIEVED, free or not — so a firm with zero rows in
    // `research_document_purchases` was told it had bought seventeen documents.
    expect(ROUTE).toContain("from('research_document_purchases')");
    expect(ROUTE, 'the retrieved-means-purchased rule is back')
      .not.toContain("d.source_type === 'property_search' || d.source_type === 'linked_reference'");
  });

  it('and only `completed` counts', () => {
    // The seed's partial unique index says why: a failed attempt is a record, not a claim of
    // ownership, and a refund releases the document to be bought again.
    expect(ROUTE).toContain("eq('status', 'completed')");
  });

  it('so the money is real rather than a hard-coded zero', () => {
    // Scoped to the block that builds the REAL stats. A whole-file scan flags the two
    // `{ totalDocuments: 0, totalPurchased: 0, totalSpent: 0, … }` empty-state responses, which are
    // correct — a firm with no projects has spent nothing — and a check that sends somebody to
    // "fix" working code is worse than no check.
    const at = ROUTE.indexOf('const totalSpent =');
    expect(at, 'the computed total is gone').toBeGreaterThan(-1);
    expect(ROUTE).toContain('Number(p.cost_usd ?? 0)');
    expect(stripJs(ROUTE), 'the TODO is back').not.toContain('TODO: integrate with billing tracker');
  });
});

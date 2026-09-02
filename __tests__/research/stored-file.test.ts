// __tests__/research/stored-file.test.ts
//
// ── TWENTY-TWO ROWS ADVERTISING A FILE THAT WAS NEVER WRITTEN ───────────────────────────────────
//
// Measured against the live database 2026-09-01, and the numbers are what make this worth a module:
//
//     storage_path IS NULL  AND storage_url IS NOT NULL   →  22 rows   (11 aerial_photo, 11 topo_map)
//     storage_path IS NOT NULL AND storage_url IS NULL    →   0 rows   ← CONTROL: the inverse never happens
//     spread across                                          10 projects
//     total rows                                            671
//
// The write-side cause was fixed on 2026-08-30: `getPublicUrl` BUILDS a string and never asks the
// bucket whether anything is there, so three services called it right after code that deliberately
// tolerates a failed upload. The row then said two opposite things at once — `storage_path: null`
// meaning *not stored*, beside a `storage_url` meaning *here it is*.
//
// **Nothing on the read side consulted `storage_path` at all.** Every viewer decided "is this
// viewable" from `storage_url` alone, so ten projects each offered artifacts that opened to a
// broken image. That is this repository's signature shape — a gap between a producer and a consumer
// that nothing compares — and it is the same one as "the Document Library rendered seventeen empty
// boxes" and "0 viewable images on a project holding 73 of them".
//
// ── WHY A READ-SIDE FIX AND NOT ONLY THE PARKED SQL REPAIR ──────────────────────────────────────
//
// The planning doc parks an `UPDATE … SET storage_url = NULL` for the owner to authorise, and that
// is still worth doing. It is not what makes the app correct: a data repair fixes the rows that
// exist, and this fixes those *and* any row written tomorrow by a path nobody has audited.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  hasStoredFile, storedFileUrl, advertisesMissingFile, selectsStoragePath,
} from '@/lib/research/stored-file';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const URL_ = 'https://x.supabase.co/storage/v1/object/public/research-documents/abc/topo_map_1.png';

describe('a storage_url is a claim, not a file', () => {
  it('a properly stored row is viewable', () => {
    expect(hasStoredFile({ storage_path: 'abc/topo_map_1.png', storage_url: URL_ })).toBe(true);
    expect(storedFileUrl({ storage_path: 'abc/topo_map_1.png', storage_url: URL_ })).toBe(URL_);
  });

  it('THE BUG: a null path means the upload never landed, whatever the url says', () => {
    expect(hasStoredFile({ storage_path: null, storage_url: URL_ })).toBe(false);
    expect(storedFileUrl({ storage_path: null, storage_url: URL_ })).toBeNull();
  });

  it('no url means nothing to show, however the path reads', () => {
    expect(hasStoredFile({ storage_path: 'abc/x.png', storage_url: null })).toBe(false);
    expect(hasStoredFile({ storage_path: null, storage_url: null })).toBe(false);
    expect(storedFileUrl({ storage_url: '' })).toBeNull();
  });

  // ── THE LINE THE WHOLE MODULE TURNS ON ───────────────────────────────────────────────────────
  it('an UNSELECTED path is not the same as an empty one', () => {
    // `null` = the column was read and is empty. `undefined` = the query did not ask for it. Those
    // are opposite facts wearing the same falsy value, and `document-rows.ts` did not select the
    // column until this slice.
    //
    // If absence were read as "not stored", every document on those screens would vanish the moment
    // this shipped — turning a 22-row cosmetic defect into a total blackout, silently. This
    // repository has already shipped that failure twice under the heading "0 viewable images on a
    // project holding 73 of them".
    expect(hasStoredFile({ storage_url: URL_ })).toBe(true);
    expect(storedFileUrl({ storage_url: URL_ })).toBe(URL_);
  });

  it('control: null and undefined really do take different branches', () => {
    // Without this the assertion above passes on an implementation that ignores the path entirely.
    expect(hasStoredFile({ storage_path: null, storage_url: URL_ }))
      .not.toBe(hasStoredFile({ storage_path: undefined, storage_url: URL_ }));
  });

  it('advertisesMissingFile names exactly the 22', () => {
    expect(advertisesMissingFile({ storage_path: null, storage_url: URL_ })).toBe(true);
    // Not a row that simply has no file.
    expect(advertisesMissingFile({ storage_path: null, storage_url: null })).toBe(false);
    // Not a healthy row.
    expect(advertisesMissingFile({ storage_path: 'a/b.png', storage_url: URL_ })).toBe(false);
    // Not a row whose path was never selected — we cannot accuse what we did not read.
    expect(advertisesMissingFile({ storage_url: URL_ })).toBe(false);
  });
});

describe('selectsStoragePath', () => {
  it('finds the column in the shapes a select list actually takes', () => {
    // Two forms reach this: a PostgREST string, and a TypeScript array of quoted column names.
    // The first version of the predicate handled only the first, and reported `storage_path`
    // missing from `DOCUMENT_ROW_COLUMNS` — a list that plainly contains it — because the
    // neighbouring characters there are apostrophes. A guard that cries wolf about correct code is
    // one somebody switches off.
    expect(selectsStoragePath('id, storage_path, storage_url')).toBe(true);
    expect(selectsStoragePath('storage_path')).toBe(true);
    expect(selectsStoragePath('id,storage_path,x')).toBe(true);
    expect(selectsStoragePath("'id, original_filename, storage_path, storage_url'")).toBe(true);
    expect(selectsStoragePath("  'storage_url',\n  'storage_path',\n")).toBe(true);
    expect(selectsStoragePath('`select id, storage_path from x`')).toBe(true);
  });

  it('and is not fooled by a column that merely contains the name', () => {
    // A substring match would accept `storage_path_backup` and certify a query that does not read
    // the column at all. Third time this week a substring flaw has been the defect.
    expect(selectsStoragePath('id, storage_path_backup, storage_url')).toBe(false);
    expect(selectsStoragePath('id, old_storage_path')).toBe(false);
  });

  it('control: a list without it is rejected', () => {
    expect(selectsStoragePath('id, storage_url, pages_pdf_url')).toBe(false);
    expect(selectsStoragePath('')).toBe(false);
  });
});

// ── THE CALLERS ─────────────────────────────────────────────────────────────────────────────────
//
// The module is safe by design when a caller forgets to select `storage_path` — it keeps today's
// behaviour rather than blanking the screen. That safety has a cost: the check becomes a silent
// no-op on that screen, which is exactly the state this whole slice exists to end. These assert the
// callers, because that is where the defect actually lived.

describe('every read path uses the predicate rather than the raw column', () => {
  /** Comments blanked, length-preserving — every one of these files now explains the change. */
  const stripJs = (src: string) =>
    src
      // Anchored to line starts: an unanchored `/*` strip begins a comment inside a string
      // containing `*/` — a MIME type like `text/plain, */*` blanked six thousand characters of the
      // worker's bis-cad.ts before that was noticed.
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));

  const CALLERS = [
    'app/admin/research/[projectId]/documents/document-rows.ts',
    'app/admin/research/components/SourceDocumentViewer.tsx',
    'app/admin/research/components/DocumentUploadPanel.tsx',
    // ResearchRunPanel was here until 2026-09-02. It was deleted, not un-wired: the one-view
    // rebuild superseded it and the orphan guard caught the 3,193 dead lines it left. The
    // predicate's caller on that surface is ResearchRunView, immediately below.
    'app/api/admin/research/[projectId]/artifacts/route.ts',
  ];

  it('control: every caller file exists and is real', () => {
    for (const f of CALLERS) {
      expect(fs.existsSync(path.join(ROOT, f)), `${f} is listed and missing`).toBe(true);
      expect(read(f).length).toBeGreaterThan(1000);
    }
  });

  it('each imports the shared predicate', () => {
    const missing = CALLERS.filter((f) => !read(f).includes("from '@/lib/research/stored-file'"));
    expect(missing, `these decide viewability without the predicate:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('the artifacts API nulls the url rather than passing the claim through', () => {
    const src = stripJs(read('app/api/admin/research/[projectId]/artifacts/route.ts'));
    expect(src).toContain('storageUrl: storedFileUrl(doc)');
    expect(src, 'the raw column is still being handed to the client')
      .not.toMatch(/storageUrl:\s*doc\.storage_url/);
  });

  it('and says so rather than dropping the document silently', () => {
    // A gallery that quietly shows ten of eleven aerial photos is a gallery where somebody counts
    // and has nothing to search for.
    expect(stripJs(read('app/api/admin/research/[projectId]/artifacts/route.ts')))
      .toContain('advertisesMissingFile(doc)');
    expect(stripJs(read('app/admin/research/components/ArtifactGallery.tsx')))
      .toContain('artifact.fileMissing');
  });

  it('the document row mapper no longer offers an unstored url as the file', () => {
    const src = stripJs(read('app/admin/research/[projectId]/documents/document-rows.ts'));
    expect(src).toContain('storedFileUrl(row)');
    expect(src, 'fileUrl still falls back to the raw column')
      .not.toMatch(/fileUrl:[^\n]*row\.storage_url/);
  });

  it('control: that negative assertion can fail', () => {
    expect(/fileUrl:[^\n]*row\.storage_url/.test('fileUrl: row.pages_pdf_url ?? row.storage_url,')).toBe(true);
    expect(/fileUrl:[^\n]*row\.storage_url/.test('fileUrl: row.pages_pdf_url ?? storedFileUrl(row),')).toBe(false);
  });
});

describe('and every research query that reads storage_url also selects storage_path', () => {
  // The module treats an unselected path as "cannot tell" and keeps today's behaviour — safe, and
  // silent. This is what stops "safe" from meaning "the check does nothing here".
  const FILES = [
    'app/admin/research/[projectId]/documents/document-rows.ts',
    'app/api/admin/research/[projectId]/artifacts/route.ts',
  ];

  it('control: the select lists were found', () => {
    for (const f of FILES) expect(read(f)).toContain('storage_url');
  });

  it('each one asks for the column it needs', () => {
    const missing = FILES.filter((f) => !selectsStoragePath(read(f)));
    expect(missing,
      `these read storage_url and never select storage_path, so the check is a no-op there:\n  ${missing.join('\n  ')}`)
      .toEqual([]);
  });

  it('and DOCUMENT_ROW_COLUMNS carries it, since that list IS the query', () => {
    const src = read('app/admin/research/[projectId]/documents/document-rows.ts');
    const at = src.indexOf('DOCUMENT_ROW_COLUMNS');
    expect(at).toBeGreaterThan(-1);
    const list = src.slice(at, src.indexOf('] as const', at));
    expect(list, 'the column list omits storage_path').toContain("'storage_path'");
  });
});

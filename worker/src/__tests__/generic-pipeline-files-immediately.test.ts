import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runScopedKey, genericDocumentRow, normaliseDocumentType } from '../research/file-generic-document.js';
import type { DocumentResult } from '../types/index.js';

// B2 — the immediacy guarantee, for the forty counties that are not Bell.
//
// `documents-are-filed-immediately.test.ts` guards the Bell orchestrator's seven incremental call
// sites. That test passing is what made this gap invisible: the guarantee held for the county with
// the guard and did not hold for any of the others.
//
// The generic pipeline accumulated documents in an array; the caller waited for the run to end,
// DELETED the project's previous `property_search` rows, and bulk-inserted. Both halves were wrong,
// and the delete was the worse of the two — a re-run destroyed what the last run found, and a run
// that crashed after it left the project with fewer documents than it started with.
//
// Structural, like its Bell counterpart, because the shape of the pipeline is what can be checked
// without a live county portal.

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

const pipeline = read('services', 'pipeline.ts');
const router = read('counties', 'router.ts');
const index = read('index.ts');
const filing = read('research', 'file-generic-document.ts');

/** Comments stripped — several of these files explain the defect by quoting the code it replaced. */
const codeOnly = (src: string) =>
  src
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

describe('every document the generic pipeline finds is handed over as it is found', () => {
  it('CONTROL: the push sites still exist — this whole file is vacuous otherwise', () => {
    // If `documents` stopped being the accumulator, every assertion below would pass trivially.
    expect(codeOnly(pipeline)).toContain('fileNow(documents, onDocument,');
  });

  it('NOTHING pushes to documents without notifying', () => {
    // The property that matters. A new push site added later must not silently go back to batching,
    // which is exactly how this diverged from Bell in the first place.
    const bare = codeOnly(pipeline).match(/(?<!allProcessed)\bdocuments\.push\(/g) ?? [];
    expect(bare, `${bare.length} raw documents.push() call(s) bypass fileNow`).toHaveLength(0);
  });

  it('all seven sites go through the helper', () => {
    const wired = codeOnly(pipeline).match(/fileNow\(documents, onDocument,/g) ?? [];
    expect(wired.length).toBe(7);
  });

  it('fileNow pushes AND notifies — not one or the other', () => {
    const at = pipeline.indexOf('function fileNow(');
    expect(at).toBeGreaterThan(-1);
    const fn = pipeline.slice(at, at + 900);
    expect(fn).toContain('list.push(item)');
    expect(fn).toContain('notify(item)');
  });

  it('a throwing caller cannot kill a run that is otherwise succeeding', () => {
    const at = pipeline.indexOf('function fileNow(');
    const fn = pipeline.slice(at, at + 900);
    expect(fn).toContain('catch');
  });
});

describe('the caller actually files, rather than merely being offered the chance', () => {
  it('the router passes onDocument to the generic pipeline', () => {
    // Assert the CALLER. An onDocument nobody supplies is the same as no onDocument.
    expect(codeOnly(router)).toContain('onDocument:');
    expect(codeOnly(router)).toContain('fileGenericDocumentNow(input.projectId, doc)');
  });

  it('filing goes through the duplicate check, not a bare insert', () => {
    // "check each document found to see if it is a duplicate or not" was the same sentence as
    // "immediately". A direct insert would satisfy immediacy and quietly drop the dedupe.
    expect(codeOnly(filing)).toContain('resilientInsertDocument(');
  });

  it('user uploads are not filed twice', () => {
    expect(codeOnly(filing)).toContain('doc.fromUserUpload');
  });
});

describe('the end-of-run write no longer destroys the previous run', () => {
  // Comments stripped BEFORE slicing: this block's own note quotes the delete it replaced, so a
  // window measured over the commented source both reads the prose and falls short of the code.
  const indexCode = codeOnly(index);
  const at = indexCode.indexOf('const pipelineDocs = r.documents');
  const block = indexCode.slice(at, at + 2200);

  it('CONTROL: the sweep is where this test thinks it is', () => {
    expect(at, 'the generic persistence block moved').toBeGreaterThan(-1);
    expect(block).toContain('research_documents');
  });

  it('does not delete the project documents before writing', () => {
    // The defect: `.delete().eq('research_project_id', projectId).eq('source_type', ...)` ran first,
    // so a re-run threw away what the last run found and a crash mid-write lost both.
    expect(block, 'the pre-insert delete is back').not.toContain('.delete()');
  });

  it('skips anything the incremental path already filed', () => {
    // Without this the sweep double-writes: it uses a plain insert, so nothing downstream would
    // catch it.
    expect(block).toContain('alreadyFiledThisRun(projectId, d)');
  });
});

describe('the filed-set outlives the sweep that reads it', () => {
  it('is opened before the library, so a library failure cannot cause duplicates', () => {
    const beginAt = index.indexOf('beginGenericFiling(projectId);');
    const libraryAt = index.indexOf('await beginFiling(');
    expect(beginAt).toBeGreaterThan(-1);
    expect(libraryAt).toBeGreaterThan(-1);
    expect(beginAt, 'the filed-set opens after the library it must survive').toBeLessThan(libraryAt);
  });

  it('is released only after the sweep, not alongside endFiling', () => {
    // endFiling runs earlier in the same handler. Clearing the filed-set there would leave the sweep
    // unable to tell what had landed, and it writes with a plain insert.
    const endFilingAt = index.indexOf('const filing = endFiling(projectId);');
    const sweepAt = index.indexOf('const pipelineDocs = r.documents');
    const releaseAt = index.indexOf('endGenericFiling(projectId); }');
    expect(endFilingAt).toBeGreaterThan(-1);
    expect(sweepAt).toBeGreaterThan(endFilingAt);
    expect(releaseAt, 'the filed-set is released before the sweep reads it').toBeGreaterThan(sweepAt);
  });
});

describe('the row shape has one definition', () => {
  const doc = (over: Partial<DocumentResult['ref']> = {}): DocumentResult => ({
    ref: {
      documentType: 'Warranty Deed',
      instrumentNumber: '2020-12345',
      volume: null,
      page: null,
      url: 'https://example.test/doc/1',
      recordingDate: '2020-03-04',
      grantors: ['SMITH, JOHN'],
      grantees: ['JONES, MARY'],
      ...over,
    },
  } as unknown as DocumentResult);

  it('builds the row the review screen reads', () => {
    const row = genericDocumentRow('p1', doc(), '2026-09-02T00:00:00.000Z');
    expect(row.research_project_id).toBe('p1');
    expect(row.source_type).toBe('property_search');
    expect(row.document_type).toBe('deed');
    expect(row.recording_info).toContain('2020-12345');
    expect(row.original_filename).toContain('SMITH, JOHN to JONES, MARY');
  });

  it('survives a document with almost nothing on it', () => {
    // A ref with no instrument, no parties and no type must not produce "undefined" on screen.
    const bare = { ref: {} } as unknown as DocumentResult;
    const row = genericDocumentRow('p1', bare, 'now');
    expect(row.document_type).toBe('other');
    expect(row.recording_info).toBeNull();
    expect(String(row.original_filename)).not.toContain('undefined');
  });

  it('normalises the types the UI has icons for', () => {
    expect(normaliseDocumentType('Subdivision Plat')).toBe('subdivision_plat');
    expect(normaliseDocumentType(null)).toBe('other');
  });

  it('the run-scoped key separates two genuinely different documents', () => {
    // CONTROL for the skip logic: if every document hashed alike, the sweep would drop all but one.
    expect(runScopedKey(doc())).not.toBe(runScopedKey(doc({ instrumentNumber: '2021-99999' })));
  });

  it('and matches the same document twice', () => {
    expect(runScopedKey(doc())).toBe(runScopedKey(doc()));
  });
});

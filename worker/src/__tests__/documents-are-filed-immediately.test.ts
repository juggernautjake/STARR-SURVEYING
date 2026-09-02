// worker/src/__tests__/documents-are-filed-immediately.test.ts
//
// The owner's requirement, verbatim:
//
//   "Make sure the system/worker knows to check each document found to see if it is a duplicate or
//    not… it should immediately be formatted and uploaded to the research platform and made
//    available to view. I don't want the research worker to compile the files/documents all slowly
//    over time and then upload them in a big group."
//
// ── WHAT WAS ALREADY TRUE, AND WHY IT NEEDED A GUARD ANYWAY ─────────────────────────────────────
//
// Investigated rather than assumed: the worker already uploads as it goes. `counties/bell/
// orchestrator.ts` calls `uploadDocumentIncremental` for deeds and plats as the scrapers find
// them, and `uploadScreenshotsIncremental` for map and viewer captures, at seven sites. Both
// helpers write the row through `resilientInsertDocument`, which consults the filing context and
// therefore runs the full cross-run duplicate check on every document, one at a time, as it lands.
//
// So nothing was batching. But nothing was STOPPING a batch either — every property below held by
// convention, and three of them are one careless edit away from silently reverting:
//
//   · Move `beginFiling` after the orchestrator and every incremental upload takes the
//     no-context path, which is a bare `.insert(row)`. Documents would still appear, immediately,
//     and would simply stop being deduplicated. Nothing would fail. Nothing would say so.
//   · Add a new capture site that only pushes into the end-of-run array, and those artifacts wait
//     for the run to finish while every other kind appears live — the inconsistency being invisible
//     until somebody notices one category behaving differently.
//   · Swap a `resilientInsertDocument` for a plain insert "to keep it simple" and lose the check.
//
// These tests are about the SHAPE of the pipeline, which is the only thing that can be checked
// without a live county portal.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
const orchestrator = readFileSync(
  join(__dirname, '..', 'counties', 'bell', 'orchestrator.ts'), 'utf8',
);
const uploader = readFileSync(
  join(__dirname, '..', 'services', 'artifact-uploader.ts'), 'utf8',
);

describe('documents are uploaded AS THEY ARE FOUND, not batched at the end', () => {
  it('the orchestrator uploads each document the moment it has it', () => {
    const calls = (orchestrator.match(/await uploadDocumentIncremental\(/g) ?? []).length;
    expect(calls, 'no incremental document upload — documents would batch').toBeGreaterThanOrEqual(3);
  });

  it('and each screenshot the moment it is captured', () => {
    const calls = (orchestrator.match(/await uploadScreenshotsIncremental\(/g) ?? []).length;
    expect(calls, 'no incremental screenshot upload').toBeGreaterThanOrEqual(3);
  });

  it('the end-of-run pass is a CATCH-UP, and is safe only because it deduplicates', () => {
    // persistCountyResults re-files the same artifacts under their final categories. That is
    // harmless ONLY because it goes through the deduplicating filer — as a bare insert it would
    // double every document in the project on every run.
    expect(index).toContain('uploadPipelineArtifacts(');
    const at = uploader.indexOf('export async function uploadPipelineArtifacts');
    expect(at).toBeGreaterThan(-1);
    expect(uploader.slice(at, at + 6000)).toContain('resilientInsertDocument');
  });
});

describe('every document is checked for duplicates as it is filed', () => {
  it('both incremental paths file through the deduplicating writer', () => {
    for (const fn of ['uploadDocumentIncremental', 'uploadScreenshotsIncremental']) {
      const at = uploader.indexOf(`export async function ${fn}`);
      expect(at, `${fn} is missing`).toBeGreaterThan(-1);
      // The body up to the next top-level export.
      const body = uploader.slice(at, at + 4000);
      expect(body, `${fn} must not bypass the duplicate check`).toContain('resilientInsertDocument');
    }
  });

  it('the writer consults the project library before inserting', () => {
    const at = uploader.indexOf('async function resilientInsertDocument');
    const body = uploader.slice(at, at + 1500);
    expect(body).toContain('filingContexts.get(projectId)');
    expect(body).toContain('fileResearchDocument');
  });

  it('THE ORDERING: the library opens BEFORE any research runs', () => {
    // The load-bearing one. With the context opened after the orchestrator, every incremental
    // upload takes the no-context path — a bare insert — and the duplicate check silently covers
    // only the tail of the run. Nothing errors; the guarantee just quietly stops holding.
    const opened = index.indexOf('await beginFiling(');
    const research = index.indexOf('runCountyResearch(');
    expect(opened, 'beginFiling is not called').toBeGreaterThan(-1);
    expect(research, 'runCountyResearch is not called').toBeGreaterThan(-1);
    expect(opened, 'the library must open before the research starts').toBeLessThan(research);
  });

  it('a failed library load degrades to writing, never to dropping', () => {
    // A document lost because its bookkeeping was unavailable is a worse outcome than a duplicate.
    const at = uploader.indexOf('async function resilientInsertDocument');
    expect(uploader.slice(at, at + 3000)).toMatch(/No filing context: the original behaviour/i);
  });
});

describe('what the operator can see while it runs', () => {
  it('the status endpoint reports progress from the tracker, not from a guess', () => {
    expect(index).toContain('runProgress.get(projectId)?.snapshot()');
  });

  it('the run records its phase durably as it goes, so a poll that misses the worker still knows', () => {
    expect(index).toMatch(/void recordRunPhase\(\s*projectId/);
  });
});

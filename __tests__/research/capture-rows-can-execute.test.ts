import { describe, it, expect } from 'vitest';
import { readSource, readCode } from '../helpers/read-source';

// ── EVERY IMAGERY CAPTURE WAS DISCARDED AT THE INSERT ───────────────────────────────────────────
//
// Found by an eight-lens audit on 2026-09-03 and confirmed against the live database. Four row
// builders write to `research_documents`; three could not execute.
//
// `capture-runner.ts` failed FOUR ways in one statement: source_type 'pipeline_capture' (23514),
// `public_url` (42703 — the column is `storage_url`), `ocr_text` (42703 — it is `extracted_text`),
// processing_status 'stored' (23514), plus 13 of its 14 document_type values (23514).
//
// The proof it had never run:
//     rows with source_type = 'pipeline_capture'  →  0 of 697
//     rows with content_sha256 set                →  0 of 697
//
// `capture-runner.ts` is the only originating writer of `content_sha256`. Zero of 697 is not a
// feature nobody uses; it is a feature that has never once completed. Every satellite view, oblique,
// street view, GIS capture and generated drawing went to storage and was then dropped on the way to
// the row that would let anyone find it — which is why the owner's first-priority imagery produces
// nothing even on the runs where it runs.

describe('the capture row builder names real columns', () => {
  const runner = readCode('worker/src/research/capture-runner.ts');

  it('CONTROL: stripping kept the code and dropped the prose', () => {
    expect(runner).toContain('research_project_id');
    expect(runner).not.toContain('0 of 697');
  });

  it('uses storage_url, not public_url', () => {
    expect(runner).toContain('storage_url:');
    expect(runner, 'public_url has never been a column on this table').not.toMatch(/^\s*public_url:/m);
  });

  it('uses extracted_text, not ocr_text', () => {
    expect(runner).toContain('extracted_text:');
    expect(runner, 'ocr_text has never been a column on this table').not.toMatch(/^\s*ocr_text:/m);
  });
});

describe('the seed admits what the writers emit', () => {
  const seed = readSource('seeds/626_research_documents_capture_columns.sql');

  it('adds the column three writers reference', () => {
    expect(seed).toMatch(/ADD COLUMN IF NOT EXISTS harvest_metadata/);
  });

  it('admits pipeline_capture as an origin', () => {
    // Distinct from property_search deliberately: a deed the clerk returned and a satellite view we
    // commissioned are different kinds of evidence.
    expect(seed).toMatch(/'pipeline_capture'/);
  });

  it('admits every document_type the capture planner emits', () => {
    // 13 of 14 were rejected. Missing one puts us straight back to silently discarding that kind.
    for (const kind of [
      'aerial', 'aerial_wide', 'aerial_close', 'aerial_historical', 'aerial_neighbours',
      'adjoiner_aerial', 'historical_aerial', 'oblique', 'oblique_aerial',
      'street_view', 'streetview', 'cad_gis', 'drawing',
    ]) {
      expect(seed, `${kind} would still be rejected`).toContain(`'${kind}'`);
    }
  });

  it('keeps every type that already files', () => {
    // Widening a CHECK must not narrow it. Dropping one of these would stop a working path.
    for (const kind of ['deed', 'plat', 'survey', 'appraisal_record', 'gis_map', 'other']) {
      expect(seed, `${kind} was dropped from the CHECK`).toContain(`'${kind}'`);
    }
  });

  it('admits "stored" — bytes down, nothing read yet', () => {
    // A captured aerial has no text. `pending` queues it forever for work that will never happen;
    // `analyzed` claims an analysis nobody ran.
    expect(seed).toMatch(/'stored'/);
  });
});

describe('the app-side 500 is fixed too', () => {
  const route = readCode('app/api/admin/research/[projectId]/duplicates/route.ts');

  it('selects a column that exists', () => {
    // PostgREST rejects a SELECT naming an unknown column outright, so this returned 500 on every
    // request — making the 88 rows flagged `duplicate_of` unreachable from the UI built to show them.
    expect(route).toContain('storage_url');
    expect(route, 'public_url is back — this route will 500 again').not.toContain('public_url');
  });
});

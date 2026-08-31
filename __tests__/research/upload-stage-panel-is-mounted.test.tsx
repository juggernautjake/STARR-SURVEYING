// __tests__/research/upload-stage-panel-is-mounted.test.tsx — Phase B1a.
//
// Fifth extraction from `[projectId]/page.tsx`: Stage 1, where documents go in and the property is
// described. 61 lines out.
//
// ── THE SECTION CARRIES A NOTE THAT EXISTS FOR A REASON ─────────────────────────────────────────
//
// `research-pipeline-note` tells the operator, in words, that this button starts the IN-APP
// analysis: it cannot buy a document and the per-run spend limit does not apply. It exists because
// the owner started a run from this screen expecting a $10 limit and a TexasFile purchase and got
// neither — `research_document_purchases` has 0 rows after every run started here, and nothing on
// the screen said why.
//
// `pipeline-note-is-present.test.ts` guards the note's wording and now points at the section. This
// file guards the thing that guard cannot: that the page still mounts the section at all.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PAGE = read('app/admin/research/[projectId]/page.tsx');
const SECT = read('app/admin/research/[projectId]/_sections/UploadStagePanel.tsx');

describe('the page still mounts it', () => {
  it('imports the section', () => {
    expect(PAGE).toContain("import UploadStagePanel from './_sections/UploadStagePanel'");
  });

  it('renders it on the upload stage', () => {
    expect(PAGE).toContain("{currentStage === 'upload' && (");
    expect(PAGE).toMatch(/<UploadStagePanel\s/);
  });

  it('with no second guard smuggled onto the same line', () => {
    // `{false && <UploadStagePanel` passed every other assertion when this was tried on the stage-2
    // panel an hour ago.
    const line = PAGE.split('\n').find((l) => l.includes('<UploadStagePanel'))!;
    expect(line.trim(), `unexpected wrapper: ${line.trim()}`).toBe('<UploadStagePanel');
  });

  it('passes the documents and all four resolved search defaults', () => {
    const at = PAGE.indexOf('<UploadStagePanel');
    const el = PAGE.slice(at, PAGE.indexOf('/>', at));
    for (const p of ['documents={documents}', 'address=', 'county=', 'parcelId=', 'ownerName=']) {
      expect(el, `${p} is missing`).toContain(p);
    }
  });

  it('and the owner still comes from analysis_metadata — G10 must not come back here either', () => {
    const at = PAGE.indexOf('<UploadStagePanel');
    expect(PAGE.slice(at, PAGE.indexOf('/>', at))).toContain('projectOwnerName(project)');
  });

  it('the old inline block is gone', () => {
    expect(PAGE).not.toContain('<DocumentUploadPanel');
  });
});

describe('the section keeps both panels and the note', () => {
  it('renders the upload panel, the note and the search panel, in that order', async () => {
    // The note sits BETWEEN the header and the upload control on purpose: it has to be read before
    // somebody clicks the thing it is about.
    //
    // Two probe bugs, both caught by the answer being absurd rather than by reading the code:
    //   · `DocumentUploadPanel` matched the IMPORT at the top, so the panels appeared to come
    //     before the header;
    //   · then `research-pipeline-note` matched this section's own header COMMENT, which explains
    //     what the note is for. Eighth guard today to trip over the house style of long comments.
    const { stripComments } = await import('../../scripts/audit-starr-assumptions.mjs');
    const code = stripComments(SECT);
    expect(code).toContain('export default function UploadStagePanel');

    const order = ['<div className="research-step-header"', 'research-pipeline-note',
      '<DocumentUploadPanel', '<PropertySearchPanel']
      .map((n) => code.indexOf(n));
    expect(order.every((i) => i > -1), 'something went missing in the move').toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('shares one reload callback between the two panels', () => {
    // Both used to inline `() => { loadDocuments(); loadProject(); }`. Two copies of one reload is
    // how they drift into reloading different things.
    expect(SECT).toContain('onDocumentsChanged={onDocumentsChanged}');
    expect(SECT).toContain('onImported={onDocumentsChanged}');
  });

  it('resolves nothing itself', async () => {
    // Stripped: this section's header comment names `projectOwnerName` while explaining why it must
    // not appear in the code.
    const { stripComments } = await import('../../scripts/audit-starr-assumptions.mjs');
    const code = stripComments(SECT);
    expect(code).toContain('export default function UploadStagePanel');
    expect(code).not.toContain('projectOwnerName');
    expect(code).not.toContain('router.push');
  });
});

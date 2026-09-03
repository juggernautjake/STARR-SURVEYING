// __tests__/research/pipeline-note-is-present.test.ts — Phase B6.
//
// ── THE CONFUSION THIS ENDS ─────────────────────────────────────────────────────────────────────
//
// There are two research pipelines and, until this slice, nothing on screen said which one a given
// button starts:
//
//   project page → "Initiate Research & Analysis"   runs IN THE APP.  No budget. Buys nothing.
//   Pipeline tab → "New Batch Job"                  runs on the WORKER. Budget. Buys documents.
//
// The owner started a run from the project screen expecting the $10 spend limit to apply and a
// TexasFile purchase to happen, and got neither — because that engine has neither. Then spent time
// looking for a spend control that could not have been on that screen.
//
// It is a CONTENT problem, not a styling one. No amount of layout work fixes a screen that is
// quietly the wrong engine, and `research_document_purchases` having 0 rows after every run ever
// started from there is the same fact stated in the database.
//
// ── WHY THE CLAIM IS ASSERTED, NOT JUST THE MARKUP ──────────────────────────────────────────────
//
// The note says the app path never contacts the worker. If that ever stops being true — someone
// wires the project page to the worker — the note becomes a lie, and a confidently wrong sentence
// on a screen is worse than no sentence. So this pins BOTH halves: the note exists, and the fact it
// asserts still holds.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '../../scripts/audit-starr-assumptions.mjs';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
  .split('\r\n').join('\n')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
  .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');   // JSX comments too

// ── THE NOTE MOVED, AND THIS FOLLOWED IT ─────────────────────────────────────────────────────
//
// The upload stage was extracted into _sections/UploadStagePanel.tsx (B1a), so the note lives
// there now and this check went red. Pointing it at the section ALONE would be weaker than what
// it replaced: a section nothing mounts satisfies it just as well, and this note exists precisely
// because a screen said nothing about which engine it starts.
//
// So `page` reads the SECTION for the content, and a separate assertion holds that the page still
// mounts the section. Fifth guard today to follow an extraction; every one of those reds was the
// guard working.
const PAGE = 'app/admin/research/[projectId]/_sections/UploadStagePanel.tsx';
const MOUNTER = 'app/admin/research/[projectId]/page.tsx';
const CSS = 'app/admin/styles/AdminResearch.css';

describe('the project page says which engine its button starts', () => {
  const page = read(PAGE);   // `read` already strips comments — see its definition above.

  it('the page still mounts the section that holds it', () => {
    expect(read(MOUNTER)).toMatch(/<UploadStagePanel\s/);
  });

  it('renders the note', () => {
    // ── `toContain('research-pipeline-note')` WAS NOT ENOUGH ─────────────────────────────────────
    //
    // The button inside the note carries `research-pipeline-note__link`, which CONTAINS that
    // string. So deleting the class from the note's own `<div>` left the assertion passing on the
    // link's class instead — the note would render unstyled and this would stay green.
    //
    // Exactly the flaw the county-check guard had (C2), where `research-modal__county-note`
    // matched while the `--warn` variant had been renamed away. Caught by mutation both times; the
    // fix both times is to assert the attribute, not a substring of it.
    expect(page).toContain('className="research-pipeline-note"');
    expect(page).toContain('role="note"');
  });

  // ── THE NOTE USED TO SAY THE OPPOSITE OF WHAT THE BUTTON DID ───────────────────────────────
  //
  // Until 2026-09-03 these two tests pinned "does not purchase paid documents" and "spend limit
  // does not apply", and a third pinned a "Use a batch job" link. The Start button on the same
  // screen hands off to the research WORKER with the project's paid-documents flag and a $2
  // default ceiling, and the batch queue the link pointed to is created and never started. The
  // guard kept a false sentence green for as long as the sentence stayed. Found by the 2026-09-03
  // platform audit (app-ui C1). The note now tells the truth in both states, and the test checks
  // that it is wired to the fact it reports.
  it('says which run the button starts, and whether that run can spend', () => {
    expect(page).toContain('Start research runs the research worker');
    expect(page).toMatch(/Paid documents are <strong>on<\/strong>/);
    expect(page).toMatch(/Paid documents are <strong>off<\/strong>/);
    expect(page).toContain('default');
    expect(page).toContain('$2');
    // No more pointing at the batch job — it never runs.
    expect(page).not.toContain('Use a batch job');
    expect(page).not.toContain('does <strong>not</strong> purchase');
  });

  it('the paid-documents sentence is driven by the project flag the run inherits', () => {
    expect(page).toContain('{allowPaidDocuments ? (');
    expect(page).toMatch(/allowPaidDocuments: boolean/);
    // And the page passes the real column, with the same `!== false` default the pipeline route
    // applies when it builds the run's settings.
    const mounter = read(MOUNTER);
    const at = mounter.indexOf('<UploadStagePanel');
    const mount = mounter.slice(at, mounter.indexOf('/>', at));
    expect(mount).toMatch(/allowPaidDocuments=\{[\s\S]*allow_paid_documents !== false/);
  });

  it('is styled — an unstyled note is a paragraph nobody reads', () => {
    const css = read(CSS);
    expect(css).toContain('.research-pipeline-note');
    expect(css).toContain('.research-pipeline-note__link');
  });
});

describe('the claim the note makes is still true', () => {
  it('the app analyze path still never contacts the worker', () => {
    // If this fails, the project page HAS been wired to the worker — good news, and the note is
    // now wrong. Update both together; do not silence this.
    const route = read('app/api/admin/research/[projectId]/analyze/route.ts');
    const service = read('lib/research/analysis.service.ts');
    expect(route, 'analyze route now references the worker — the note is stale').not.toContain('WORKER_URL');
    expect(service, 'analysis.service now references the worker — the note is stale').not.toContain('WORKER_URL');
  });

  it('the batch path DOES contact the worker — so the note sends people somewhere real', () => {
    // Control. Without this the assertion above could pass in a world where nothing reaches the
    // worker at all, and the note would be directing people to an equally powerless screen.
    expect(read('app/api/admin/research/batch/route.ts')).toContain('WORKER_URL');
  });
});

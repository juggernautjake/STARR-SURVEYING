// The toggle is REACHED, not merely written.
//
// A pure decision module with eleven passing tests is worth nothing if no form sets the flag and no
// route persists it. That is this repo's most common defect, and it has bitten twice in one session:
// a Hub Customizer built on a modal nothing mounted, and a watchdog whose policy tests all passed
// while it queried a table that does not exist.
//
// So this asserts the chain end to end:
//
//     form state → POST body → API destructure → insert → column (seed 620)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '../../scripts/derive-portal-tabs.mjs';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const FORM = 'app/admin/research/_tabs/ProjectsTab.tsx';
const API = 'app/api/admin/research/route.ts';
const SEED = 'seeds/620_research_allow_paid_documents.sql';

describe('the paid-documents toggle is wired end to end', () => {
  it('the form holds the flag in state and renders a control for it', () => {
    const src = read(FORM);
    expect(src).toMatch(/allow_paid_documents:\s*true/);
    expect(src).toContain('data-testid="allow-paid-documents"');
    expect(src).toMatch(/checked=\{newProject\.allow_paid_documents\}/);
  });

  it('the form SENDS it — the spread is what carries it, so the spread must survive', () => {
    // `body: JSON.stringify({ ...newProject, name })` is the only reason the flag reaches the API.
    // Someone replacing the spread with an explicit field list would silently drop it, and every
    // other test here would still pass.
    expect(read(FORM)).toMatch(/JSON\.stringify\(\{\s*\.\.\.newProject/);
  });

  it('the form resets it to true after a create, not to undefined', () => {
    // The reset builds a fresh object literally. Omitting the field there makes the NEXT project
    // send `undefined`, which the API reads as "allowed" — right by luck, and wrong the day the
    // API's default flips.
    const reset = read(FORM).match(/setNewProject\(\{[^}]*\}\)/g)?.find((m) => m.includes('parcel_id'));
    expect(reset, 'the post-create reset was not found').toBeTruthy();
    expect(reset!).toContain('allow_paid_documents: true');
  });

  it('the API destructures it from the body and persists it', () => {
    const src = stripComments(read(API));
    expect(src).toMatch(/const \{[^}]*allow_paid_documents[^}]*\} = body;/);
    expect(src).toMatch(/allow_paid_documents:\s*allow_paid_documents === false \? false : true/);
  });

  it('only an explicit false disables purchasing', () => {
    // The distinction that keeps old clients working. `undefined`, `null` and a malformed value all
    // have to mean "today's behaviour" — a truthiness check would read `undefined` as disabled and
    // silently make every legacy caller's runs cheaper and thinner with no explanation.
    const src = stripComments(read(API));
    expect(src).toContain('=== false ? false : true');
    expect(src).not.toMatch(/allow_paid_documents:\s*!!allow_paid_documents/);
    expect(src).not.toMatch(/allow_paid_documents:\s*Boolean\(/);
  });

  it('the column exists with the default that preserves behaviour', () => {
    const seed = read(SEED);
    expect(seed).toMatch(/ADD COLUMN IF NOT EXISTS allow_paid_documents boolean NOT NULL DEFAULT true/);
  });

  it('the seed explains why the default is true rather than false', () => {
    // The reasoning is the part that stops somebody "improving" it to false later.
    //
    // Asserted on WORDS, not a sentence. The first version matched an exact phrase and failed
    // because the seed wraps it across a line — the fourth time today a "must contain this text"
    // check has been defeated by formatting rather than by content. Collapse whitespace first and
    // look for the ideas.
    const flat = read(SEED).replace(/\s+/g, ' ');
    expect(flat).toMatch(/DEFAULT true/);
    expect(flat).toMatch(/silently/i);
    expect(flat).toMatch(/existing project/i);
  });
});

// ── THE OTHER HALF: the notice REACHES A READER ────────────────────────────────────────────────
//
// The block above proves the flag is stored. It says nothing about whether anyone is ever TOLD that
// a run was thinner because of it — and paid-documents.ts states in its own header that the telling
// is the point ("`reasonForReader` is not decoration").
//
// Found on 2026-08-30 in exactly the state this repo keeps producing: the route computed
// `paidDocumentsNotice`, returned it on every analyze-status response, and NOTHING rendered it. The
// route's own tests passed, the module's eleven tests passed, and the reader still could not tell
// "no deed exists" from "you told me not to look".
//
// So these assert the CALLER, not the callee. A test that only checked the panel imports something
// would have passed all day while the panel rendered nothing.

// ── THE GUARD FOLLOWED THE CODE, AND FOUND THE FEATURE GONE ────────────────────────────────────
//
// This named ResearchAnalysisPanel, which the one-view rebuild retired and 2026-09-02 deleted. The
// notice did not move with it: the analyze route went on computing `paidDocumentsNotice` and putting
// it on the response, and NOTHING fetched that route any more. "Why did this run buy nothing from
// TexasFile?" had no answer on screen — and the reachability guard was reporting that route as dead
// at the same time, two guards describing one dropped feature from opposite ends.
//
// Reading and rendering now live in two files, so this asserts both halves. That is stronger than
// what it replaced, not weaker: a hook that read the field into state it never rendered would
// satisfy the reading half alone, and that is the exact defect this file was written for.
const HOOK = 'app/admin/research/components/useRunState.ts';
const PANEL = 'app/admin/research/components/ResearchRunView.tsx';
const STATUS_ROUTE = 'app/api/admin/research/[projectId]/analyze/route.ts';
const PANEL_CSS = 'app/admin/styles/AdminResearch.css';

describe('the paid-documents notice reaches the reader', () => {
  it('the status route puts the notice on the response', () => {
    const src = stripComments(read(STATUS_ROUTE));
    expect(src).toMatch(/paidDocumentsNotice:\s*paidDocumentsNotice\(/);
  });

  it('the route counts BOTH skip reasons, not just the toggle', () => {
    // `no_vendor_credentials` is the setup failure and `paid_disabled` is the deliberate choice.
    // Counting only one produces a notice that says nothing was skipped when plenty was.
    const src = stripComments(read(STATUS_ROUTE));
    expect(src).toContain('paid_disabled');
    expect(src).toContain('no_vendor_credentials');
  });

  it('THE HOOK READS THE FIELD — the assertion that was missing', () => {
    const src = stripComments(read(HOOK));
    expect(src).toMatch(/data\.paidDocumentsNotice/);
  });

  it('THE HOOK ACTUALLY CALLS THE ROUTE — the half that went missing', () => {
    // The field was being read off a response nobody requested. Asserting the parse without
    // asserting the fetch is how a dropped feature kept a green test.
    const src = stripComments(read(HOOK));
    expect(src).toContain(`/analyze`);
    expect(src).toContain(`setPaidNotice`);
  });

  it('THE VIEW TAKES IT FROM THE SHARED STATE, not a second opinion', () => {
    // One run state. A view fetching its own copy is how four panels came to contradict each other
    // about one run.
    expect(stripComments(read(PANEL))).toContain(`const { paidDocumentsNotice } = state;`);
    expect(stripComments(read('lib/research/run-state.ts'))).toContain(`paidDocumentsNotice: string | null;`);
  });

  it('THE PANEL RENDERS IT — reading it into state is not showing it', () => {
    const src = stripComments(read(PANEL));
    // Rendered conditionally, and the value itself must appear inside the element.
    expect(src).toMatch(/\{paidDocumentsNotice\s*&&/);
    expect(src).toContain('data-testid="paid-documents-notice"');
    expect(src).toMatch(/\{paidDocumentsNotice\}/);
  });

  it('a fetch failure leaves the notice unset rather than asserting nothing was skipped', () => {
    // The dangerous default. If a failed fetch set the notice to a cheerful empty string, an
    // unreachable API would render as "everything was retrieved" — a false all-clear, which is
    // worse than silence because it is a claim.
    const src = stripComments(read(HOOK));
    expect(src).toMatch(/setPaidNotice\(data\.paidDocumentsNotice \?\? null\)/);
  });

  it('the notice has a style, so it reads as a caveat rather than a stray line', () => {
    // Most `.ra-results__*` classes in this panel have no rule at all. An unstyled caveat is
    // indistinguishable from body copy, which for a warning is the same as not showing it.
    expect(read(PANEL_CSS)).toMatch(/\.ra-results__paid-notice\s*\{/);
  });
});

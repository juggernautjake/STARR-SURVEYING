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

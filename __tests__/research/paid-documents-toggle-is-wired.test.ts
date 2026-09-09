// __tests__/research/paid-documents-toggle-is-wired.test.ts — the spend switch, end to end.
//
// Seed 620 gave every research project `allow_paid_documents`. This file used to pin the switch to
// the CREATE form. On 2026-09-09 the owner redesigned that form as an intake-only modal — "The modal
// should not handle all of the settings, but should just be used to take in information and set
// things up. Then once the project has been created and the user is on the first main page, we will
// design it so that they can easily set all of the settings for the research run" — so the switch
// now lives on the research page and the re-run dialog, and the API keeps the default it always had.
//
// What must stay true: the create form does NOT silently send `false`; the API only disables
// purchasing on an explicit `false`; and the run surfaces that DO carry the switch send it.

import { describe, it, expect } from 'vitest';
import { readSource } from '../helpers/read-source';

const stripComments = (s: string) =>
  s.replace(/^[ \t]*\/\/[^\n]*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const read = (p: string) => readSource(p).split('\r\n').join('\n');

const MODAL = 'app/admin/research/components/NewResearchProjectModal.tsx';
const API = 'app/api/admin/research/route.ts';
const SEED = 'seeds/620_research_allow_paid_documents.sql';
const PAGE = 'app/admin/research/[projectId]/page.tsx';
const UPLOAD_STAGE = 'app/admin/research/[projectId]/_sections/UploadStagePanel.tsx';

describe('the paid-documents switch is wired end to end', () => {
  it('the intake modal does not carry it — and therefore cannot send false by accident', () => {
    const src = stripComments(read(MODAL));
    expect(src).not.toContain('allow_paid_documents');
    // The POST body is a spread of the form state; the state has no such key, so the API sees
    // `undefined` and keeps the project's default (allowed).
    expect(src).toMatch(/JSON\.stringify\(\{\s*\.\.\.form/);
  });

  it('the research page and the upload stage carry it instead', () => {
    expect(read(PAGE)).toContain('allow_paid_documents');
    expect(read(UPLOAD_STAGE)).toContain('allow_paid_documents');
  });

  it('the API destructures it from the body and persists it', () => {
    const src = stripComments(read(API));
    expect(src).toMatch(/const \{[^}]*allow_paid_documents[^}]*\} = body;/);
    expect(src).toMatch(/allow_paid_documents:\s*allow_paid_documents === false \? false : true/);
  });

  it('only an explicit false disables purchasing', () => {
    // The distinction that keeps every client working. `undefined`, `null` and a malformed value all
    // mean "today's behaviour" — a truthiness check would read the modal's `undefined` as disabled
    // and silently make every new project's runs cheaper and thinner with no explanation.
    const src = stripComments(read(API));
    expect(src).toContain('=== false ? false : true');
    expect(src).not.toMatch(/allow_paid_documents:\s*!!allow_paid_documents/);
  });

  it('PATCH accepts it too, so the switch is not write-once', () => {
    const src = stripComments(read(API));
    expect(src).toMatch(/updates\.allow_paid_documents !== undefined/);
  });

  it('the seed exists and defaults the column to true', () => {
    const seed = read(SEED);
    expect(seed).toContain('allow_paid_documents');
    expect(seed).toMatch(/DEFAULT\s+true/i);
  });
});

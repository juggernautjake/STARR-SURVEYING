// __tests__/admin/lead-reply-styling-polish.test.ts
//
// LR8 of lead-reply-expansion-2026-06-18.md — three styling passes.
// Locks the focus rings, hover transitions, mobile-responsive header
// collapse, and prefers-reduced-motion guards across the four surfaces
// the conversation thread spans:
//   1. ReplyDialog composer (input focus, toolbar hover, send hover-lift)
//   2. RepliesList history (focus-visible row ring, mobile collapse)
//   3. LeadNotesCard composer (textarea focus, icon-btn focus, save hover-lift)
//   4. JobOriginatingLead back-link (link hover-lift + focus ring)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('ReplyDialog — focus + hover polish', () => {
  const SRC = read('app/admin/leads/[id]/ReplyDialog.tsx');

  it("input :focus draws the brand-tinted focus ring", () => {
    expect(SRC).toMatch(/input\[data-testid='reply-to'\]:focus[\s\S]{0,300}box-shadow:\s*0 0 0 3px color-mix/);
  });

  it("contenteditable editor :focus has an inset ring (no layout shift)", () => {
    expect(SRC).toMatch(/role='textbox'\]\[data-testid='reply-editor'\]:focus[\s\S]{0,200}inset 0 0 0 2px/);
  });

  it("templates / AI / emoji toggles hover with a soft brand tint", () => {
    expect(SRC).toMatch(/button\[data-testid='reply-templates-toggle'\]:hover/);
    expect(SRC).toMatch(/button\[data-testid='reply-ai-toggle'\]:hover/);
    expect(SRC).toMatch(/button\[data-testid='reply-emoji-toggle'\]:hover/);
  });

  it("Send button hover-lifts + deepens the shadow", () => {
    expect(SRC).toMatch(/button\[data-testid='reply-send'\]:not\(:disabled\):hover[\s\S]{0,200}translateY\(-1px\)/);
  });

  it("honors prefers-reduced-motion", () => {
    expect(SRC).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe('RepliesList — focus-visible ring + mobile collapse', () => {
  const SRC = read('app/admin/leads/[id]/RepliesList.tsx');

  it("expand-row header gets a focus-visible ring", () => {
    expect(SRC).toMatch(/\.lead-detail__reply-header:focus-visible[\s\S]{0,200}box-shadow: inset 0 0 0 2px/);
  });

  it("collapses the header onto two rows under 520px", () => {
    expect(SRC).toMatch(/@media \(max-width: 520px\)[\s\S]{0,400}grid-template-areas:/);
  });
});

describe('LeadNotesCard — focus + hover polish', () => {
  const SRC = read('app/admin/leads/[id]/LeadNotesCard.tsx');

  it("textarea focus draws the brand-tinted ring", () => {
    expect(SRC).toMatch(/\.office-notes__textarea:focus[\s\S]{0,200}box-shadow:\s*0 0 0 3px/);
  });

  it("icon buttons focus-visible target accent on keyboard", () => {
    expect(SRC).toMatch(/\.office-notes__icon-btn:focus-visible/);
  });

  it("Add-note button hover-lifts + has a focus ring", () => {
    expect(SRC).toMatch(/\.office-notes__save:not\(:disabled\):hover[\s\S]{0,200}translateY\(-1px\)/);
    expect(SRC).toMatch(/\.office-notes__save:focus-visible/);
  });

  it("honors prefers-reduced-motion", () => {
    expect(SRC).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe('JobOriginatingLead — link hover-lift + focus ring', () => {
  const SRC = read('app/admin/jobs/[id]/JobOriginatingLead.tsx');

  it("link gets a className so the jsx style block can target it", () => {
    expect(SRC).toMatch(/className="job-detail__originating-lead-link"/);
  });

  it("link hover-lifts + deepens the shadow", () => {
    expect(SRC).toMatch(/\.job-detail__originating-lead-link:hover[\s\S]{0,200}translateY\(-1px\)/);
  });

  it("link focus-visible draws a focus ring + keeps the depth shadow", () => {
    expect(SRC).toMatch(/\.job-detail__originating-lead-link:focus-visible/);
  });

  it("honors prefers-reduced-motion", () => {
    expect(SRC).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

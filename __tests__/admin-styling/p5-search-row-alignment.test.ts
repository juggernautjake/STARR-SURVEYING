// __tests__/admin-styling/p5-search-row-alignment.test.ts
//
// Slice P5 — user feedback: "any search bars that exist should not
// be so wide. Please just make them a normal width. Also fix the
// vertical positioning issues where not all of the buttons and stuff
// are in vertical alignment."
//
// Source-lock for the three pages we touched in this sweep:
//   /admin/jobs       — search form capped at 380px, Deleted button 36px
//   /admin/contacts   — search form capped at 380px, all row controls 36px
//   /admin/employees  — list-view role/status selects pinned to 36px
//
// These are CSS / inline-style assertions only; UI is not rendered.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/jobs — search row width + Deleted button height', () => {
  it("caps the search form at ~380px (no longer flex:1)", () => {
    const CSS = read('app/admin/styles/AdminJobs.css');
    expect(CSS).toMatch(/\.jobs-page__search-form\s*\{[\s\S]*?flex:\s*0 1 380px/);
  });

  it("the .jobs-page__search-form block itself does not contain `flex: 1` (stretching)", () => {
    const CSS = read('app/admin/styles/AdminJobs.css');
    const blockMatch = CSS.match(/\.jobs-page__search-form\s*\{([^}]*)\}/);
    expect(blockMatch).not.toBeNull();
    expect(blockMatch![1]).not.toMatch(/flex:\s*1\s*;/);
  });

  // admin-ui-alignment-2026-08-15 — this used to assert the literal `height: 36`. The row moved to
  // the token, because `.jobs-page__search` is a typeless <input> and now matches forms.css's
  // `input:not([type])` rule at 40px, which the page's own 36px could never outrank. Locking a
  // literal here is what let the row drift in the first place: the number changed and the intent
  // did not. The assertion is now the intent — the Deleted toggle reads the same height token as
  // the controls beside it.
  // ── SCOPED TO THE TOGGLE'S OWN STYLE OBJECT (2026-08-22) ──────────────────────────────────────
  //
  // The negative assertion used to be `not.toMatch(/height:\s*36,[\s\S]*?Deleted/)` — a regex over
  // the WHOLE FILE, which reads as "no literal 36 anywhere before the word Deleted". It went red
  // when a different control entirely — the delete overlay on a job card — was raised from 28px to
  // 36px to clear the tap-target floor. That is the opposite of a regression, and the test could
  // not tell the difference because it never looked at which control it was reading.
  //
  // So it reads the toggle's own object now: everything between `setShowDeleted(!showDeleted)` and
  // the end of its `style={{ … }}`. Same intent, and it can no longer be tripped by a number that
  // belongs to something else.
  it('the Deleted toggle button takes its height from the shared token, not a literal', () => {
    const SRC = read('app/admin/jobs/_tabs/JobsTab.tsx');
    const toggle = SRC.match(/setShowDeleted\([\s\S]{0,1500}?\}\}/);
    expect(toggle, 'could not find the Deleted toggle button in app/admin/jobs/_tabs/JobsTab.tsx').not.toBeNull();
    expect(toggle![0]).toMatch(/height:\s*'var\(--button-height\)'/);
    expect(toggle![0]).not.toMatch(/height:\s*\d+\s*,/);
  });

  it('the search row controls read the same token', () => {
    const CSS = read('app/admin/styles/AdminJobs.css');
    expect(CSS).toMatch(
      /\.jobs-page__search,\s*\.jobs-page__search-btn,\s*\.jobs-page__view-toggle\s*\{[\s\S]*?height:\s*var\(--button-height\)/,
    );
  });
});

describe('/admin/contacts — search row controls share a 36px baseline', () => {
  const SRC = read('app/admin/contacts/page.tsx');

  it('caps the search form at ~380px (no longer `1 1 280px` growing)', () => {
    expect(SRC).toMatch(/flex:\s*'0 1 380px'/);
  });

  it('inputStyle pins to 36px box-sizing:border-box', () => {
    expect(SRC).toMatch(/const inputStyle:[\s\S]*?height:\s*36,[\s\S]*?boxSizing:\s*'border-box'/);
  });

  it('secondaryButtonStyle pins to 36px box-sizing:border-box', () => {
    expect(SRC).toMatch(/const secondaryButtonStyle:[\s\S]*?height:\s*36,[\s\S]*?boxSizing:\s*'border-box'/);
  });

  it('chipStyle pins to 36px box-sizing:border-box (search row label filters)', () => {
    expect(SRC).toMatch(/const chipStyle:[\s\S]*?height:\s*36,[\s\S]*?boxSizing:\s*'border-box'/);
  });
});

describe('/admin/employees — list-view selects share the 36px baseline', () => {
  const SRC = read('app/admin/employees/page.tsx');

  it('roleFilter <select> is height: 36 box-sizing border-box', () => {
    expect(SRC).toMatch(/value=\{roleFilter\}[\s\S]{0,200}/); // sanity: tag exists
    expect(SRC).toMatch(/minWidth:\s*'140px',\s*height:\s*36,\s*boxSizing:\s*'border-box'/);
  });

  it('statusFilter <select> is height: 36 box-sizing border-box', () => {
    expect(SRC).toMatch(/minWidth:\s*'120px',\s*height:\s*36,\s*boxSizing:\s*'border-box'/);
  });
});
